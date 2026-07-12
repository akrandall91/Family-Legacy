// data-access.js
// Central in-memory data store (D), Google Sheets sync/API calls,
// admin-scoped dataset helpers, and structured-record data utilities.
// SECURITY NOTE: FAMILY_API_URL below is a public Apps Script endpoint.
// It is callable by anyone; see README/GOOGLE-SHEETS-SCHEMA for limits.

// ============================================================
// ENGINE
// ============================================================

let D = structuredClone(FamilyData);

// Lookup helpers
const getPerson = id => D.persons.find(p => p.id === id);
const getEvent  = id => D.events.find(e => e.id === id);
const getBranch = id => D.branches.find(b => b.id === id);
const getMedia  = id => D.media.find(m => m.id === id);
const getLoc    = id => id && D.locations[id] ? D.locations[id].short : '';


const FAMILY_API_URL = 'https://script.google.com/macros/s/AKfycbwJX8dOnm2hqfmvBkRlbdwU95oOp4s5xOj6nDlJDPEs58c7a1YHeviEUJvv7m_ZPP6wGw/exec';
let centralDataAvailable = false;
let syncStatusTimer = null;
let lastSuccessfulCentralLoad = null;
let lastSuccessfulCentralSave = null;
const REQUIRED_STORAGE_MODE = 'flat-normalized-authoritative';
const REQUIRED_SCHEMA_VERSION = 4;

function showSyncStatus(message, status = '') {
  const banner = document.getElementById('sync-status-banner');
  if (!banner) return;
  clearTimeout(syncStatusTimer);
  banner.className = `sync-status-banner ${status}`.trim();
  banner.textContent = message;
  if (status === 'success') {
    syncStatusTimer = setTimeout(() => { banner.textContent = ''; }, 3200);
  }
}

async function familyApi(action, payload = null) {
  const options = payload ? {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload })
  } : {};
  const url = payload ? FAMILY_API_URL : `${FAMILY_API_URL}?action=${encodeURIComponent(action)}`;
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`API request failed (${response.status})`);
  const result = await response.json();
  if (result.ok === false || result.error) throw new Error(result.error || 'API request failed');
  return result;
}

async function loadCentralFamilyData() {
  try {
    const result = await familyApi('getAll');
    if (!result.initialized || !Array.isArray(result.persons) || !result.meta?.family_name) {
      throw new Error('Google Sheet is not initialized with family data');
    }
    if (result.storage_mode !== REQUIRED_STORAGE_MODE || Number(result.schema_version) < REQUIRED_SCHEMA_VERSION) throw new Error('The Google Sheet requires the flat schema v4 migration');
    D = result;
    D.pendingSubmissions = result.pendingSubmissions || [];
    centralDataAvailable = true;
    lastSuccessfulCentralLoad = new Date().toISOString();
    showSyncStatus('Connected to the shared family archive.', 'success');
  } catch (error) {
    D = structuredClone(FamilyData);
    D.pendingSubmissions = [];
    centralDataAvailable = false;
    showSyncStatus('Local/offline mode — shared changes are unavailable until Google Sheets is initialized.', 'error');
  }
}

async function reloadCentralData() {
  const result = await familyApi('getAll');
  if (!result.initialized || !Array.isArray(result.persons)) throw new Error('Shared archive is not initialized');
  if (result.storage_mode !== REQUIRED_STORAGE_MODE || Number(result.schema_version) < REQUIRED_SCHEMA_VERSION) throw new Error('Shared archive is not using flat-normalized-authoritative schema v4');
  D = result;
  D.pendingSubmissions = result.pendingSubmissions || [];
  centralDataAvailable = true;
  lastSuccessfulCentralLoad = new Date().toISOString();
  rebuildFamilyIndexes();
  refreshAllDerivedViews();
  return D;
}

