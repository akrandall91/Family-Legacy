// ============================================================
// FAMILY LEGACY PLATFORM — Google Apps Script backend (Code.gs)
// Rowe / Randall Family
// ============================================================
//
// What this is: a Google Apps Script Web App that turns a Google Sheet
// into a simple JSON API for the static index.html front end. Records
// are stored as JSON blobs in a `record_json` column (one row per
// person/branch/event/etc.) rather than flattened into many columns,
// because family records have nested relationships, tags, sources,
// dates, and media links that don't map cleanly onto spreadsheet cells.
//
// NOT SECURE — READ BEFORE DEPLOYING OR EDITING
// This script is meant to be deployed with:
//   Execute as:      Me
//   Who has access:  Anyone
// That makes it easy for a static GitHub Pages site to call, but it also
// means there is NO real authentication or authorization here. Anyone who
// finds the deployed /exec URL can call every action below, including
// saveRecord/deleteRecord. Treat every row in the Sheet as public data,
// the same way the front end treats data/family-legacy-data.js as public.
// Do not put sensitive living-person details in this Sheet either.
//
// Supported API actions (see doGet / doPost):
//   ping                 GET   health check
//   getAll               GET   returns the full dataset as JSON
//   saveRecord           POST  upsert a single record
//   deleteRecord         POST  delete a single record by id
//   submitContribution   POST  queue a public contribution for review
//   approveSubmission    POST  approve a queued contribution
//   rejectSubmission     POST  reject a queued contribution
//   seedFromInitialData  POST  bulk-load the Sheet from local seed data
//
// See GOOGLE-SHEETS-SCHEMA.md for the full request/response contract.
// ============================================================

// Record types that map 1:1 to a Sheet tab, keyed by the type name the
// front end uses (e.g. persons, branches). Each tab stores one row per
// record: id | record_json | updated_at.
const TAB_CONFIG = {
  persons: { sheet: 'Persons', headers: ['id', 'record_json', 'updated_at'] },
  branches: { sheet: 'Branches', headers: ['id', 'record_json', 'updated_at'] },
  events: { sheet: 'Events', headers: ['id', 'record_json', 'updated_at'] },
  stories: { sheet: 'Stories', headers: ['id', 'record_json', 'updated_at'] },
  media: { sheet: 'Media', headers: ['id', 'record_json', 'updated_at'] },
  locations: { sheet: 'Locations', headers: ['id', 'record_json', 'updated_at'] },
  sources: { sheet: 'Sources', headers: ['id', 'record_json', 'updated_at'] }
};

const PENDING_HEADERS = [
  'id', 'submission_type', 'target_person_id', 'branch_ids_json',
  'submitted_by', 'submitted_email', 'status', 'payload_json',
  'created_at', 'reviewed_at'
];

const VALID_SUBMISSION_TYPES = ['person', 'note', 'event', 'story'];

// ------------------------------------------------------------
// Web app entry points
// ------------------------------------------------------------

/**
 * Handles GET requests. Supported actions: ping, getAll.
 * Any other/missing action falls back to a basic health-check response
 * (kept for backward compatibility with earlier deployments).
 */
function doGet(e) {
  const action = ((e && e.parameter && e.parameter.action) || 'ping').toLowerCase();
  try {
    ensureWorkbook_();
    if (action === 'ping') return json_({ ok: true, status: 'Family Legacy API is running' });
    if (action === 'getall') return json_(getAll_());
    return json_({ ok: true, status: 'Family Legacy API is running', note: 'Unknown action, returning health check.' });
  } catch (error) {
    return json_({ ok: false, error: error.message });
  }
}

/**
 * Handles POST requests. The action name is read from the JSON body
 * (`{ "action": "saveRecord", ... }`), not from query parameters, so
 * that record payloads can be sent in the request body.
 */
