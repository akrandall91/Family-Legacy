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
  ,unions: { sheet: 'Unions', headers: ['id', 'record_json', 'updated_at'] }
  ,households: { sheet: 'Households', headers: ['id', 'record_json', 'updated_at'] }
};

const PENDING_HEADERS = [
  'id', 'submission_type', 'target_person_id', 'branch_ids_json',
  'submitted_by', 'submitted_email', 'status', 'payload_json',
  'created_at', 'reviewed_at'
];

const VALID_SUBMISSION_TYPES = ['person', 'note', 'event', 'story'];
const SCHEMA_VERSION = 4;
const STORAGE_MODE = 'flat-normalized-authoritative';
const FLAT_CONFIG = {
  persons:{sheet:'People',headers:['id','first_name','middle_name','last_name','maiden_name','display_name','gender','is_living','birth_date','birth_display','birth_certainty','birth_location_id','death_date','death_display','death_certainty','death_location_id','bio','cover_media_id','confidence','primary_branch_id','privacy','created_at','updated_at']},
  branches:{sheet:'BranchesFlat',headers:['id','slug','name','short_name','branch_type','summary','long_history','hero_media_id','color','era_start','era_end','privacy','created_at','updated_at']},
  events:{sheet:'EventsFlat',headers:['id','type','title','description','start_date','end_date','date_display','date_certainty','recurrence_type','recurrence_month','recurrence_day','location_id','privacy','status','created_at','updated_at']},
  stories:{sheet:'StoriesFlat',headers:['id','type','title','body','era','told_by','told_date','status','privacy','created_at','updated_at']},
  media:{sheet:'MediaFlat',headers:['id','type','title','description','storage_type','storage_url','storage_color','date_value','date_display','date_certainty','location_id','privacy','created_at','updated_at']},
  locations:{sheet:'LocationsFlat',headers:['id','name','short_name','city','county','state','country','latitude','longitude','privacy','created_at','updated_at']},
  sources:{sheet:'SourcesFlat',headers:['id','title','type','date','location_id','url','notes','reliability','privacy','created_at','updated_at']},
  unions:{sheet:'UnionsFlat',headers:['id','relationship_type','status','start_date','end_date','location_id','privacy','notes','created_at','updated_at']},
  households:{sheet:'HouseholdsFlat',headers:['id','name','location_id','start_date','end_date','privacy','notes','created_at','updated_at']},
  settings:{sheet:'SettingsFlat',headers:['key','value','value_type','notes','updated_at']}
};
const LINK_TABS = {
  UnionPartners:['id','union_id','person_id','person_name'], PersonNicknames:['id','person_id','nickname'], PersonTags:['id','person_id','tag'], RecordTags:['id','record_type','record_id','tag'], StoryPeople:['id','story_id','person_id','person_name'], StoryEvents:['id','story_id','event_id'], EventPeople:['id','event_id','person_id','person_name','role'], EventBranches:['id','event_id','branch_id'], EventMedia:['id','event_id','media_id'], MediaPeople:['id','media_id','person_id','person_name'], MediaEvents:['id','media_id','event_id'], MediaBranches:['id','media_id','branch_id'], RecordSources:['id','record_type','record_id','source_id'], LegacyThemes:['id','branch_id','theme'], FeaturedRecords:['id','branch_id','record_type','record_id'], BranchSurnames:['id','branch_id','surname'], BranchLocations:['id','branch_id','location_id'], BranchPeople:['id','branch_id','person_id','role']
};
const NORMALIZED_TABS = {
  ParentRelationships:['id','child_id','parent_id','relationship_type','status','confidence','source_ids_json','notes','privacy','creates_descent','show_in_tree'],
  PartnerRelationships:['id','person_id','partner_id','union_id','relationship_type','status','start_date','end_date','source_ids_json','notes','privacy'],
  UnionChildren:['id','union_id','child_id'],
  HouseholdMembers:['id','household_id','person_id','member_role'],
  BranchConnections:['id','branch_id','connected_branch_id','relationship_type','status','through_person_id','source_ids_json','notes'],
  BranchMemberships:['id','person_id','branch_id','connection_type','primary','status','through_person_id','source_ids_json']
};

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
    if (action === 'diagnostics') return json_(diagnostics_());
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
    if (action === 'previewrelationshipmigration') return json_(migrateRelationships_(true));
    if (action === 'runrelationshipmigration') return json_(migrateRelationships_(false));
    if (action === 'verifyrelationshipmigration') return json_(verifyRelationshipMigration_());
    if (action === 'savepersonprofile') return json_(savePersonProfile_(body.record));
    if (action === 'replacepersonprofilelinks') return json_(replacePersonProfileLinks_(body.record));
    if (action === 'saveparentrelationship') return json_(saveNormalized_('ParentRelationships', body.record));
    if (action === 'deleteparentrelationship') return json_(deleteNormalized_('ParentRelationships', body.id));
    if (action === 'savepartnerrelationship') return json_(savePartnerRelationship_(body.record));
    if (action === 'deletepartnerrelationship') return json_(deleteNormalized_('PartnerRelationships', body.id));
    if (action === 'saveunion') return json_(saveEntityMetadata_('unions', body.record, ['child_ids']));
    if (action === 'deleteunion') return json_(deleteEntityWithRows_('unions', body.id, 'UnionChildren', 'union_id'));
    if (action === 'saveunionchild') return json_(saveNormalized_('UnionChildren', body.record));
    if (action === 'deleteunionchild') return json_(deleteNormalized_('UnionChildren', body.id));
    if (action === 'saveunionpartner') return json_(saveLink_('UnionPartners', body.record));
    if (action === 'deleteunionpartner') return json_(deleteLink_('UnionPartners', body.id));
    if (action === 'savehousehold') return json_(saveEntityMetadata_('households', body.record, ['adult_ids','child_ids','member_ids']));
    if (action === 'deletehousehold') return json_(deleteEntityWithRows_('households', body.id, 'HouseholdMembers', 'household_id'));
    if (action === 'savehouseholdmember') return json_(saveNormalized_('HouseholdMembers', body.record));
    if (action === 'deletehouseholdmember') return json_(deleteNormalized_('HouseholdMembers', body.id));
    if (action === 'savebranch') return json_(saveEntityMetadata_('branches', body.record, ['connected_branches']));
    if (action === 'savebranchconnection') return json_(saveNormalized_('BranchConnections', body.record));
    if (action === 'deletebranchconnection') return json_(deleteNormalized_('BranchConnections', body.id));
    if (action === 'savebranchmembership') return json_(saveNormalized_('BranchMemberships', body.record));
    if (action === 'deletebranchmembership') return json_(deleteNormalized_('BranchMemberships', body.id));
    if (action === 'previewauthoritativerelationshipmigration') return json_(authoritativeMigration_(true));
    if (action === 'runauthoritativerelationshipmigration') return json_(authoritativeMigration_(false));
    if (action === 'verifyauthoritativerelationshipmigration') return json_(authoritativeVerification_());
    if (action === 'rollbackauthoritativerelationshipmigration') return json_(rollbackAuthoritativeMigration_(body.backupSheet));
    if (action === 'previewflatsheetmigration') return json_(previewFlatSheetMigration());
    if (action === 'runflatsheetmigration') return json_(runFlatSheetMigration());
    if (action === 'verifyflatsheetmigration') return json_(verifyFlatMigration_());
    if (action === 'rollbackflatsheetmigration') return json_(rollbackFlatMigration_(body.backupSheet));
    if (action === 'validateworkbook') return json_(validateWorkbook_());
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
  Object.keys(NORMALIZED_TABS).forEach(name => ensureSheet_(ss, name, NORMALIZED_TABS[name]));
  Object.keys(FLAT_CONFIG).forEach(type => ensureSheet_(ss, FLAT_CONFIG[type].sheet, FLAT_CONFIG[type].headers));
  Object.keys(LINK_TABS).forEach(name => ensureSheet_(ss, name, LINK_TABS[name]));
  configureWorkbook_();
  applyWorkbookValidations_();
}

function diagnostics_() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const expected=Object.keys(TAB_CONFIG).map(k=>TAB_CONFIG[k].sheet).concat(Object.keys(NORMALIZED_TABS),['PendingSubmissions','Settings']);
  const missing=expected.filter(name=>!ss.getSheetByName(name));
  const totals={}; Object.keys(TAB_CONFIG).forEach(type=>totals[type]=readRecordSheet_(type).length);
  const migration=verifyRelationshipMigration_();
  return {ok:true,schemaVersion:SCHEMA_VERSION,missingSheets:missing,totals:totals,migrationRequired:migration.missingCount>0,schemaMismatches:migration.schemaMismatches};
}