async function persistRecord(type, record) {
  if (!centralDataAvailable) {
    showSyncStatus('Saved locally only — the shared archive is unavailable.', 'error');
    return false;
  }
  try {
    const action = type === 'persons' ? 'savePersonProfile' : type === 'branches' ? 'saveBranch' : type === 'unions' ? 'saveUnion' : type === 'households' ? 'saveHousehold' : 'saveRecord';
    await familyApi(action, action === 'saveRecord' ? { recordType: type, record } : { record });
    if (type === 'persons') await familyApi('replacePersonProfileLinks', { record });
    lastSuccessfulCentralSave = new Date().toISOString();
    showSyncStatus('Saved to the shared family archive.', 'success');
    return true;
  } catch (error) {
    showSyncStatus('Save failed — check your connection before leaving this page.', 'error');
    return false;
  }
}

async function persistAuthoritative(action, recordOrId) {
  if (!centralDataAvailable) { showSyncStatus('Changed locally only — deploy and migrate schema v4 for shared saves.', 'error'); return false; }
  try {
    const payload = typeof recordOrId === 'string' ? { id: recordOrId } : { record: recordOrId };
    const result = await familyApi(action, payload);
    if (result.storage_mode && result.storage_mode !== REQUIRED_STORAGE_MODE) throw new Error('Backend is not flat-normalized-authoritative');
    await reloadCentralData();
    lastSuccessfulCentralSave = new Date().toISOString();
    showSyncStatus('Saved to authoritative spreadsheet rows and verified after reload.', 'success');
    return true;
  } catch (error) { showSyncStatus(`Authoritative save failed: ${error.message}`, 'error'); return false; }
}

async function persistDelete(type, id) {
  if (!centralDataAvailable) {
    showSyncStatus('Deleted locally only — the shared archive is unavailable.', 'error');
    return false;
  }
  try {
    await familyApi('deleteRecord', { recordType: type, id });
    showSyncStatus('Deletion saved to the shared family archive.', 'success');
    return true;
  } catch (error) {
    showSyncStatus('Delete failed — check your connection.', 'error');
    return false;
  }
}

async function persistSettings() {
  return persistRecord('settings', D.settings);
}