function doPost(e) {
  try {
    ensureWorkbook_();
    const body = parseJson_((e && e.postData && e.postData.contents) || '{}', {});
    const action = String(body.action || 'submitContribution').toLowerCase();
    if (action === 'saverecord') return json_(saveRecord_(body.recordType, body.record));
    if (action === 'deleterecord') return json_(deleteRecord_(body.recordType, body.id));
    if (action === 'submitcontribution') return json_(submitContribution_(body));
    if (action === 'approvesubmission') return json_(reviewSubmission_(body.id, true));
    if (action === 'rejectsubmission') return json_(reviewSubmission_(body.id, false));
    if (action === 'seedfrominitialdata') return json_(seedFromInitialData_(body.dataset, body.force === true));
    throw new Error('Unknown action: ' + action);
  } catch (error) {
    return json_({ ok: false, error: error.message });
  }
}

// ------------------------------------------------------------
// Response / workbook helpers
// ------------------------------------------------------------

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Creates any tabs that don't exist yet and makes sure each has a header row. */
function ensureWorkbook_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TAB_CONFIG).forEach(type => ensureSheet_(ss, TAB_CONFIG[type].sheet, TAB_CONFIG[type].headers));
  ensureSheet_(ss, 'PendingSubmissions', PENDING_HEADERS);
  ensureSheet_(ss, 'Settings', ['key', 'value_json', 'updated_at']);
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  return sheet;
}

/** Looks up a sheet by name and throws a clear error if it's missing (should not happen after ensureWorkbook_). */
function getSheetOrThrow_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet tab "' + sheetName + '" was not found. Call ensureWorkbook_() or re-deploy.');
  return sheet;
}

// ------------------------------------------------------------
// Reads
// ------------------------------------------------------------

/** Assembles the full dataset (all record types + settings + pending submissions) as one JSON object. */
function getAll_() {
  const dataset = { meta: {}, branches: [], persons: [], events: [], stories: [], media: [], locations: {}, sources: [], settings: {}, pendingSubmissions: [] };
  Object.keys(TAB_CONFIG).forEach(type => {
    const records = readRecordSheet_(type);
    dataset[type] = type === 'locations'
      ? records.reduce((object, record) => { const copy = Object.assign({}, record); delete copy.id; object[record.id] = copy; return object; }, {})
      : records;
  });
  const settings = readRows_('Settings');
  settings.forEach(row => dataset[row.key] = parseJson_(row.value_json, {}));
  dataset.pendingSubmissions = readRows_('PendingSubmissions').map(row => ({
    id: row.id,
    submission_type: row.submission_type,
    target_person_id: row.target_person_id || null,
    branch_ids: parseJson_(row.branch_ids_json, []),
    submitted_by: row.submitted_by,
    submitted_email: row.submitted_email,
    status: row.status,
    payload: parseJson_(row.payload_json, {}),
    created_at: row.created_at,
    reviewed_at: row.reviewed_at
  }));
  dataset.initialized = Object.keys(TAB_CONFIG).some(type => readRecordSheet_(type).length > 0);
  return dataset;
}

function readRecordSheet_(type) {
  if (!TAB_CONFIG[type]) throw new Error('Unsupported record type: ' + type);
  return readRows_(TAB_CONFIG[type].sheet).map(row => parseJson_(row.record_json, null)).filter(Boolean);
}

/** Reads a sheet's rows into an array of { header: value } objects, skipping fully-blank rows. */
function readRows_(sheetName) {
  const sheet = getSheetOrThrow_(sheetName);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter(row => row.some(Boolean)).map(row => headers.reduce((object, header, index) => {
    object[header] = row[index];
    return object;
  }, {}));
}

// ------------------------------------------------------------
// Writes
// ------------------------------------------------------------

/** Upserts a single record (persons/branches/events/stories/media/locations/sources, or settings/meta). */
function saveRecord_(type, record) {
  if (!type) throw new Error('recordType is required');
  if (type === 'settings' || type === 'meta') {
    upsertRow_('Settings', 'key', type, [type, JSON.stringify(record || {}), new Date().toISOString()]);
    return { ok: true, record: record };
  }
  if (!TAB_CONFIG[type]) throw new Error('Unsupported record type: ' + type);
  if (!record || !record.id) throw new Error('Record id is required');
  upsertRow_(TAB_CONFIG[type].sheet, 'id', record.id, [record.id, JSON.stringify(record), new Date().toISOString()]);
  return { ok: true, record: record };
}