function migrationRows_() {
  const data=getAll_(), rows={}; Object.keys(NORMALIZED_TABS).forEach(name=>rows[name]=[]);
  const seen={}; Object.keys(rows).forEach(name=>seen[name]=new Set());
  function add(tab,id,row){if(seen[tab].has(id))return;seen[tab].add(id);rows[tab].push([id].concat(row));}
  (data.persons||[]).forEach(person=>{
    ((person.relationships||{}).parents||[]).forEach(value=>{const r=typeof value==='string'?{person_id:value,relationship_type:'biological',status:'confirmed'}:value;const id='parent_'+person.id+'_'+r.person_id+'_'+(r.relationship_type||'biological');add('ParentRelationships',id,[person.id,r.person_id,r.relationship_type||'biological',r.status||'confirmed',r.confidence==null?1:r.confidence,JSON.stringify(r.source_ids||[]),r.notes||'',r.privacy||'family',r.relationship_type==='step'?false:r.establishes_branch_descent!==false,r.show_in_tree!==false]);});
    ((person.relationships||{}).spouses||[]).forEach(r=>{r=typeof r==='string'?{person_id:r}:r;const pair=[person.id,r.person_id].sort();const id='partner_'+pair.join('_')+'_'+(r.relationship_id||r.union_id||'legacy');add('PartnerRelationships',id,[person.id,r.person_id,r.union_id||'',r.relationship_type||'marriage',r.status||'confirmed',r.start_date||'',r.end_date||'',JSON.stringify(r.source_ids||[]),r.notes||'',r.privacy||'family']);});
    const memberships=person.branch_memberships||(person.branch_ids||[]).map((branch_id,i)=>({branch_id:branch_id,connection_type:'descent',primary:(person.primary_branch_id||person.branch_ids[0])===branch_id,status:'confirmed'}));memberships.forEach(m=>add('BranchMemberships','membership_'+person.id+'_'+m.branch_id+'_'+(m.connection_type||'descent'),[person.id,m.branch_id,m.connection_type||'descent',!!m.primary,m.status||'confirmed',m.through_person_id||'',JSON.stringify(m.source_ids||[])]));
  });
  (data.unions||[]).forEach(u=>(u.child_ids||[]).forEach(id=>add('UnionChildren','unionchild_'+u.id+'_'+id,[u.id,id])));
  (data.households||[]).forEach(h=>{(h.adult_ids||[]).forEach(id=>add('HouseholdMembers','household_'+h.id+'_'+id,[h.id,id,'adult']));(h.child_ids||[]).forEach(id=>add('HouseholdMembers','household_'+h.id+'_'+id,[h.id,id,'child']));(h.member_ids||[]).forEach(id=>add('HouseholdMembers','household_'+h.id+'_'+id,[h.id,id,'member']));});
  (data.branches||[]).forEach(b=>(b.connected_branches||[]).forEach(c=>add('BranchConnections','branchconnection_'+b.id+'_'+c.branch_id+'_'+(c.relationship||'unknown-connection'),[b.id,c.branch_id,c.relationship||'unknown-connection',c.status||'confirmed',c.through_person_id||'',JSON.stringify(c.source_ids||[]),c.notes||''])));
  return rows;
}
function migrateRelationships_(dryRun) {
  const ss=SpreadsheetApp.getActiveSpreadsheet(),rows=migrationRows_(),report={ok:true,dryRun:dryRun,recordsToCreate:0,alreadyMigrated:0,ambiguous:0,conflicting:0,missingReferences:0,noOp:0,bySheet:{},backupSheet:null};
  if(!dryRun){const backup='MigrationBackup_'+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMdd_HHmmss');const sheet=ss.insertSheet(backup);sheet.appendRow(['created_at','dataset_json']);sheet.appendRow([new Date().toISOString(),JSON.stringify(getAll_())]);report.backupSheet=backup;}
  Object.keys(rows).forEach(name=>{const sheet=getSheetOrThrow_(name),values=sheet.getDataRange().getValues(),existing=new Set(values.slice(1).map(r=>String(r[0]))),create=rows[name].filter(r=>!existing.has(String(r[0])));report.recordsToCreate+=create.length;report.alreadyMigrated+=rows[name].length-create.length;report.bySheet[name]={create:create.length,existing:rows[name].length-create.length};if(!dryRun&&create.length)sheet.getRange(sheet.getLastRow()+1,1,create.length,create[0].length).setValues(create);});
  report.noOp=report.recordsToCreate===0?1:0;return report;
}
function verifyRelationshipMigration_(){const rows=migrationRows_(),result={ok:true,missingCount:0,schemaMismatches:[],bySheet:{}};Object.keys(rows).forEach(name=>{const sheet=getSheetOrThrow_(name),values=sheet.getDataRange().getValues(),headers=values[0]||[],expected=NORMALIZED_TABS[name];if(expected.some((h,i)=>headers[i]!==h))result.schemaMismatches.push(name);const ids=new Set(values.slice(1).map(r=>String(r[0]))),missing=rows[name].filter(r=>!ids.has(String(r[0]))).length;result.bySheet[name]={expected:rows[name].length,missing:missing};result.missingCount+=missing;});result.ok=result.missingCount===0&&!result.schemaMismatches.length;return result;}
function previewRelationshipMigration(){ensureWorkbook_();return migrateRelationships_(true);}
function runRelationshipMigration(){ensureWorkbook_();return migrateRelationships_(false);}
function verifyRelationshipMigration(){ensureWorkbook_();return verifyRelationshipMigration_();}

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
  const dataset = { meta: {}, branches: [], persons: [], events: [], stories: [], media: [], locations: {}, sources: [], unions: [], households: [], settings: {}, pendingSubmissions: [] };
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

// ============================================================
// SCHEMA V3: NORMALIZED RELATIONSHIPS ARE AUTHORITATIVE
// ============================================================
function normalizedRecord_(sheetName,row){const out={};Object.keys(row).forEach(k=>{out[k]=/_json$/.test(k)?parseJson_(row[k],[]):row[k];});return out;}
function readNormalized_(name){return readRows_(name).map(row=>normalizedRecord_(name,row));}
function canonicalParentId_(r){return r.id||('parent_'+r.child_id+'_'+r.parent_id+'_'+(r.relationship_type||'biological'));}
function canonicalPartnerId_(r){const pair=[r.person_id,r.partner_id].sort();return r.id||('partner_'+pair.join('_')+'_'+(r.union_id||r.relationship_type||'relationship'));}
function saveNormalized_(sheetName,record){if(!NORMALIZED_TABS[sheetName])throw new Error('Unsupported normalized sheet: '+sheetName);if(!record)throw new Error('Record is required');const copy=Object.assign({},record);if(sheetName==='ParentRelationships')copy.id=canonicalParentId_(copy);if(sheetName==='PartnerRelationships'){if(copy.person_id===copy.partner_id)throw new Error('A person cannot partner with themselves');const pair=[copy.person_id,copy.partner_id].sort();copy.person_id=pair[0];copy.partner_id=pair[1];copy.id=canonicalPartnerId_(copy);}if(!copy.id)throw new Error('Stable relationship id is required');const values=NORMALIZED_TABS[sheetName].map(h=>{const key=h.replace(/_json$/,'');const value=copy[h]!==undefined?copy[h]:copy[key];return /_json$/.test(h)?JSON.stringify(value||[]):(value==null?'':value);});upsertRow_(sheetName,'id',copy.id,values);return {ok:true,record:copy,storage_mode:STORAGE_MODE};}
function deleteNormalized_(sheetName,id){deleteRow_(sheetName,'id',id);return {ok:true,id:id,storage_mode:STORAGE_MODE};}
function saveLink_(sheetName,record){if(!LINK_TABS[sheetName])throw new Error('Unsupported link sheet: '+sheetName);if(!record||!record.id)throw new Error('Stable link id is required');const row=LINK_TABS[sheetName].map(h=>record[h]==null?'':record[h]);upsertRow_(sheetName,'id',record.id,row);return {ok:true,record:record,storage_mode:STORAGE_MODE,schema_version:SCHEMA_VERSION};}
function deleteLink_(sheetName,id){deleteRow_(sheetName,'id',id);return {ok:true,id:id,storage_mode:STORAGE_MODE,schema_version:SCHEMA_VERSION};}
function deleteRowsByField_(sheetName,field,value){const sheet=getSheetOrThrow_(sheetName),rows=readRows_(sheetName);for(let i=rows.length-1;i>=0;i--)if(String(rows[i][field])===String(value))sheet.deleteRow(i+2);}
function replacePersonProfileLinks_(person){if(!person||!person.id)throw new Error('Person id required');['PersonNicknames','PersonTags','BranchMemberships'].forEach(name=>deleteRowsByField_(name,'person_id',person.id));(person.name&&person.name.nicknames||[]).forEach((v,i)=>saveLink_('PersonNicknames',{id:'nickname_'+person.id+'_'+i,person_id:person.id,nickname:v}));(person.tags||[]).forEach(v=>saveLink_('PersonTags',{id:'tag_'+person.id+'_'+slugCell_(v),person_id:person.id,tag:v}));(person.branch_memberships||[]).forEach(m=>saveNormalized_('BranchMemberships',{id:m.membership_id||('membership_'+person.id+'_'+m.branch_id+'_'+(m.connection_type||'descent')),person_id:person.id,branch_id:m.branch_id,connection_type:m.connection_type||'descent',primary:!!m.primary,status:m.status||'confirmed',through_person_id:m.through_person_id||'',source_ids:m.source_ids||[]}));return {ok:true,storage_mode:STORAGE_MODE,schema_version:SCHEMA_VERSION};}
function savePersonProfile_(record){if(!record||!record.id)throw new Error('Person id is required');const profile=JSON.parse(JSON.stringify(record));delete profile.relationships;delete profile.branch_ids;delete profile.primary_branch_id;delete profile.branch_memberships;upsertRow_('Persons','id',profile.id,[profile.id,JSON.stringify(profile),new Date().toISOString()]);return {ok:true,record:profile,storage_mode:STORAGE_MODE};}
function saveEntityMetadata_(type,record,derivedFields){const copy=JSON.parse(JSON.stringify(record||{}));(derivedFields||[]).forEach(k=>delete copy[k]);return saveRecord_(type,copy);}
function savePartnerRelationship_(record){return saveNormalized_('PartnerRelationships',record);}
function deleteEntityWithRows_(type,id,sheet,fk){readRows_(sheet).filter(r=>String(r[fk])===String(id)).forEach(r=>deleteRow_(sheet,'id',r.id));return deleteRecord_(type,id);}

function getAll_(){
  const dataset={meta:{},branches:[],persons:[],events:[],stories:[],media:[],locations:{},sources:[],unions:[],households:[],settings:{},pendingSubmissions:[],schema_version:SCHEMA_VERSION,storage_mode:STORAGE_MODE};
  Object.keys(TAB_CONFIG).forEach(type=>{const records=readRecordSheet_(type);dataset[type]=type==='locations'?records.reduce((o,r)=>{const c=Object.assign({},r);delete c.id;o[r.id]=c;return o;},{}):records;});
  readRows_('Settings').forEach(row=>dataset[row.key]=parseJson_(row.value_json,{}));
  const people={};dataset.persons.forEach(p=>{p.relationships={parents:[],spouses:[],children:[],guardians:[],household_connections:[]};p.branch_memberships=[];p.branch_ids=[];p.primary_branch_id=null;people[p.id]=p;});
  readNormalized_('ParentRelationships').forEach(r=>{const parent=people[r.parent_id],child=people[r.child_id];if(!parent||!child)return;const rel={relationship_id:r.id,person_id:r.parent_id,relationship_type:r.relationship_type,status:r.status,confidence:Number(r.confidence||1),source_ids:r.source_ids_json||[],notes:r.notes||'',privacy:r.privacy||'family',establishes_branch_descent:String(r.creates_descent)!=='false',show_in_tree:String(r.show_in_tree)!=='false'};child.relationships.parents.push(rel);parent.relationships.children.push(Object.assign({},rel,{person_id:r.child_id}));});
  readNormalized_('PartnerRelationships').forEach(r=>{const a=people[r.person_id],b=people[r.partner_id];if(!a||!b)return;const base={relationship_id:r.id,union_id:r.union_id||null,relationship_type:r.relationship_type,status:r.status,start_date:r.start_date||null,end_date:r.end_date||null,source_ids:r.source_ids_json||[],notes:r.notes||'',privacy:r.privacy||'family'};a.relationships.spouses.push(Object.assign({},base,{person_id:b.id}));b.relationships.spouses.push(Object.assign({},base,{person_id:a.id}));});
  const unions={};dataset.unions.forEach(u=>{u.child_ids=[];unions[u.id]=u;});readNormalized_('UnionChildren').forEach(r=>{if(unions[r.union_id])unions[r.union_id].child_ids.push(r.child_id);});
  const households={};dataset.households.forEach(h=>{h.adult_ids=[];h.child_ids=[];h.member_ids=[];households[h.id]=h;});readNormalized_('HouseholdMembers').forEach(r=>{const h=households[r.household_id];if(!h)return;const key=r.member_role==='adult'?'adult_ids':r.member_role==='child'?'child_ids':'member_ids';h[key].push(r.person_id);});
  const branches={};dataset.branches.forEach(b=>{b.connected_branches=[];branches[b.id]=b;});readNormalized_('BranchConnections').forEach(r=>{if(branches[r.branch_id])branches[r.branch_id].connected_branches.push({connection_id:r.id,branch_id:r.connected_branch_id,relationship:r.relationship_type,status:r.status,through_person_id:r.through_person_id||null,source_ids:r.source_ids_json||[],notes:r.notes||''});});
  readNormalized_('BranchMemberships').forEach(r=>{const p=people[r.person_id];if(!p)return;const m={membership_id:r.id,branch_id:r.branch_id,connection_type:r.connection_type,primary:String(r.primary)==='true',status:r.status,through_person_id:r.through_person_id||null,source_ids:r.source_ids_json||[]};p.branch_memberships.push(m);p.branch_ids.push(r.branch_id);if(m.primary)p.primary_branch_id=r.branch_id;});
  dataset.pendingSubmissions=readRows_('PendingSubmissions').map(row=>({id:row.id,submission_type:row.submission_type,target_person_id:row.target_person_id||null,branch_ids:parseJson_(row.branch_ids_json,[]),submitted_by:row.submitted_by,submitted_email:row.submitted_email,status:row.status,payload:parseJson_(row.payload_json,{}),created_at:row.created_at,reviewed_at:row.reviewed_at}));dataset.initialized=dataset.persons.length>0;return dataset;
}

function legacySnapshotRows_(){const data={persons:readRecordSheet_('persons'),branches:readRecordSheet_('branches'),unions:readRecordSheet_('unions'),households:readRecordSheet_('households')};const rows={};Object.keys(NORMALIZED_TABS).forEach(n=>rows[n]=[]);const seen={};Object.keys(rows).forEach(n=>seen[n]=new Set());const add=(n,id,values)=>{if(!seen[n].has(id)){seen[n].add(id);rows[n].push([id].concat(values));}};(data.persons||[]).forEach(p=>{((p.relationships||{}).parents||[]).forEach(v=>{const r=typeof v==='string'?{person_id:v}:v,id=canonicalParentId_({child_id:p.id,parent_id:r.person_id,relationship_type:r.relationship_type});add('ParentRelationships',id,[p.id,r.person_id,r.relationship_type||'biological',r.status||'confirmed',r.confidence==null?1:r.confidence,JSON.stringify(r.source_ids||[]),r.notes||'',r.privacy||'family',r.relationship_type==='step'?false:r.establishes_branch_descent!==false,r.show_in_tree!==false]);});((p.relationships||{}).spouses||[]).forEach(v=>{const r=typeof v==='string'?{person_id:v}:v,pair=[p.id,r.person_id].sort(),id=canonicalPartnerId_({person_id:pair[0],partner_id:pair[1],union_id:r.union_id,relationship_type:r.relationship_type});add('PartnerRelationships',id,[pair[0],pair[1],r.union_id||'',r.relationship_type||'marriage',r.status||'confirmed',r.start_date||'',r.end_date||'',JSON.stringify(r.source_ids||[]),r.notes||'',r.privacy||'family']);});const ms=p.branch_memberships||(p.branch_ids||[]).map(id=>({branch_id:id,connection_type:'descent',primary:(p.primary_branch_id||p.branch_ids[0])===id,status:'confirmed'}));ms.forEach(m=>add('BranchMemberships','membership_'+p.id+'_'+m.branch_id+'_'+(m.connection_type||'descent'),[p.id,m.branch_id,m.connection_type||'descent',!!m.primary,m.status||'confirmed',m.through_person_id||'',JSON.stringify(m.source_ids||[])]));});(data.unions||[]).forEach(u=>(u.child_ids||[]).forEach(c=>add('UnionChildren','unionchild_'+u.id+'_'+c,[u.id,c])));(data.households||[]).forEach(h=>[['adult_ids','adult'],['child_ids','child'],['member_ids','member']].forEach(([k,role])=>(h[k]||[]).forEach(p=>add('HouseholdMembers','household_'+h.id+'_'+p,[h.id,p,role]))));(data.branches||[]).forEach(b=>(b.connected_branches||[]).forEach(c=>add('BranchConnections','branchconnection_'+b.id+'_'+c.branch_id+'_'+(c.relationship||'unknown-connection'),[b.id,c.branch_id,c.relationship||'unknown-connection',c.status||'confirmed',c.through_person_id||'',JSON.stringify(c.source_ids||[]),c.notes||''])));return rows;}
function authoritativeConflicts_(){const expected=legacySnapshotRows_(),result={missingNormalized:0,extraNormalized:0,conflictingTypes:0,conflictingStatuses:0,conflictingBranchMemberships:0,conflictingUnionChildren:0,conflictingHouseholdMembership:0,duplicateCanonical:0,missingReferences:0,bySheet:{}};const ids={people:new Set(readRecordSheet_('persons').map(x=>x.id)),branches:new Set(readRecordSheet_('branches').map(x=>x.id)),unions:new Set(readRecordSheet_('unions').map(x=>x.id)),households:new Set(readRecordSheet_('households').map(x=>x.id))};Object.keys(expected).forEach(name=>{const actual=readRows_(name),actualIds=actual.map(r=>String(r.id)),expectedIds=new Set(expected[name].map(r=>String(r[0]))),missing=expected[name].filter(r=>!actualIds.includes(String(r[0]))).length,extra=actual.filter(r=>!expectedIds.has(String(r.id))).length,dup=actualIds.length-new Set(actualIds).size;result.missingNormalized+=missing;result.extraNormalized+=extra;result.duplicateCanonical+=dup;result.bySheet[name]={legacy:expected[name].length,normalized:actual.length,missing:missing,extra:extra,duplicates:dup};});readRows_('ParentRelationships').forEach(r=>{if(!ids.people.has(r.child_id)||!ids.people.has(r.parent_id))result.missingReferences++;});return result;}
function authoritativeVerification_(){const conflicts=authoritativeConflicts_(),ok=conflicts.missingNormalized===0&&conflicts.duplicateCanonical===0&&conflicts.missingReferences===0;return {ok:ok,storage_mode:STORAGE_MODE,schema_version:SCHEMA_VERSION,conflicts:conflicts,last_verified_at:new Date().toISOString()};}
function authoritativeMigration_(dryRun){const rows=legacySnapshotRows_(),report={ok:true,dry_run:dryRun,storage_mode:STORAGE_MODE,schema_version:SCHEMA_VERSION,created:0,existing:0,bySheet:{},backupSheet:null};if(!dryRun){const backup='AuthoritativeBackup_'+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMdd_HHmmss'),sheet=SpreadsheetApp.getActiveSpreadsheet().insertSheet(backup);sheet.appendRow(['created_at','legacy_json','normalized_json']);sheet.appendRow([new Date().toISOString(),JSON.stringify({persons:readRecordSheet_('persons'),branches:readRecordSheet_('branches'),unions:readRecordSheet_('unions'),households:readRecordSheet_('households')}),JSON.stringify(Object.keys(NORMALIZED_TABS).reduce((o,n)=>(o[n]=readRows_(n),o),{}))]);report.backupSheet=backup;}Object.keys(rows).forEach(name=>{const existing=new Set(readRows_(name).map(r=>String(r.id))),create=rows[name].filter(r=>!existing.has(String(r[0])));report.created+=create.length;report.existing+=rows[name].length-create.length;report.bySheet[name]={create:create.length,existing:rows[name].length-create.length};if(!dryRun&&create.length)getSheetOrThrow_(name).getRange(getSheetOrThrow_(name).getLastRow()+1,1,create.length,create[0].length).setValues(create);});if(!dryRun){const verify=authoritativeVerification_();report.verification=verify;if(verify.ok)upsertRow_('Settings','key','storage_schema',['storage_schema',JSON.stringify({schema_version:SCHEMA_VERSION,storage_mode:STORAGE_MODE,last_verified_at:verify.last_verified_at,backup_sheet:report.backupSheet}),new Date().toISOString()]);}return report;}
function rollbackAuthoritativeMigration_(backupName){if(!backupName||backupName.indexOf('AuthoritativeBackup_')!==0)throw new Error('A valid authoritative backup sheet is required');const rows=readRows_(backupName);if(!rows.length)throw new Error('Backup is empty');const normalized=parseJson_(rows[0].normalized_json,{});Object.keys(NORMALIZED_TABS).forEach(name=>{const sheet=getSheetOrThrow_(name);if(sheet.getLastRow()>1)sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).clearContent();const records=normalized[name]||[];if(records.length){const values=records.map(r=>NORMALIZED_TABS[name].map(h=>r[h]||''));sheet.getRange(2,1,values.length,values[0].length).setValues(values);}});return {ok:true,rolled_back_from:backupName,storage_mode:STORAGE_MODE};}
function previewAuthoritativeRelationshipMigration(){ensureWorkbook_();return authoritativeMigration_(true);}
function runAuthoritativeRelationshipMigration(){ensureWorkbook_();return authoritativeMigration_(false);}
function verifyAuthoritativeRelationshipMigration(){ensureWorkbook_();return authoritativeVerification_();}
function rollbackAuthoritativeRelationshipMigration(backupSheet){ensureWorkbook_();return rollbackAuthoritativeMigration_(backupSheet);}
function diagnostics_(){const verify=authoritativeVerification_(),settings=readRows_('Settings').find(r=>r.key==='storage_schema'),schema=parseJson_(settings&&settings.value_json,{}),totals={};Object.keys(NORMALIZED_TABS).forEach(n=>totals[n]=readRows_(n).length);return {ok:verify.ok&&schema.storage_mode===STORAGE_MODE,schemaVersion:SCHEMA_VERSION,schema_version:SCHEMA_VERSION,storage_mode:STORAGE_MODE,legacy_snapshot_status:'read-only-backup',normalizedTotals:totals,conflicts:verify.conflicts,migration_status:schema.storage_mode===STORAGE_MODE?'verified':'required',lastSuccessfulVerification:schema.last_verified_at||null,rollbackDataExists:!!schema.backup_sheet,rollbackSheet:schema.backup_sheet||null,readiness:verify.ok&&schema.storage_mode===STORAGE_MODE?'ready':'not-ready'};}

function configureWorkbook_(){const ss=SpreadsheetApp.getActiveSpreadsheet(),all=Object.values(FLAT_CONFIG).map(c=>c.sheet).concat(Object.keys(NORMALIZED_TABS),Object.keys(LINK_TABS));all.forEach(name=>{const s=ss.getSheetByName(name);if(!s)return;s.setFrozenRows(1);if(s.getFilter())s.getFilter().remove();if(s.getLastColumn())s.getRange(1,1,Math.max(1,s.getMaxRows()),s.getLastColumn()).createFilter();s.getRange(1,1,1,s.getLastColumn()).setBackground(name.indexOf('Relationships')>=0?'#d9ead3':name.indexOf('Flat')>=0||name==='People'?'#cfe2f3':'#fce5cd').setFontWeight('bold').setNote('IDs are authoritative. Edit visible fields; never substitute names for IDs.');const idColumn=1;try{s.protect().setDescription('Family Legacy generated structure').setWarningOnly(true);s.getRange(2,idColumn,Math.max(1,s.getMaxRows()-1),1).protect().setDescription('Stable IDs').setWarningOnly(true);}catch(e){};});ensureInstructions_();}
function ensureInstructions_(){const ss=SpreadsheetApp.getActiveSpreadsheet();let s=ss.getSheetByName('Instructions');if(!s)s=ss.insertSheet('Instructions',0);s.clear();s.getRange(1,1,8,2).setValues([['Family Legacy workbook','Edit ordinary cells; relationship rows live in dedicated sheets.'],['Storage mode',STORAGE_MODE],['Schema version',SCHEMA_VERSION],['IDs','Never change generated IDs. Names are display-only.'],['Validation','Run validateWorkbook() after direct edits.'],['Migration','Preview, run, and verify the flat migration before deployment.'],['Backups','Migration creates a timestamped FlatBackup sheet.'],['Privacy','Do not enter sensitive living-person information.']]);let d=ss.getSheetByName('Data Dictionary');if(!d)d=ss.insertSheet('Data Dictionary',1);const rows=[['Sheet','Column','Meaning']];Object.keys(FLAT_CONFIG).forEach(k=>FLAT_CONFIG[k].headers.forEach(h=>rows.push([FLAT_CONFIG[k].sheet,h,'Authoritative '+k+' field'])));Object.keys(NORMALIZED_TABS).forEach(k=>NORMALIZED_TABS[k].forEach(h=>rows.push([k,h,'Authoritative normalized relationship field'])));Object.keys(LINK_TABS).forEach(k=>LINK_TABS[k].forEach(h=>rows.push([k,h,'Authoritative repeating/link field'])));d.clear();d.getRange(1,1,rows.length,3).setValues(rows);d.setFrozenRows(1);}
function applyWorkbookValidations_(){const ss=SpreadsheetApp.getActiveSpreadsheet(),lists={relationship_type:['biological','adoptive','step','foster','guardian','social-parent','marriage','partnership','former-marriage','former-partnership','co-parent','unknown'],status:['confirmed','probable','possible','oral-history','disputed','unknown'],privacy:['public','family','private','admin'],gender:['female','male','nonbinary','unknown'],branch_type:['ancestral','anchor','descendant','connected-family','research','unlinked'],connection_type:['descent','adoption','marriage','stepfamily','household','guardian','research','unknown'],certainty:['exact','estimated','circa','unknown'],member_role:['adult','child','member'],record_type:['person','branch','event','story','media','source','union','household']};const sheets=Object.values(FLAT_CONFIG).map(c=>c.sheet).concat(Object.keys(NORMALIZED_TABS),Object.keys(LINK_TABS));sheets.forEach(name=>{const s=ss.getSheetByName(name);if(!s)return;const headers=s.getRange(1,1,1,s.getLastColumn()).getValues()[0];headers.forEach((h,i)=>{const range=s.getRange(2,i+1,Math.max(1,s.getMaxRows()-1),1),base=h.replace(/^.*_/,'');if(['is_living','creates_descent','show_in_tree','primary'].includes(h)){range.insertCheckboxes();return;}const key=lists[h]?h:lists[base]?base:null;if(key)range.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(lists[key],true).setAllowInvalid(false).build());if(/date/.test(h))range.setNumberFormat('yyyy-mm-dd');});});}
function flatRow_(type,record){const now=new Date().toISOString(),r=record||{};const maps={persons:{first_name:r.name&&r.name.first,middle_name:r.name&&r.name.middle,last_name:r.name&&r.name.last,maiden_name:r.name&&r.name.maiden,display_name:r.name&&r.name.display,gender:r.gender,is_living:r.is_living,birth_date:r.birth&&r.birth.date,birth_display:r.birth&&r.birth.display,birth_certainty:r.birth&&r.birth.certainty,birth_location_id:r.birth&&r.birth.location_id,death_date:r.death&&r.death.date,death_display:r.death&&r.death.display,death_certainty:r.death&&r.death.certainty,death_location_id:r.death&&r.death.location_id,bio:r.bio,cover_media_id:r.cover_media_id,confidence:r.confidence,primary_branch_id:r.primary_branch_id,privacy:r.privacy,created_at:r.created_at,updated_at:now},branches:{slug:r.slug,name:r.name,short_name:r.short_name,branch_type:r.branch_type,summary:r.summary||r.description,long_history:r.long_history,hero_media_id:r.hero_media_id,color:r.color,era_start:r.era_start,era_end:r.era_end,privacy:r.privacy,created_at:r.created_at,updated_at:now},unions:{relationship_type:r.relationship_type,status:r.status,start_date:r.start_date,end_date:r.end_date,location_id:r.location_id,privacy:r.privacy,notes:r.notes,created_at:r.created_at,updated_at:now},households:{name:r.name,location_id:r.location_id,start_date:r.date_start||r.start_date,end_date:r.date_end||r.end_date,privacy:r.privacy,notes:r.notes,created_at:r.created_at,updated_at:now},events:{type:r.type,title:r.title,description:r.description,start_date:r.date&&r.date.start,end_date:r.date&&r.date.end,date_display:r.date&&r.date.display,date_certainty:r.date&&r.date.certainty,location_id:r.location_id,privacy:r.privacy,status:r.status,created_at:r.created_at,updated_at:now},stories:{type:r.type,title:r.title,body:r.body,era:r.era,told_by:r.told_by,told_date:r.told_date,status:r.status,privacy:r.privacy,created_at:r.created_at,updated_at:now},media:{type:r.type,title:r.title,description:r.description,storage_type:r.storage&&r.storage.type,storage_url:r.storage&&r.storage.url,storage_color:r.storage&&r.storage.color,date_value:r.date&&r.date.value,date_display:r.date&&r.date.display,date_certainty:r.date&&r.date.certainty,location_id:r.location_id,privacy:r.privacy,created_at:r.created_at,updated_at:now},sources:{title:r.title,type:r.type,date:r.date,location_id:r.location_id||r.location,url:r.url||r.drive_file_id,notes:r.notes,reliability:r.reliability,privacy:r.privacy,created_at:r.created_at,updated_at:now},locations:{name:r.name,short_name:r.short||r.short_name,city:r.city,county:r.county,state:r.state,country:r.country,latitude:r.latitude,longitude:r.longitude,privacy:r.privacy,created_at:r.created_at,updated_at:now}};const map=maps[type]||r;return FLAT_CONFIG[type].headers.map(h=>h==='id'?r.id:(map[h]==null?'':map[h]));}
function saveFlat_(type,record){const c=FLAT_CONFIG[type];if(!c)throw new Error('Unsupported flat type: '+type);const key=type==='settings'?'key':'id',id=record[key];if(!id)throw new Error(key+' is required');upsertRow_(c.sheet,key,id,flatRow_(type,record));return {ok:true,record:record,storage_mode:STORAGE_MODE,schema_version:SCHEMA_VERSION};}
function saveRecord_(type,record){if(type==='meta'||type==='settings')return saveFlatSetting_(type,record);if(!FLAT_CONFIG[type])throw new Error('Unsupported record type: '+type);if(type==='persons')return savePersonProfile_(record);return saveFlat_(type,record);}
function deleteRecord_(type,id){if(!FLAT_CONFIG[type])throw new Error('Unsupported record type: '+type);deleteRow_(FLAT_CONFIG[type].sheet,type==='settings'?'key':'id',id);return {ok:true,id:id};}
function savePersonProfile_(record){const copy=JSON.parse(JSON.stringify(record||{}));delete copy.relationships;delete copy.branch_ids;delete copy.branch_memberships;return saveFlat_('persons',copy);}
function saveEntityMetadata_(type,record,derived){const copy=JSON.parse(JSON.stringify(record||{}));(derived||[]).forEach(k=>delete copy[k]);return saveFlat_(type,copy);}
function flattenSettings_(prefix,value,out){if(value&&typeof value==='object'&&!Array.isArray(value)){Object.keys(value).forEach(k=>flattenSettings_(prefix?prefix+'.'+k:k,value[k],out));return;}out.push({key:prefix,value:Array.isArray(value)?value.join('|'):(value==null?'':String(value)),value_type:Array.isArray(value)?'list':typeof value,notes:'Flat setting',updated_at:new Date().toISOString()});}
function saveFlatSetting_(key,value){const rows=[];flattenSettings_(key,value,rows);rows.forEach(row=>upsertRow_(FLAT_CONFIG.settings.sheet,'key',row.key,FLAT_CONFIG.settings.headers.map(h=>row[h]||'')));return {ok:true};}
function assignSettingPath_(target,path,value,type){const parts=path.split('.');let o=target;parts.slice(0,-1).forEach(k=>o=o[k]||(o[k]={}));o[parts[parts.length-1]]=type==='boolean'?String(value).toLowerCase()==='true':type==='number'?Number(value):type==='list'?String(value||'').split('|').filter(Boolean):value;}
function flatObjects_(type){const c=FLAT_CONFIG[type];return readRows_(c.sheet);}
function personFromFlat_(r){return {id:r.id,name:{first:r.first_name||'',middle:r.middle_name||'',last:r.last_name||'',maiden:r.maiden_name||null,nicknames:[],display:r.display_name||[r.first_name,r.last_name].filter(Boolean).join(' ')},gender:r.gender||'unknown',is_living:String(r.is_living).toLowerCase()==='true',birth:r.birth_date?{date:r.birth_date,display:r.birth_display,certainty:r.birth_certainty,location_id:r.birth_location_id||null}:null,death:r.death_date?{date:r.death_date,display:r.death_display,certainty:r.death_certainty,location_id:r.death_location_id||null}:null,bio:r.bio||'',cover_media_id:r.cover_media_id||null,confidence:Number(r.confidence||0),primary_branch_id:r.primary_branch_id||null,privacy:r.privacy||'family',relationships:{parents:[],spouses:[],children:[],guardians:[],household_connections:[]},branch_memberships:[],branch_ids:[],tags:[],sources:[]};}
function getAll_(){const dataset={meta:{},settings:{},persons:flatObjects_('persons').map(personFromFlat_),branches:flatObjects_('branches').map(r=>({id:r.id,slug:r.slug,name:r.name,short_name:r.short_name,branch_type:r.branch_type,summary:r.summary,description:r.summary,long_history:r.long_history,hero_media_id:r.hero_media_id,color:r.color,era_start:r.era_start,era_end:r.era_end,privacy:r.privacy,connected_branches:[]})),unions:flatObjects_('unions').map(r=>Object.assign({},r,{child_ids:[],partner_ids:[]})),households:flatObjects_('households').map(r=>({id:r.id,name:r.name,location_id:r.location_id||null,date_start:r.start_date||null,date_end:r.end_date||null,privacy:r.privacy,notes:r.notes,adult_ids:[],child_ids:[],member_ids:[]})),events:[],stories:[],media:[],locations:{},sources:[],pendingSubmissions:[],schema_version:SCHEMA_VERSION,storage_mode:STORAGE_MODE};flatObjects_('settings').forEach(r=>{const dot=r.key.indexOf('.'),root=dot<0?r.key:r.key.slice(0,dot),path=dot<0?'value':r.key.slice(dot+1);if(dot<0)dataset[root]=r.value;else{dataset[root]=dataset[root]&&typeof dataset[root]==='object'?dataset[root]:{};assignSettingPath_(dataset[root],path,r.value,r.value_type);}});dataset.events=flatObjects_('events').map(r=>({id:r.id,type:r.type,title:r.title,description:r.description,date:{start:r.start_date,end:r.end_date||null,display:r.date_display,certainty:r.date_certainty},location_id:r.location_id||null,people:[],branch_ids:[],media_ids:[],privacy:r.privacy,status:r.status}));dataset.stories=flatObjects_('stories').map(r=>({id:r.id,type:r.type,title:r.title,body:r.body,era:r.era,told_by:r.told_by||null,told_date:r.told_date,people_ids:[],event_ids:[],privacy:r.privacy,status:r.status}));dataset.media=flatObjects_('media').map(r=>({id:r.id,type:r.type,title:r.title,description:r.description,storage:{type:r.storage_type,url:r.storage_url||null,color:r.storage_color},date:{value:r.date_value,display:r.date_display,certainty:r.date_certainty},location_id:r.location_id||null,people_ids:[],event_ids:[],branch_ids:[],privacy:r.privacy}));flatObjects_('locations').forEach(r=>dataset.locations[r.id]={name:r.name,short:r.short_name,city:r.city,county:r.county,state:r.state,country:r.country,latitude:r.latitude,longitude:r.longitude,privacy:r.privacy});dataset.sources=flatObjects_('sources').map(r=>({id:r.id,title:r.title,type:r.type,date:r.date,location_id:r.location_id||null,url:r.url,notes:r.notes,reliability:Number(r.reliability||0),privacy:r.privacy}));assembleLinks_(dataset);dataset.initialized=dataset.persons.length>0;return dataset;}
function assembleLinks_(d){const people=Object.fromEntries(d.persons.map(p=>[p.id,p])),branches=Object.fromEntries(d.branches.map(b=>[b.id,b])),unions=Object.fromEntries(d.unions.map(u=>[u.id,u])),households=Object.fromEntries(d.households.map(h=>[h.id,h]));readRows_('PersonNicknames').forEach(r=>{if(people[r.person_id])people[r.person_id].name.nicknames.push(r.nickname)});readRows_('PersonTags').forEach(r=>{if(people[r.person_id])people[r.person_id].tags.push(r.tag)});readNormalized_('ParentRelationships').forEach(r=>{if(!people[r.parent_id]||!people[r.child_id])return;const x={relationship_id:r.id,person_id:r.parent_id,relationship_type:r.relationship_type,status:r.status,confidence:Number(r.confidence||1),source_ids:r.source_ids_json||[],notes:r.notes,privacy:r.privacy,establishes_branch_descent:String(r.creates_descent)!=='false',show_in_tree:String(r.show_in_tree)!=='false'};people[r.child_id].relationships.parents.push(x);people[r.parent_id].relationships.children.push(Object.assign({},x,{person_id:r.child_id}));});readNormalized_('PartnerRelationships').forEach(r=>{if(!people[r.person_id]||!people[r.partner_id])return;const x={relationship_id:r.id,union_id:r.union_id||null,relationship_type:r.relationship_type,status:r.status,start_date:r.start_date||null,end_date:r.end_date||null,source_ids:r.source_ids_json||[],notes:r.notes,privacy:r.privacy};people[r.person_id].relationships.spouses.push(Object.assign({},x,{person_id:r.partner_id}));people[r.partner_id].relationships.spouses.push(Object.assign({},x,{person_id:r.person_id}));});readRows_('UnionPartners').forEach(r=>{if(unions[r.union_id])unions[r.union_id].partner_ids.push(r.person_id)});readRows_('UnionChildren').forEach(r=>{if(unions[r.union_id])unions[r.union_id].child_ids.push(r.child_id)});readRows_('HouseholdMembers').forEach(r=>{const h=households[r.household_id];if(h)h[r.member_role==='adult'?'adult_ids':r.member_role==='child'?'child_ids':'member_ids'].push(r.person_id)});readRows_('BranchConnections').forEach(r=>{if(branches[r.branch_id])branches[r.branch_id].connected_branches.push({connection_id:r.id,branch_id:r.connected_branch_id,relationship:r.relationship_type,status:r.status,through_person_id:r.through_person_id||null,source_ids:parseJson_(r.source_ids_json,[]),notes:r.notes})});readRows_('BranchMemberships').forEach(r=>{const p=people[r.person_id];if(!p)return;const m={membership_id:r.id,branch_id:r.branch_id,connection_type:r.connection_type,primary:String(r.primary)==='true',status:r.status,through_person_id:r.through_person_id||null,source_ids:parseJson_(r.source_ids_json,[])};p.branch_memberships.push(m);p.branch_ids.push(r.branch_id);if(m.primary)p.primary_branch_id=r.branch_id;});}

function legacyDataset_(){const d={};Object.keys(TAB_CONFIG).forEach(type=>d[type]=type==='locations'?readRecordSheet_(type):readRecordSheet_(type));d.meta=parseJson_((readRows_('Settings').find(r=>r.key==='meta')||{}).value_json,{});d.settings=parseJson_((readRows_('Settings').find(r=>r.key==='settings')||{}).value_json,{});return d;}
function flatMigrationPlan_(){const legacy=legacyDataset_(),plan={flat:{},links:{},normalized:legacySnapshotRows_(),unknownFields:[]};Object.keys(FLAT_CONFIG).forEach(t=>plan.flat[t]=[]);Object.keys(LINK_TABS).forEach(t=>plan.links[t]=[]);['persons','branches','events','stories','media','sources','unions','households'].forEach(type=>(legacy[type]||[]).forEach(r=>plan.flat[type].push(flatRow_(type,r))));Object.entries(legacy.locations||{}).forEach(([id,r])=>plan.flat.locations.push(flatRow_('locations',Object.assign({id:id},r))));[['meta',legacy.meta],['settings',legacy.settings]].forEach(([key,value])=>plan.flat.settings.push([key,JSON.stringify(value),'object','Migrated legacy setting',new Date().toISOString()]));const add=(tab,id,values)=>{if(!plan.links[tab].some(r=>r[0]===id))plan.links[tab].push([id].concat(values));};(legacy.persons||[]).forEach(p=>{(p.name&&p.name.nicknames||[]).forEach((v,i)=>add('PersonNicknames','nickname_'+p.id+'_'+i,[p.id,v]));(p.tags||[]).forEach(v=>add('PersonTags','tag_'+p.id+'_'+slugCell_(v),[p.id,v]));});(legacy.unions||[]).forEach(u=>(u.partner_ids||[]).forEach(id=>add('UnionPartners','unionpartner_'+u.id+'_'+id,[u.id,id,displayNameFromLegacy_(legacy,id)])));(legacy.events||[]).forEach(e=>{(e.people||[]).forEach(x=>add('EventPeople','eventperson_'+e.id+'_'+x.person_id,[e.id,x.person_id,displayNameFromLegacy_(legacy,x.person_id),x.role||'participant']));(e.branch_ids||[]).forEach(id=>add('EventBranches','eventbranch_'+e.id+'_'+id,[e.id,id]));(e.media_ids||[]).forEach(id=>add('EventMedia','eventmedia_'+e.id+'_'+id,[e.id,id]));});(legacy.stories||[]).forEach(s=>{(s.people_ids||[]).forEach(id=>add('StoryPeople','storypeople_'+s.id+'_'+id,[s.id,id,displayNameFromLegacy_(legacy,id)]));(s.event_ids||[]).forEach(id=>add('StoryEvents','storyevent_'+s.id+'_'+id,[s.id,id]));});(legacy.media||[]).forEach(m=>{(m.people_ids||[]).forEach(id=>add('MediaPeople','mediaperson_'+m.id+'_'+id,[m.id,id,displayNameFromLegacy_(legacy,id)]));(m.event_ids||[]).forEach(id=>add('MediaEvents','mediaevent_'+m.id+'_'+id,[m.id,id]));(m.branch_ids||[]).forEach(id=>add('MediaBranches','mediabranch_'+m.id+'_'+id,[m.id,id]));});return plan;}
function slugCell_(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'value';}
function displayNameFromLegacy_(d,id){const p=(d.persons||[]).find(x=>x.id===id);return p&&p.name&&(p.name.display||[p.name.first,p.name.last].filter(Boolean).join(' '))||'';}
function flatMigration_(dryRun){ensureWorkbook_();const plan=flatMigrationPlan_(),report={ok:true,dry_run:dryRun,storageMode:STORAGE_MODE,schemaVersion:SCHEMA_VERSION,create:0,existing:0,unmappedFields:plan.unknownFields,conflicts:[],bySheet:{},backupSheet:null};if(!dryRun){const name='FlatBackup_'+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMdd_HHmmss'),s=SpreadsheetApp.getActiveSpreadsheet().insertSheet(name);s.appendRow(['created_at','legacy_json','flat_json']);s.appendRow([new Date().toISOString(),JSON.stringify(legacyDataset_()),JSON.stringify({flat:Object.keys(FLAT_CONFIG).reduce((o,t)=>(o[t]=readRows_(FLAT_CONFIG[t].sheet),o),{}),links:Object.keys(LINK_TABS).reduce((o,t)=>(o[t]=readRows_(t),o),{}),normalized:Object.keys(NORMALIZED_TABS).reduce((o,t)=>(o[t]=readRows_(t),o),{})})]);report.backupSheet=name;}const groups=[];Object.keys(plan.flat).forEach(t=>groups.push([FLAT_CONFIG[t].sheet,plan.flat[t],FLAT_CONFIG[t].headers]));Object.keys(plan.links).forEach(t=>groups.push([t,plan.links[t],LINK_TABS[t]]));Object.keys(plan.normalized).forEach(t=>groups.push([t,plan.normalized[t],NORMALIZED_TABS[t]]));groups.forEach(([name,rows,headers])=>{const current=new Set(readRows_(name).map(r=>String(r[headers[0]]))),create=rows.filter(r=>!current.has(String(r[0])));report.create+=create.length;report.existing+=rows.length-create.length;report.bySheet[name]={create:create.length,existing:rows.length-create.length};if(!dryRun&&create.length)getSheetOrThrow_(name).getRange(getSheetOrThrow_(name).getLastRow()+1,1,create.length,headers.length).setValues(create);});if(!dryRun){const v=verifyFlatMigration_();report.verification=v;if(v.ok)saveFlatSetting_('storage_schema',{schemaVersion:SCHEMA_VERSION,storageMode:STORAGE_MODE,lastVerifiedAt:v.verifiedAt,backupSheet:report.backupSheet});}return report;}
function validateWorkbook_(){const errors=[],warnings=[],people=new Set(flatObjects_('persons').map(r=>r.id)),branches=new Set(flatObjects_('branches').map(r=>r.id)),unions=new Set(flatObjects_('unions').map(r=>r.id)),households=new Set(flatObjects_('households').map(r=>r.id));const validPrivacy=new Set(['public','family','private','admin']);flatObjects_('persons').forEach(r=>{if(!r.id)errors.push('People row missing id');if(r.privacy&&!validPrivacy.has(r.privacy))errors.push('Invalid person privacy: '+r.id)});const checkDup=name=>{const ids=readRows_(name).map(r=>r.id),n=ids.length-new Set(ids).size;if(n)errors.push(name+' has '+n+' duplicate IDs');return n;};Object.keys(NORMALIZED_TABS).concat(Object.keys(LINK_TABS)).forEach(checkDup);readRows_('ParentRelationships').forEach(r=>{if(!people.has(r.parent_id)||!people.has(r.child_id))errors.push('Broken parent relationship '+r.id);if(r.parent_id===r.child_id)errors.push('Self-parent '+r.id)});readRows_('BranchMemberships').forEach(r=>{if(!people.has(r.person_id)||!branches.has(r.branch_id))errors.push('Broken branch membership '+r.id)});readRows_('UnionChildren').forEach(r=>{if(!unions.has(r.union_id)||!people.has(r.child_id))errors.push('Broken union child '+r.id)});readRows_('HouseholdMembers').forEach(r=>{if(!households.has(r.household_id)||!people.has(r.person_id))errors.push('Broken household member '+r.id)});return {ok:errors.length===0,storageMode:STORAGE_MODE,schemaVersion:SCHEMA_VERSION,errors:errors,warnings:warnings,errorCount:errors.length,warningCount:warnings.length};}
function verifyFlatMigration_(){const validation=validateWorkbook_(),legacy=legacyDataset_(),counts={people:[(legacy.persons||[]).length,flatObjects_('persons').length],branches:[(legacy.branches||[]).length,flatObjects_('branches').length],unions:[(legacy.unions||[]).length,flatObjects_('unions').length],households:[(legacy.households||[]).length,flatObjects_('households').length]},missing=Object.keys(counts).filter(k=>counts[k][1]<counts[k][0]);return {ok:validation.ok&&missing.length===0,storageMode:STORAGE_MODE,schemaVersion:SCHEMA_VERSION,counts:counts,missingEntityTypes:missing,validation:validation,verifiedAt:new Date().toISOString()};}
function rollbackFlatMigration_(backup){if(!backup||backup.indexOf('FlatBackup_')!==0)throw new Error('Valid FlatBackup sheet required');const row=readRows_(backup)[0];if(!row)throw new Error('Backup empty');const state=parseJson_(row.flat_json,{});const restore=(name,headers,records)=>{const s=getSheetOrThrow_(name);if(s.getLastRow()>1)s.getRange(2,1,s.getLastRow()-1,s.getLastColumn()).clearContent();if(records&&records.length){const values=records.map(r=>headers.map(h=>r[h]||''));s.getRange(2,1,values.length,headers.length).setValues(values);}};Object.keys(FLAT_CONFIG).forEach(t=>restore(FLAT_CONFIG[t].sheet,FLAT_CONFIG[t].headers,state.flat&&state.flat[t]));Object.keys(LINK_TABS).forEach(t=>restore(t,LINK_TABS[t],state.links&&state.links[t]));Object.keys(NORMALIZED_TABS).forEach(t=>restore(t,NORMALIZED_TABS[t],state.normalized&&state.normalized[t]));return {ok:true,rolledBackFrom:backup};}
function previewFlatSheetMigration(){return flatMigration_(true);}function runFlatSheetMigration(){return flatMigration_(false);}function verifyFlatSheetMigration(){return verifyFlatMigration_();}function rollbackFlatSheetMigration(backup){return rollbackFlatMigration_(backup);}function validateWorkbook(){return validateWorkbook_();}
function diagnostics_(){const v=verifyFlatMigration_(),schema=flatObjects_('settings').find(r=>r.key==='storage_schema'),stored=parseJson_(schema&&schema.value,{}),totals={};Object.keys(FLAT_CONFIG).forEach(t=>totals[FLAT_CONFIG[t].sheet]=flatObjects_(t).length);Object.keys(NORMALIZED_TABS).forEach(t=>totals[t]=readRows_(t).length);Object.keys(LINK_TABS).forEach(t=>totals[t]=readRows_(t).length);return {ok:v.ok&&stored.storageMode===STORAGE_MODE,readiness:v.ok&&stored.storageMode===STORAGE_MODE?'ready':'not-ready',storageMode:STORAGE_MODE,storage_mode:STORAGE_MODE,schemaVersion:SCHEMA_VERSION,schema_version:SCHEMA_VERSION,manualEditingFormat:'flat-columns-and-normalized-links',legacyJsonTabs:'read-only-backup',migrationStatus:stored.storageMode===STORAGE_MODE?'verified':'required',lastSuccessfulVerification:stored.lastVerifiedAt||null,rollbackDataExists:!!stored.backupSheet,rollbackSheet:stored.backupSheet||null,recordTotals:totals,validation:v.validation};}

// Ensure operational settings are expanded into scalar dotted-key rows. These
// declarations supersede the compatibility wrappers above.
function findUnmappedLegacyFields_(legacy){const known={persons:['id','name','gender','is_living','birth','death','bio','cover_media_id','confidence','privacy','relationships','branch_ids','branch_memberships','primary_branch_id','tags','sources','created_at','updated_at','status'],branches:['id','slug','name','short_name','branch_type','summary','description','long_history','hero_media_id','color','era_start','era_end','privacy','connected_branches','child_branch_ids','parent_branch_id','root_person_id','root_person_ids','anchor_person_ids','surnames','legacy_themes','featured_records','created_at','updated_at'],events:['id','type','title','description','date','location_id','people','branch_ids','media_ids','privacy','status','tags','sources','created_at','updated_at'],stories:['id','type','title','body','era','told_by','told_date','people_ids','event_ids','privacy','status','tags','sources','created_at','updated_at'],media:['id','type','title','description','storage','date','location_id','people_ids','event_ids','branch_ids','privacy','tags','sources','created_at','updated_at'],sources:['id','title','type','date','location','location_id','url','drive_file_id','notes','reliability','privacy','created_at','updated_at'],unions:['id','partner_ids','child_ids','relationship_type','status','start_date','end_date','location_id','privacy','notes','source_ids','current','created_at','updated_at'],households:['id','name','adult_ids','child_ids','member_ids','location_id','date_start','date_end','start_date','end_date','privacy','notes','source_ids','created_at','updated_at']},out=[];Object.keys(known).forEach(type=>(legacy[type]||[]).forEach(r=>Object.keys(r).forEach(k=>{if(!known[type].includes(k))out.push({record_type:type,record_id:r.id||'',field:k,value:String(r[k])})})));return out;}
function previewFlatSheetMigration(){const report=flatMigration_(true);report.settingsRows='scalar dotted keys (no JSON operational values)';report.unmappedFields=findUnmappedLegacyFields_(legacyDataset_());return report;}
function runFlatSheetMigration(){const legacy=legacyDataset_(),unmapped=findUnmappedLegacyFields_(legacy),report=flatMigration_(false);deleteRow_(FLAT_CONFIG.settings.sheet,'key','meta');deleteRow_(FLAT_CONFIG.settings.sheet,'key','settings');saveFlatSetting_('meta',legacy.meta||{});saveFlatSetting_('settings',legacy.settings||{});report.unmappedFields=unmapped;const verified=verifyFlatMigration_();report.verification=verified;if(verified.ok&&unmapped.length===0)saveFlatSetting_('storage_schema',{schemaVersion:SCHEMA_VERSION,storageMode:STORAGE_MODE,lastVerifiedAt:verified.verifiedAt,backupSheet:report.backupSheet});else report.ok=false;return report;}
function diagnostics_(){const v=verifyFlatMigration_(),settings=flatObjects_('settings'),value=key=>(settings.find(r=>r.key===key)||{}).value,mode=value('storage_schema.storageMode'),totals={};Object.keys(FLAT_CONFIG).forEach(t=>totals[FLAT_CONFIG[t].sheet]=flatObjects_(t).length);Object.keys(NORMALIZED_TABS).forEach(t=>totals[t]=readRows_(t).length);Object.keys(LINK_TABS).forEach(t=>totals[t]=readRows_(t).length);return {ok:v.ok&&mode===STORAGE_MODE,readiness:v.ok&&mode===STORAGE_MODE?'ready':'not-ready',storageMode:STORAGE_MODE,storage_mode:STORAGE_MODE,schemaVersion:SCHEMA_VERSION,schema_version:SCHEMA_VERSION,manualEditingFormat:'flat-columns-and-normalized-links',legacyJsonTabs:'read-only-backup',migrationStatus:mode===STORAGE_MODE?'verified':'required',lastSuccessfulVerification:value('storage_schema.lastVerifiedAt')||null,rollbackDataExists:!!value('storage_schema.backupSheet'),rollbackSheet:value('storage_schema.backupSheet')||null,recordTotals:totals,validation:v.validation};}
function assembleExtendedLinks_(d){const by=(list)=>Object.fromEntries(list.map(x=>[x.id,x])),people=by(d.persons),events=by(d.events),stories=by(d.stories),media=by(d.media),branches=by(d.branches);readRows_('StoryPeople').forEach(r=>{if(stories[r.story_id]&&people[r.person_id])stories[r.story_id].people_ids.push(r.person_id)});readRows_('StoryEvents').forEach(r=>{if(stories[r.story_id]&&events[r.event_id])stories[r.story_id].event_ids.push(r.event_id)});readRows_('EventPeople').forEach(r=>{if(events[r.event_id]&&people[r.person_id])events[r.event_id].people.push({person_id:r.person_id,role:r.role||'participant'})});readRows_('EventBranches').forEach(r=>{if(events[r.event_id]&&branches[r.branch_id])events[r.event_id].branch_ids.push(r.branch_id)});readRows_('EventMedia').forEach(r=>{if(events[r.event_id]&&media[r.media_id])events[r.event_id].media_ids.push(r.media_id)});readRows_('MediaPeople').forEach(r=>{if(media[r.media_id]&&people[r.person_id])media[r.media_id].people_ids.push(r.person_id)});readRows_('MediaEvents').forEach(r=>{if(media[r.media_id]&&events[r.event_id])media[r.media_id].event_ids.push(r.event_id)});readRows_('MediaBranches').forEach(r=>{if(media[r.media_id]&&branches[r.branch_id])media[r.media_id].branch_ids.push(r.branch_id)});readRows_('RecordSources').forEach(r=>{const collection={person:people,branch:branches,event:events,story:stories,media:media}[r.record_type];if(collection&&collection[r.record_id]){collection[r.record_id].sources=collection[r.record_id].sources||[];collection[r.record_id].sources.push(r.source_id);}});readRows_('LegacyThemes').forEach(r=>{if(branches[r.branch_id]){branches[r.branch_id].legacy_themes=branches[r.branch_id].legacy_themes||[];branches[r.branch_id].legacy_themes.push(r.theme)}});readRows_('FeaturedRecords').forEach(r=>{if(branches[r.branch_id]){branches[r.branch_id].featured_records=branches[r.branch_id].featured_records||[];branches[r.branch_id].featured_records.push({record_type:r.record_type,record_id:r.record_id})}});readRows_('BranchSurnames').forEach(r=>{if(branches[r.branch_id]){branches[r.branch_id].surnames=branches[r.branch_id].surnames||[];branches[r.branch_id].surnames.push(r.surname)}});}
var getAllFlatCore_=getAll_;
getAll_=function(){const dataset=getAllFlatCore_();assembleExtendedLinks_(dataset);return dataset;};
var flatRowCore_=flatRow_;
flatRow_=function(type,r){if(type!=='events')return flatRowCore_(type,r);const now=new Date().toISOString(),map={id:r.id,type:r.type,title:r.title,description:r.description,start_date:r.date&&r.date.start,end_date:r.date&&r.date.end,date_display:r.date&&r.date.display,date_certainty:r.date&&r.date.certainty,recurrence_type:r.recurrence&&r.recurrence.type,recurrence_month:r.recurrence&&r.recurrence.month,recurrence_day:r.recurrence&&r.recurrence.day,location_id:r.location_id,privacy:r.privacy,status:r.status,created_at:r.created_at,updated_at:now};return FLAT_CONFIG.events.headers.map(h=>map[h]==null?'':map[h]);};
var flatMigrationPlanCore_=flatMigrationPlan_;
flatMigrationPlan_=function(){const plan=flatMigrationPlanCore_(),legacy=legacyDataset_();['events','stories','media','branches'].forEach(type=>(legacy[type]||[]).forEach(record=>(record.tags||[]).forEach(tag=>{const id='recordtag_'+type+'_'+record.id+'_'+slugCell_(tag);if(!plan.links.RecordTags.some(r=>r[0]===id))plan.links.RecordTags.push([id,type.slice(0,-1),record.id,tag]);})));return plan;};
var getAllWithExtendedLinks_=getAll_;
getAll_=function(){const d=getAllWithExtendedLinks_(),eventRows=Object.fromEntries(flatObjects_('events').map(r=>[r.id,r]));d.events.forEach(e=>{const r=eventRows[e.id]||{};e.recurrence={type:r.recurrence_type||'none',month:r.recurrence_month?Number(r.recurrence_month):undefined,day:r.recurrence_day?Number(r.recurrence_day):undefined};});const collections={person:Object.fromEntries(d.persons.map(x=>[x.id,x])),branch:Object.fromEntries(d.branches.map(x=>[x.id,x])),event:Object.fromEntries(d.events.map(x=>[x.id,x])),story:Object.fromEntries(d.stories.map(x=>[x.id,x])),media:Object.fromEntries(d.media.map(x=>[x.id,x]))};readRows_('RecordTags').forEach(r=>{const item=collections[r.record_type]&&collections[r.record_type][r.record_id];if(item){item.tags=item.tags||[];item.tags.push(r.tag);}});return d;};
function replacePersonProfileLinks_(person){if(!person||!person.id)throw new Error('Person id required');['PersonNicknames','PersonTags','BranchMemberships'].forEach(name=>deleteRowsByField_(name,'person_id',person.id));readRows_('RecordSources').filter(r=>r.record_type==='person'&&r.record_id===person.id).forEach(r=>deleteRow_('RecordSources','id',r.id));(person.name&&person.name.nicknames||[]).forEach((v,i)=>saveLink_('PersonNicknames',{id:'nickname_'+person.id+'_'+i,person_id:person.id,nickname:v}));(person.tags||[]).forEach(v=>saveLink_('PersonTags',{id:'tag_'+person.id+'_'+slugCell_(v),person_id:person.id,tag:v}));(person.sources||[]).forEach(id=>saveLink_('RecordSources',{id:'source_person_'+person.id+'_'+id,record_type:'person',record_id:person.id,source_id:id}));(person.branch_memberships||[]).forEach(m=>saveNormalized_('BranchMemberships',{id:m.membership_id||('membership_'+person.id+'_'+m.branch_id+'_'+(m.connection_type||'descent')),person_id:person.id,branch_id:m.branch_id,connection_type:m.connection_type||'descent',primary:!!m.primary,status:m.status||'confirmed',through_person_id:m.through_person_id||'',source_ids:m.source_ids||[]}));return {ok:true,storage_mode:STORAGE_MODE,schema_version:SCHEMA_VERSION};}
var flatMigrationPlanWithTags_=flatMigrationPlan_;
flatMigrationPlan_=function(){const plan=flatMigrationPlanWithTags_(),legacy=legacyDataset_(),add=(id,bid,pid,role)=>{if(pid&&!plan.links.BranchPeople.some(r=>r[0]===id))plan.links.BranchPeople.push([id,bid,pid,role]);};(legacy.branches||[]).forEach(b=>{add('branchperson_'+b.id+'_'+b.root_person_id+'_root',b.id,b.root_person_id,'root');(b.root_person_ids||[]).forEach(id=>add('branchperson_'+b.id+'_'+id+'_root',b.id,id,'root'));(b.anchor_person_ids||[]).forEach(id=>add('branchperson_'+b.id+'_'+id+'_anchor',b.id,id,'anchor'));(b.surnames||[]).forEach(v=>{const id='surname_'+b.id+'_'+slugCell_(v);if(!plan.links.BranchSurnames.some(r=>r[0]===id))plan.links.BranchSurnames.push([id,b.id,v]);});(b.legacy_themes||[]).forEach(v=>{const id='theme_'+b.id+'_'+slugCell_(v);if(!plan.links.LegacyThemes.some(r=>r[0]===id))plan.links.LegacyThemes.push([id,b.id,v]);});});return plan;};
var getAllWithBranchRoles_=getAll_;
getAll_=function(){const d=getAllWithBranchRoles_(),branches=Object.fromEntries(d.branches.map(b=>[b.id,b]));d.branches.forEach(b=>{b.root_person_ids=[];b.anchor_person_ids=[];b.root_person_id=null;});readRows_('BranchPeople').forEach(r=>{const b=branches[r.branch_id];if(!b)return;if(r.role==='root'){b.root_person_ids.push(r.person_id);if(!b.root_person_id)b.root_person_id=r.person_id;}if(r.role==='anchor')b.anchor_person_ids.push(r.person_id);});return d;};