async function submitContribution(payload) {
  if (!centralDataAvailable) {
    try {
      await fetch(FAMILY_API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      showSyncStatus('Sent to the legacy intake. Deploy the new Apps Script to enable central review.', 'success');
      return { ok: true, legacy: true };
    } catch (error) {
      showSyncStatus('Submission failed — check your connection and try again.', 'error');
      return null;
    }
  }
  try {
    const result = await familyApi('submitContribution', payload);
    showSyncStatus('Submitted for family review.', 'success');
    return result;
  } catch (error) {
    showSyncStatus('Submission failed — check your connection and try again.', 'error');
    return null;
  }
}

function resolveBranchForPerson(person) {
  return [getHomeBranchId()];
}

function buildLocationId(prefix) {
  return `${prefix}_${Date.now()}`;
}

function buildStoryExcerpt(body, limit = 180) {
  const clean = (body || '').trim();
  if (clean.length <= limit) return clean;
  return clean.slice(0, limit).trimEnd() + '…';
}

function refreshAllDerivedViews() {
  rebuildFamilyIndexes();
  renderHome();
  renderPeople();
  renderStories();
  renderTimeline();
  renderBranches();
  renderGallery();
  renderAdmin();
  if (currentPersonId) renderPersonPage();
  renderSearchResults((document.getElementById('search-page-input') || {}).value || '');
  renderPersonPicker('event');
  renderPersonPicker('story');
  treeRendered = false;
  if (currentPage === 'tree') {
    renderTree();
    treeRendered = true;
  }
}


function getNestedValue(object, path) {
  return path.split('.').reduce((value, key) => value == null ? undefined : value[key], object);
}

function setNestedValue(object, path, value) {
  const keys = path.split('.');
  let target = object;
  keys.slice(0, -1).forEach(key => {
    if (!target[key] || typeof target[key] !== 'object') target[key] = {};
    target = target[key];
  });
  target[keys.at(-1)] = value;
}

function getEditorRecords(type) {
  if (type === 'locations') return Object.entries(D.locations).map(([id, value]) => ({ id, ...value }));
  return type === adminEditorType && currentUserRole === 'family_admin' ? scopedRecords(type) : (D[type] || []);
}


function collectStructuredRecord(form, type, original) {
  const record = structuredClone(original);
  (RECORD_SCHEMAS[type] || []).forEach(field => {
    if (field.type === 'date') {
      const entry = form.querySelector(`[data-structured-date="${field.path}"]`);
      const approximate = entry.querySelector('.structured-date-approximate').checked;
      const exact = entry.querySelector('.structured-date-exact').value;
      const year = entry.querySelector('.structured-date-year').value;
      const month = entry.querySelector('.structured-date-month').value;
      const stored = approximate ? (year ? `${year}-${month || '00'}-00` : '0000-00-00') : (exact || '0000-00-00');
      const certainty = approximate ? (year ? 'estimated' : 'unknown') : (exact ? 'exact' : 'unknown');
      const display = stored === '0000-00-00' ? 'Unknown' : stored;
      setNestedValue(record, field.path, field.shape === 'event' ? { ...(getNestedValue(record, field.path) || {}), start: stored, display, certainty } : field.shape === 'media' ? { ...(getNestedValue(record, field.path) || {}), value: stored, display, certainty } : { ...(getNestedValue(record, field.path) || {}), date: stored, display, certainty });
      return;
    }
    if (['persons','branches','personRoles','spouses'].includes(field.type)) {
      const values = [...form.querySelectorAll(`[data-multi-field="${field.path}"]:checked`)].map(input => input.value);
      setNestedValue(record, field.path, field.type === 'personRoles' ? values.map(person_id => ({ person_id, role: 'participant' })) : field.type === 'spouses' ? values.map(person_id => ({ person_id, relationship_id: `rel_${[record.id, person_id].sort().join('_')}` })) : values);
      return;
    }
    const input = form.querySelector(`[data-field="${field.path}"]`);
    if (!input) return;
    let value = input.dataset.fieldType === 'toggle' ? input.checked : input.value;
    if (input.dataset.fieldType === 'list') value = input.value.split(',').map(item => item.trim()).filter(Boolean);
    if (input.dataset.fieldType === 'number') value = input.value === '' ? null : Number(input.value);
    setNestedValue(record, field.path, value === '' && ['name.maiden','parent_branch_id','location_id','told_by'].includes(field.path) ? null : value);
  });
  if (type === 'persons') record.name.display = [record.name.first, record.name.last].filter(Boolean).join(' ');
  return record;
}

function syncPersonRelationships(original, record) {
  const changed = new Map([[record.id, record]]);
  const updateReciprocal = (otherId, field, add, value) => {
    const other = getPerson(otherId);
    if (!other || other.id === record.id) return;
    const copy = changed.get(other.id) || structuredClone(other);
    const list = copy.relationships[field] || [];
    if (field === 'spouses') {
      const without = list.filter(item => item.person_id !== record.id);
      copy.relationships[field] = add ? [...without, value] : without;
    } else {
      copy.relationships[field] = add ? [...new Set([...list, record.id])] : list.filter(item => item !== record.id);
    }
    changed.set(copy.id, copy);
  };
  const oldParents = new Set(original.relationships?.parents || []);
  const newParents = new Set(record.relationships?.parents || []);
  oldParents.forEach(id => { if (!newParents.has(id)) updateReciprocal(id, 'children', false); });
  newParents.forEach(id => updateReciprocal(id, 'children', true));
  const oldChildren = new Set(original.relationships?.children || []);
  const newChildren = new Set(record.relationships?.children || []);
  oldChildren.forEach(id => { if (!newChildren.has(id)) updateReciprocal(id, 'parents', false); });
  newChildren.forEach(id => updateReciprocal(id, 'parents', true));
  const oldSpouses = new Set((original.relationships?.spouses || []).map(item => item.person_id));
  const newSpouses = new Set((record.relationships?.spouses || []).map(item => item.person_id));
  oldSpouses.forEach(id => { if (!newSpouses.has(id)) updateReciprocal(id, 'spouses', false); });
  newSpouses.forEach(id => updateReciprocal(id, 'spouses', true, { person_id: record.id, relationship_id: `rel_${[record.id, id].sort().join('_')}` }));
  return [...changed.values()];
}