function deleteRecord_(type, id) {
  if (!TAB_CONFIG[type]) throw new Error('Unsupported record type: ' + type);
  if (!id) throw new Error('Record id is required');
  deleteRow_(TAB_CONFIG[type].sheet, 'id', id);
  return { ok: true, id: id };
}

// ------------------------------------------------------------
// Public contribution intake + review
// ------------------------------------------------------------

/** Queues a public Contribute-page submission into PendingSubmissions with status "pending". */
function submitContribution_(body) {
  const id = body.id || ('submission_' + Date.now());
  const type = body.submissionType || body.submission_type;
  if (!VALID_SUBMISSION_TYPES.includes(type)) {
    throw new Error('Unsupported submission type: ' + type + ' (expected one of ' + VALID_SUBMISSION_TYPES.join(', ') + ')');
  }
  const payload = Object.assign({}, body);
  delete payload.action;
  if (type === 'person') {
    // Relationship editing is admin-only; strip anything a public submitter
    // might have sent so it can't silently rewrite the family tree.
    delete payload.parents;
    delete payload.spouses;
    delete payload.children;
    delete payload.relationships;
  }
  const branchIds = body.branchIds || body.branch_ids || [];
  const row = [
    id, type, body.targetPersonId || '', JSON.stringify(branchIds),
    body.submittedBy || 'anonymous', body.submittedEmail || '',
    'pending', JSON.stringify(payload), new Date().toISOString(), ''
  ];
  upsertRow_('PendingSubmissions', 'id', id, row);
  return { ok: true, id: id, status: 'pending' };
}

/** Approves or rejects a pending submission. On approval, converts the payload into a real record and saves it. */
function reviewSubmission_(id, approve) {
  if (!id) throw new Error('Submission id is required');
  const sheet = getSheetOrThrow_('PendingSubmissions');
  const rows = readRows_('PendingSubmissions');
  const pending = rows.find(row => row.id === id);
  if (!pending) throw new Error('Submission not found: ' + id);
  const payload = parseJson_(pending.payload_json, {});
  if (approve) {
    if (pending.submission_type === 'person') saveRecord_('persons', personFromSubmission_(id, payload));
    if (pending.submission_type === 'event' && payload.record) saveRecord_('events', Object.assign({}, payload.record, { status: 'approved' }));
    if (pending.submission_type === 'story' && payload.record) saveRecord_('stories', Object.assign({}, payload.record, { status: 'approved' }));
    if (pending.submission_type === 'note') saveRecord_('stories', storyFromNote_(id, pending.target_person_id, payload));
  }
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idIndex = headers.indexOf('id');
  const statusIndex = headers.indexOf('status');
  const reviewedIndex = headers.indexOf('reviewed_at');
  for (let row = 1; row < values.length; row++) {
    if (String(values[row][idIndex]) === id) {
      sheet.getRange(row + 1, statusIndex + 1).setValue(approve ? 'approved' : 'rejected');
      sheet.getRange(row + 1, reviewedIndex + 1).setValue(new Date().toISOString());
      break;
    }
  }
  return { ok: true, id: id, status: approve ? 'approved' : 'rejected' };
}

/** Builds a persons/ record from an approved "new person" submission payload. */
function personFromSubmission_(submissionId, payload) {
  const first = payload.firstName || '';
  const last = payload.lastName || '';
  return {
    id: payload.personId || ('person_' + submissionId.replace(/\W/g, '_')),
    name: { first: first, middle: '', last: last, maiden: payload.maidenName || null, nicknames: payload.nickname ? [payload.nickname] : [], display: (first + ' ' + last).trim() },
    birth: payload.birthDate || null,
    death: null,
    gender: 'unknown',
    is_living: payload.living !== false,
    relationships: { parents: [], spouses: [], children: [] },
    branch_ids: payload.branchIds || [],
    bio: payload.bio || '',
    cover_media_id: null,
    tags: ['approved-submission'],
    confidence: 0.35,
    sources: ['Submitted by ' + (payload.submittedBy || 'anonymous')],
    privacy: 'family',
    status: 'approved'
  };
}

