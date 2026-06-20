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

function doGet(e) {
  const action = (e.parameter.action || 'ping').toLowerCase();
  try {
    ensureWorkbook_();
    if (action === 'getall') return json_(getAll_());
    return json_({ ok: true, status: 'Family Legacy API is running' });
  } catch (error) {
    return json_({ ok: false, error: error.message });
  }
}

function doPost(e) {
  try {
    ensureWorkbook_();
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
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

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

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
  return readRows_(TAB_CONFIG[type].sheet).map(row => parseJson_(row.record_json, null)).filter(Boolean);
}

function readRows_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter(row => row.some(Boolean)).map(row => headers.reduce((object, header, index) => {
    object[header] = row[index];
    return object;
  }, {}));
}

function saveRecord_(type, record) {
  if (type === 'settings' || type === 'meta') {
    upsertRow_('Settings', 'key', type, [type, JSON.stringify(record || {}), new Date().toISOString()]);
    return { ok: true, record: record };
  }
  if (!TAB_CONFIG[type]) throw new Error('Unsupported record type');
  if (!record || !record.id) throw new Error('Record id is required');
  upsertRow_(TAB_CONFIG[type].sheet, 'id', record.id, [record.id, JSON.stringify(record), new Date().toISOString()]);
  return { ok: true, record: record };
}

function deleteRecord_(type, id) {
  if (!TAB_CONFIG[type]) throw new Error('Unsupported record type');
  deleteRow_(TAB_CONFIG[type].sheet, 'id', id);
  return { ok: true, id: id };
}

function submitContribution_(body) {
  const id = body.id || ('submission_' + Date.now());
  const type = body.submissionType || body.submission_type;
  if (!['person', 'note', 'event', 'story'].includes(type)) throw new Error('Unsupported submission type');
  const payload = Object.assign({}, body);
  delete payload.action;
  if (type === 'person') {
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

function reviewSubmission_(id, approve) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PendingSubmissions');
  const rows = readRows_('PendingSubmissions');
  const pending = rows.find(row => row.id === id);
  if (!pending) throw new Error('Submission not found');
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

function seedFromInitialData_(dataset, force) {
  if (!dataset) throw new Error('Dataset is required');
  const existing = getAll_();
  if (existing.initialized && !force) throw new Error('Workbook is already initialized');
  Object.keys(TAB_CONFIG).forEach(type => {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_CONFIG[type].sheet);
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

function upsertRow_(sheetName, keyHeader, key, rowValues) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const keyIndex = values[0].indexOf(keyHeader);
  for (let row = 1; row < values.length; row++) {
    if (String(values[row][keyIndex]) === String(key)) {
      sheet.getRange(row + 1, 1, 1, rowValues.length).setValues([rowValues]);
      return;
    }
  }
  sheet.appendRow(rowValues);
}

function deleteRow_(sheetName, keyHeader, key) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const keyIndex = values[0].indexOf(keyHeader);
  for (let row = values.length - 1; row >= 1; row--) {
    if (String(values[row][keyIndex]) === String(key)) sheet.deleteRow(row + 1);
  }
}

function parseJson_(value, fallback) {
  try { return JSON.parse(value); } catch (error) { return fallback; }
}