/** Builds a stories/ record from an approved "memory/note" submission payload. */
function storyFromNote_(submissionId, targetPersonId, payload) {
  return {
    id: 'story_note_' + submissionId.replace(/\W/g, '_'),
    type: 'written',
    title: payload.title || 'A family memory',
    body: payload.noteBody || '',
    people_ids: targetPersonId ? [targetPersonId] : [],
    branch_ids: payload.branchIds || [],
    event_ids: [],
    era: '',
    told_by: null,
    told_by_name: payload.submittedBy || null,
    told_date: new Date().toISOString().slice(0, 10),
    media_id: null,
    photo_link: payload.photoLink || null,
    tags: ['approved-note'],
    submitted_by: payload.submittedBy || 'anonymous',
    status: 'approved',
    privacy: 'family'
  };
}

// ------------------------------------------------------------
// Bulk seed (local data/family-legacy-data.js -> Sheet)
// ------------------------------------------------------------

/**
 * Clears every record tab and reloads it from a dataset shaped like
 * data/family-legacy-data.js. Refuses to run against an already-initialized
 * workbook unless `force` is true, to avoid accidentally wiping live data.
 */
function seedFromInitialData_(dataset, force) {
  if (!dataset) throw new Error('Dataset is required');
  const existing = getAll_();
  if (existing.initialized && !force) throw new Error('Workbook is already initialized. Pass force=true to overwrite it.');
  Object.keys(TAB_CONFIG).forEach(type => {
    const sheet = getSheetOrThrow_(TAB_CONFIG[type].sheet);
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    if (type === 'locations') {
      Object.keys(dataset.locations || {}).forEach(id => saveRecord_(type, Object.assign({ id: id }, dataset.locations[id])));
    } else {
      (dataset[type] || []).forEach(record => saveRecord_(type, record));
    }
  });
  upsertRow_('Settings', 'key', 'meta', ['meta', JSON.stringify(dataset.meta || {}), new Date().toISOString()]);
  upsertRow_('Settings', 'key', 'settings', ['settings', JSON.stringify(dataset.settings || {}), new Date().toISOString()]);
  return { ok: true, seeded: true };
}

// ------------------------------------------------------------
// Low-level sheet row helpers
// ------------------------------------------------------------

/** Updates the row matching `key` in `keyHeader`, or appends a new row if none matched. */
function upsertRow_(sheetName, keyHeader, key, rowValues) {
  const sheet = getSheetOrThrow_(sheetName);
  const values = sheet.getDataRange().getValues();
  const keyIndex = values[0].indexOf(keyHeader);
  if (keyIndex === -1) throw new Error('Sheet "' + sheetName + '" has no "' + keyHeader + '" column');
  for (let row = 1; row < values.length; row++) {
    if (String(values[row][keyIndex]) === String(key)) {
      sheet.getRange(row + 1, 1, 1, rowValues.length).setValues([rowValues]);
      return;
    }
  }
  sheet.appendRow(rowValues);
}

/** Deletes every row matching `key` in `keyHeader` (iterates bottom-up so row indices stay valid while deleting). */
function deleteRow_(sheetName, keyHeader, key) {
  const sheet = getSheetOrThrow_(sheetName);
  const values = sheet.getDataRange().getValues();
  const keyIndex = values[0].indexOf(keyHeader);
  if (keyIndex === -1) return;
  for (let row = values.length - 1; row >= 1; row--) {
    if (String(values[row][keyIndex]) === String(key)) sheet.deleteRow(row + 1);
  }
}

function parseJson_(value, fallback) {
  try { return JSON.parse(value); } catch (error) { return fallback; }
}
