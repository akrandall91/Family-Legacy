// render-admin.js
// Admin authentication/session scoping, structured record editor UI,
// Admin dashboard tabs, profile types, family admins, pending review,
// CSV/data export, and duplicate detection.

// NOT SECURE: this site is entirely static, so the password and all gate
// logic are visible in the public source. This only discourages casual
// visitors; it does not protect private data or replace real authentication.
function simplePasswordHash(value) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function restoreAdminSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem('familyLegacyAdminSession') || 'null');
    currentUserRole = session?.role || null;
    currentUserName = session?.name || '';
    currentUserBranchIds = Array.isArray(session?.branch_ids) ? session.branch_ids : [];
  } catch (error) {
    currentUserRole = null;
    currentUserName = '';
    currentUserBranchIds = [];
  }
  return Boolean(currentUserRole);
}

function renderProtectedPage(name) {
  if (restoreAdminSession()) {
    if (name === 'edit-data' && currentUserRole !== 'super_admin') {
      const root = document.getElementById('edit-data-root');
      root.innerHTML = `<div class="inline-message error">The full data editor is available to the Super Admin only. <button class="profile-change-link" type="button" onclick="showPage('admin')">Return to Admin</button></div>`;
      return;
    }
    if (name === 'admin') renderAdmin();
    if (name === 'edit-data') renderEditData();
    return;
  }

  const root = document.getElementById(name === 'admin' ? 'admin-root' : 'edit-data-root');
  if (!root) return;
  root.innerHTML = `
    <div class="admin-card password-gate">
      <div class="mini-section-title">Family Admin Access</div>
      <p class="page-intro" style="margin-bottom:18px;">Enter a Super Admin or Family Admin password to continue.</p>
      <form onsubmit="unlockProtectedPage(event, '${name}')">
        <div class="form-field">
          <label class="form-label" for="${name}-password">Password</label>
          <input class="legacy-input" id="${name}-password" type="password" autocomplete="current-password" required>
        </div>
        <div id="${name}-gate-message" style="margin-top:14px;"></div>
        <button class="export-btn" type="submit">Unlock</button>
      </form>
    </div>
  `;
}

function unlockProtectedPage(event, name) {
  event.preventDefault();
  const input = document.getElementById(`${name}-password`);
  const message = document.getElementById(`${name}-gate-message`);
  if (!input) return;
  const passwordHash = simplePasswordHash(input.value);
  let session = null;
  if (passwordHash === D.settings.admin_password_hash) {
    session = { role: 'super_admin', name: 'Super Admin', branch_ids: [] };
  } else {
    const familyAdmin = (D.settings.family_admins || []).find(admin => admin.password_hash === passwordHash);
    if (familyAdmin) session = { role: 'family_admin', name: familyAdmin.name, branch_ids: familyAdmin.branch_ids || [] };
  }
  if (!session) {
    if (message) message.innerHTML = '<div class="inline-message error">That password did not match.</div>';
    input.select();
    return;
  }
  try {
    sessionStorage.setItem('familyLegacyAdminSession', JSON.stringify(session));
  } catch (error) {
    // The page can still unlock if storage is unavailable.
  }
  currentUserRole = session.role;
  currentUserName = session.name;
  currentUserBranchIds = session.branch_ids;
  if (name === 'admin') renderAdmin();
  if (name === 'edit-data') renderEditData();
}

function logoutAdmin() {
  try { sessionStorage.removeItem('familyLegacyAdminSession'); } catch (error) {}
  currentUserRole = null;
  currentUserName = '';
  currentUserBranchIds = [];
  adminTab = 'overview';
  renderProtectedPage(currentPage === 'edit-data' ? 'edit-data' : 'admin');
}

function recordInAdminScope(record) {
  if (currentUserRole === 'super_admin') return true;
  return (record.branch_ids || []).some(id => currentUserBranchIds.includes(id));
}

function scopedRecords(type) {
  if (currentUserRole === 'super_admin') return D[type] || [];
  return (D[type] || []).filter(recordInAdminScope);
}

function getScopedDataset() {
  if (currentUserRole === 'super_admin') return D;
  const persons = scopedRecords('persons');
  const personIds = new Set(persons.map(person => person.id));
  return {
    ...D,
    branches: D.branches.filter(branch => currentUserBranchIds.includes(branch.id)),
    persons,
    events: scopedRecords('events'),
    stories: scopedRecords('stories'),
    media: D.media.filter(media => (media.people_ids || []).some(id => personIds.has(id))),
    locations: D.locations,
    sources: D.sources
  };
}


function renderChoiceChecks(path, values, options, labelKey = 'name') {
  const selected = new Set(values || []);
  return `<div class="profile-field-toggles structured-check-grid">${options.map(option => `<label class="profile-field-toggle"><input type="checkbox" data-multi-field="${path}" value="${option.id}" ${selected.has(option.id) ? 'checked' : ''}> ${escapeHtml(labelKey === 'name' ? option.name?.display || option.name : option.label)}</label>`).join('')}</div>`;
}

function normalizeDateForForm(value, shape) {
  const stored = shape === 'event' ? value?.start : shape === 'media' ? value?.value : value?.date;
  const certainty = value?.certainty || 'unknown';
  const match = String(stored || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return { exact: certainty === 'exact' && match && !stored.includes('00') ? stored : '', approximate: certainty !== 'exact', year: match && match[1] !== '0000' ? match[1] : '', month: match && match[2] !== '00' ? match[2] : '' };
}

function renderStructuredField(field, record, context) {
  const value = getNestedValue(record, field.path);
  const full = field.full ? ' full' : '';
  const base = `<label class="form-label">${escapeHtml(field.label)}</label>`;
  if (field.type === 'textarea') return `<div class="form-field${full}">${base}<textarea class="legacy-textarea" data-field="${field.path}">${escapeHtml(value || '')}</textarea></div>`;
  if (field.type === 'select') return `<div class="form-field${full}">${base}<select class="legacy-select" data-field="${field.path}">${field.options.map(option => `<option value="${option}" ${value === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select></div>`;
  if (field.type === 'toggle') return `<div class="form-field${full}">${base}<label class="profile-field-toggle"><input type="checkbox" data-field="${field.path}" data-field-type="toggle" ${value ? 'checked' : ''}> Yes</label></div>`;
  if (field.type === 'list') return `<div class="form-field${full}">${base}<input class="legacy-input" data-field="${field.path}" data-field-type="list" value="${escapeHtml((value || []).join(', '))}"></div>`;
  if (field.type === 'number') return `<div class="form-field${full}">${base}<input class="legacy-input" type="number" step="0.01" data-field="${field.path}" data-field-type="number" value="${value ?? ''}"></div>`;
  if (field.type === 'color') return `<div class="form-field${full}">${base}<input class="legacy-input" type="color" data-field="${field.path}" value="${escapeHtml(value || '#a4674d')}"></div>`;
  if (field.type === 'person') return `<div class="form-field${full}">${base}<select class="legacy-select" data-field="${field.path}"><option value="">None</option>${D.persons.map(person => `<option value="${person.id}" ${value === person.id ? 'selected' : ''}>${escapeHtml(person.name.display)}</option>`).join('')}</select></div>`;
  if (field.type === 'branch') return `<div class="form-field${full}">${base}<select class="legacy-select" data-field="${field.path}"><option value="">None</option>${D.branches.map(branch => `<option value="${branch.id}" ${value === branch.id ? 'selected' : ''}>${escapeHtml(branch.name)}</option>`).join('')}</select></div>`;
  if (field.type === 'location') return `<div class="form-field${full}">${base}<select class="legacy-select" data-field="${field.path}"><option value="">None</option>${Object.entries(D.locations).map(([id, location]) => `<option value="${id}" ${value === id ? 'selected' : ''}>${escapeHtml(location.name || location.short || id)}</option>`).join('')}</select></div>`;
  if (field.type === 'persons') return `<div class="form-field${full}">${base}${renderChoiceChecks(field.path, value, D.persons)}</div>`;
  if (field.type === 'branches') return `<div class="form-field${full}">${base}${renderChoiceChecks(field.path, value, D.branches.map(branch => ({ id: branch.id, label: branch.name })), 'label')}</div>`;
  if (field.type === 'personRoles') return `<div class="form-field${full}">${base}${renderChoiceChecks(field.path, (value || []).map(item => item.person_id), D.persons)}</div>`;
  if (field.type === 'spouses') return `<div class="form-field${full}">${base}${renderChoiceChecks(field.path, (value || []).map(item => item.person_id), D.persons)}</div>`;
  if (field.type === 'plainDate') return `<div class="form-field${full}">${base}<input class="legacy-input" type="date" data-field="${field.path}" value="${String(value || '').replace(/-00/g, '-01')}"></div>`;
  if (field.type === 'date') {
    const date = normalizeDateForForm(value, field.shape);
    const prefix = `${context}-${field.path.replace(/\./g, '-')}`;
    return `<div class="form-field${full}">${base}<div class="date-entry" data-structured-date="${field.path}" data-date-shape="${field.shape}" data-date-prefix="${prefix}">
      <input class="legacy-input structured-date-exact" type="date" value="${date.exact}" ${date.approximate ? 'disabled' : ''}>
      <label class="profile-field-toggle"><input class="structured-date-approximate" type="checkbox" ${date.approximate ? 'checked' : ''} onchange="toggleStructuredDate(this)"> I don't know the exact date</label>
      <div class="date-approx-fields" ${date.approximate ? '' : 'hidden'}><input class="legacy-input structured-date-year" type="number" min="1000" max="9999" placeholder="Year" value="${date.year}"><select class="legacy-select structured-date-month"><option value="">Month unknown</option>${['January','February','March','April','May','June','July','August','September','October','November','December'].map((month, index) => { const monthValue = String(index + 1).padStart(2, '0'); return `<option value="${monthValue}" ${date.month === monthValue ? 'selected' : ''}>${month}</option>`; }).join('')}</select></div>
    </div></div>`;
  }
  return `<div class="form-field${full}">${base}<input class="legacy-input" data-field="${field.path}" value="${escapeHtml(value ?? '')}"></div>`;
}

function toggleStructuredDate(checkbox) {
  const entry = checkbox.closest('[data-structured-date]');
  entry.querySelector('.structured-date-exact').disabled = checkbox.checked;
  entry.querySelector('.date-approx-fields').hidden = !checkbox.checked;
}

function renderStructuredRecordForm(type, record, context) {
  if (!record) return '<div class="empty-state">No records are available for this type.</div>';
  return `<form id="${context}-structured-form" onsubmit="saveStructuredRecord(event,'${context}','${type}','${record.id}')"><div class="contribute-form-grid">${(RECORD_SCHEMAS[type] || []).map(field => renderStructuredField(field, record, context)).join('')}</div><div class="admin-action-row" style="margin-top:22px;"><button class="export-btn" type="submit">Save Changes</button><button class="duplicate-btn" type="button" onclick="deleteStructuredRecord('${context}','${type}','${record.id}',this)">Delete Record</button></div></form>`;
}


async function saveStructuredRecord(event, context, type, id) {
  event.preventDefault();
  const records = getEditorRecords(type);
  const original = records.find(record => record.id === id);
  if (!original) return;
  const record = collectStructuredRecord(event.currentTarget, type, original);
  if (currentUserRole === 'family_admin' && !recordInAdminScope(record)) {
    (context === 'admin' ? setAdminEditorMessage : setEditDataMessage)('This record is not in your assigned branch.', 'error');
    return;
  }
  if (type === 'locations') {
    const { id: locationId, ...location } = record;
    D.locations[locationId] = location;
  } else {
    const index = D[type].findIndex(item => item.id === id);
    D[type][index] = record;
  }
  const recordsToPersist = type === 'persons' ? syncPersonRelationships(original, record) : [record];
  if (type === 'persons') {
    recordsToPersist.forEach(changedRecord => {
      const index = D.persons.findIndex(person => person.id === changedRecord.id);
      if (index >= 0) D.persons[index] = changedRecord;
    });
  }
  refreshAllDerivedViews();
  const persisted = await Promise.all(recordsToPersist.map(changedRecord => persistRecord(type, changedRecord)));
  if (context === 'admin') {
    adminEditorRecordId = record.id;
    renderAdmin();
    setAdminEditorMessage(persisted.every(Boolean) ? 'Record updated and saved centrally.' : 'Record updated locally, but central save failed.', persisted.every(Boolean) ? 'success' : 'error');
  } else {
    editDataRecordId = record.id;
    renderEditData();
    setEditDataMessage(persisted.every(Boolean) ? 'Record updated and saved centrally.' : 'Record updated locally, but central save failed.', persisted.every(Boolean) ? 'success' : 'error');
  }
}

async function deleteStructuredRecord(context, type, id, button) {
  if (button.dataset.confirm !== 'true') {
    button.dataset.confirm = 'true';
    button.textContent = 'Click again to confirm';
    return;
  }
  if (type === 'locations') delete D.locations[id];
  else D[type] = D[type].filter(record => record.id !== id);
  await persistDelete(type, id);
  if (context === 'admin') {
    adminEditorRecordId = '';
    renderAdmin();
  } else {
    editDataRecordId = '';
    renderEditData();
  }
  refreshAllDerivedViews();
}

function renderEditData() {
  const root = document.getElementById('edit-data-root');
  if (!root) return;
  const records = getEditorRecords(editDataType);
  if (!editDataRecordId || !records.some(record => record.id === editDataRecordId)) editDataRecordId = records[0]?.id || '';
  const selected = records.find(record => record.id === editDataRecordId);
  root.innerHTML = `
    <div class="editor-shell">
      <div class="admin-warning">Use the labeled fields below to update one record at a time. Export the JavaScript file to save changes back to the repository.</div>
      <div id="edit-data-message"></div>
      <div class="editor-controls">
        <select class="legacy-select" onchange="setEditDataType(this.value)">
          ${['persons','branches','events','stories','media','locations','sources'].map(type =>
            `<option value="${type}" ${editDataType === type ? 'selected' : ''}>${type[0].toUpperCase() + type.slice(1)}</option>`
          ).join('')}
        </select>
        <select class="legacy-select" onchange="setEditDataRecord(this.value)">
          ${records.map(record => `<option value="${record.id}" ${selected?.id === record.id ? 'selected' : ''}>${escapeHtml(record.name?.display || record.name || record.title || record.id)}</option>`).join('')}
        </select>
      </div>
      ${renderStructuredRecordForm(editDataType, selected, 'edit-data')}
      <div class="admin-action-row" style="margin-top:14px;">
        <button class="export-btn" type="button" onclick="createStructuredRecord('${editDataType}')">Add ${escapeHtml(editDataType.slice(0, -1) || editDataType)}</button>
        <button class="export-btn" type="button" onclick="exportFamilyDataJs()">Export updated family-legacy-data.js</button>
        <button class="export-btn" type="button" onclick="seedGoogleSheet()">Seed Google Sheet from local data</button>
      </div>
    </div>
  `;
}

function setEditDataType(type) {
  editDataType = type;
  editDataRecordId = '';
  renderEditData();
}

function setEditDataRecord(id) {
  editDataRecordId = id;
  renderEditData();
}

function createStructuredRecord(type) {
  const id = `${type.slice(0, -1)}_${Date.now()}`;
  const defaults = {
    persons: { id, name: { first: '', middle: '', last: '', maiden: null, nicknames: [], display: 'New Person' }, birth: null, death: null, gender: 'unknown', is_living: true, relationships: { parents: [], spouses: [], children: [] }, branch_ids: [D.meta.root_branch_id], bio: '', cover_media_id: null, tags: [], confidence: 0.5, sources: [], privacy: 'family', status: 'draft' },
    branches: { id, name: 'New Branch', root_person_id: '', parent_branch_id: D.meta.root_branch_id, child_branch_ids: [], color: '#a4674d', description: '' },
    events: { id, type: 'other', title: 'New Event', description: '', date: { start: '0000-00-00', display: 'Unknown', certainty: 'unknown', end: null }, recurrence: { type: 'none' }, people: [], branch_ids: [D.meta.root_branch_id], location_id: null, media_ids: [], tags: [], sources: [], privacy: 'family', status: 'draft' },
    stories: { id, type: 'written', title: 'New Story', body: '', people_ids: [], branch_ids: [D.meta.root_branch_id], event_ids: [], era: '', told_by: null, told_date: '', media_id: null, tags: [], status: 'draft', privacy: 'family' },
    media: { id, type: 'photo', title: 'New Media', description: '', storage: { type: 'placeholder', url: null, color: '#a4674d' }, date: { value: '0000-00-00', certainty: 'unknown', display: 'Unknown' }, people_ids: [], event_ids: [], branch_ids: [D.meta.root_branch_id], location_id: null, tags: [], privacy: 'family' },
    sources: { id, title: 'New Source', type: 'other', date: '', location: null, drive_file_id: '', notes: '', reliability: 0.5 }
  };
  if (type === 'locations') {
    D.locations[id] = { name: 'New Location', short: 'New Location' };
  } else {
    D[type].push(defaults[type]);
  }
  editDataRecordId = id;
  renderEditData();
}

async function seedGoogleSheet() {
  try {
    const result = await familyApi('seedFromInitialData', { dataset: FamilyData });
    if (!result.seeded) throw new Error('Seed was not accepted');
    await reloadCentralData();
    renderEditData();
    setEditDataMessage('Google Sheet initialized from the local seed data.');
    showSyncStatus('Shared family archive initialized.', 'success');
  } catch (error) {
    setEditDataMessage(error.message, 'error');
  }
}

function setEditDataMessage(message, status = 'success') {
  const el = document.getElementById('edit-data-message');
  if (el) el.innerHTML = `<div class="inline-message ${status}">${escapeHtml(message)}</div>`;
}

function serializeFamilyDataJs() {
  const sections = [
    ['META', 'Top-level information about the site and family.', 'meta'],
    ['BRANCHES', 'Family lines and their root people.', 'branches'],
    ['PERSONS', 'People and their family relationships.', 'persons'],
    ['EVENTS', 'Family milestones and timeline entries.', 'events'],
    ['STORIES', 'Written memories and oral history.', 'stories'],
    ['MEDIA', 'Photos, videos, and documents.', 'media'],
    ['LOCATIONS', 'Object keyed by location id.', 'locations'],
    ['SOURCES', 'Research and source records.', 'sources'],
    ['SETTINGS', 'Site-wide configuration.', 'settings']
  ];
  const body = sections.map(([title, description, key], index) => `  // --------------------------------------------------------
  // ${title}
  // ${description}
  // --------------------------------------------------------
  ${key}: ${JSON.stringify(D[key], null, 2).replace(/\n/g, '\n  ')}${index < sections.length - 1 ? ',' : ''}`).join('\n\n');
  return `// ============================================================
// FAMILY LEGACY PLATFORM — Family Data
// Rowe / Randall Family
// ============================================================
//
// ⚠️  PRIVACY WARNING — READ BEFORE EDITING  ⚠️
// This file is loaded by index.html on GitHub Pages, which is a
// PUBLIC static site. ANYONE can view this file's full contents
// by opening it directly or using View Source / browser tools.
//
// DO NOT put in this file until real authentication and a private
// backend exist:
//   - Exact birth dates for LIVING people
//   - Home addresses, phone numbers, or email addresses
//   - Sensitive medical, legal, or financial details
//   - Anything a living relative has not agreed to publish
//
// Privacy labels are descriptive only. They do not hide data from
// this public file, so keep sensitive family details out of it.
// ============================================================

${'const ' + 'FamilyData = {'}
${body}
};
`;
}

function exportFamilyDataJs() {
  downloadBlob('family-legacy-data.js', serializeFamilyDataJs(), 'text/javascript;charset=utf-8');
  setEditDataMessage('Updated family-legacy-data.js downloaded.');
}

function renderAdmin() {
  const root = document.getElementById('admin-root');
  if (!root) return;

  root.innerHTML = `
    <div class="admin-warning" style="display:flex;justify-content:space-between;gap:16px;align-items:center;">
      <span>Logged in as ${escapeHtml(currentUserName || 'Admin')} (${currentUserRole === 'super_admin' ? 'Super Admin' : 'Family Admin'})${currentUserRole === 'family_admin' ? ` — ${escapeHtml(D.branches.filter(branch => currentUserBranchIds.includes(branch.id)).map(branch => branch.name).join(', ') || 'No branches assigned')}` : ''}</span>
      <button class="profile-change-link" type="button" onclick="logoutAdmin()">Log out</button>
    </div>
    <div class="admin-tabs">
      <button class="filter-pill ${adminTab === 'overview' ? 'active' : ''}" onclick="setAdminTab('overview')">Data Overview</button>
      <button class="filter-pill ${adminTab === 'editor' ? 'active' : ''}" onclick="setAdminTab('editor')">Edit Records</button>
      ${currentUserRole === 'super_admin' ? `<button class="filter-pill ${adminTab === 'profile-types' ? 'active' : ''}" onclick="setAdminTab('profile-types')">Profile Types</button>` : ''}
      ${currentUserRole === 'super_admin' ? `<button class="filter-pill ${adminTab === 'family-admins' ? 'active' : ''}" onclick="setAdminTab('family-admins')">Family Admins</button>` : ''}
      <button class="filter-pill ${adminTab === 'pending' ? 'active' : ''}" onclick="setAdminTab('pending')">Pending Submissions</button>
      <button class="filter-pill ${adminTab === 'export' ? 'active' : ''}" onclick="setAdminTab('export')">Export</button>
      <button class="filter-pill ${adminTab === 'duplicates' ? 'active' : ''}" onclick="setAdminTab('duplicates')">Duplicate Detector</button>
      ${currentUserRole === 'super_admin' ? `<button class="filter-pill" onclick="showPage('edit-data')">Full Data Editor</button>` : ''}
    </div>
    ${adminTab === 'overview' ? renderAdminOverview() : ''}
    ${adminTab === 'editor' ? renderAdminEditor() : ''}
    ${adminTab === 'profile-types' ? renderAdminProfileTypes() : ''}
    ${adminTab === 'family-admins' ? renderFamilyAdmins() : ''}
    ${adminTab === 'pending' ? renderPendingSubmissions() : ''}
    ${adminTab === 'export' ? renderAdminExport() : ''}
    ${adminTab === 'duplicates' ? renderAdminDuplicates() : ''}
  `;
}

function setAdminTab(tab) {
  if (currentUserRole !== 'super_admin' && ['profile-types','family-admins'].includes(tab)) tab = 'overview';
  adminTab = tab;
  renderAdmin();
}

function renderAdminOverview() {
  const S = getScopedDataset();
  const totalPersons = S.persons.length || 1;
  const totalEvents = S.events.length || 1;
  const byBranch = S.branches.map(branch => ({ branch, count: S.persons.filter(person => (person.branch_ids || []).includes(branch.id)).length }));
  const eventCounts = Object.entries(S.events.reduce((acc, event) => { acc[event.type] = (acc[event.type] || 0) + 1; return acc; }, {}));
  const lowConfidence = [...S.persons].filter(person => (person.confidence || 0) < 0.85).sort((a, b) => (a.confidence || 0) - (b.confidence || 0));
  const living = S.persons.filter(p => p.is_living).length;
  const deceased = S.persons.length - living;

  return `
    <div class="admin-overview-grid">
      <div class="admin-stats-grid">
        ${[
          ['Persons', S.persons.length], ['Events', S.events.length], ['Stories', S.stories.length],
          ['Media', S.media.length], ['Branches', S.branches.length], ['Locations', Object.keys(S.locations).length]
        ].map(([label, value]) => `
          <div class="overview-stat"><div class="overview-stat-num">${value}</div><div class="overview-stat-label">${label}</div></div>
        `).join('')}
      </div>
      <div class="admin-card">
        <div class="mini-section-title">Persons by Branch</div>
        <table class="admin-table">
          <thead><tr><th>Branch</th><th>Count</th><th>% of Total</th></tr></thead>
          <tbody>${byBranch.map(({ branch, count }) => `<tr><td>${escapeHtml(branch.name)}</td><td>${count}</td><td>${Math.round((count / totalPersons) * 100)}%</td></tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="admin-card">
        <div class="mini-section-title">Events by Type</div>
        <div class="admin-bar-row">
          ${eventCounts.map(([type, count]) => `
            <div class="admin-bar-item">
              <div>${escapeHtml(type)}</div>
              <div class="admin-bar-track"><div class="admin-bar-fill" style="width:${Math.max(8, (count / totalEvents) * 100)}%"></div></div>
              <div>${count}</div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="admin-card">
        <div class="mini-section-title">Life Status</div>
        <div class="admin-bar-row">
          <div class="admin-bar-item"><div>Living</div><div class="admin-bar-track"><div class="admin-bar-fill" style="width:${(living / totalPersons) * 100}%"></div></div><div>${living}</div></div>
          <div class="admin-bar-item"><div>Deceased</div><div class="admin-bar-track"><div class="admin-bar-fill" style="width:${(deceased / totalPersons) * 100}%"></div></div><div>${deceased}</div></div>
        </div>
      </div>
      <div class="admin-card">
        <div class="mini-section-title">Low Confidence Records</div>
        ${lowConfidence.length ? `
          <table class="admin-table">
            <thead><tr><th>Name</th><th>Confidence</th><th>Missing Fields</th></tr></thead>
            <tbody>${lowConfidence.map(person => `<tr><td>${escapeHtml(person.name.display)}</td><td>${Math.round((person.confidence || 0) * 100)}%</td><td>${escapeHtml(getMissingFields(person).join(', ') || 'None')}</td></tr>`).join('')}</tbody>
          </table>
        ` : '<div class="green-note">No people fall below the current confidence threshold.</div>'}
      </div>
    </div>
  `;
}

function renderAdminEditor() {
  const records = scopedRecords(adminEditorType);
  if (!adminEditorRecordId && records[0]) adminEditorRecordId = records[0].id;
  const selected = records.find(record => record.id === adminEditorRecordId) || records[0];
  return `
    <div class="editor-shell">
      <div class="admin-warning">Changes are in-memory only until a Super Admin exports the updated data file.</div>
      <div id="admin-editor-message"></div>
      <div class="editor-controls">
        <select class="legacy-select" onchange="setAdminEditorType(this.value)">
          <option value="persons" ${adminEditorType === 'persons' ? 'selected' : ''}>Person</option>
          <option value="events" ${adminEditorType === 'events' ? 'selected' : ''}>Event</option>
          <option value="stories" ${adminEditorType === 'stories' ? 'selected' : ''}>Story</option>
        </select>
        <select class="legacy-select" onchange="setAdminEditorRecord(this.value)">
          ${(records || []).map(record => `<option value="${record.id}" ${selected?.id === record.id ? 'selected' : ''}>${escapeHtml(record.name?.display || record.title || record.id)}</option>`).join('')}
        </select>
      </div>
      ${renderStructuredRecordForm(adminEditorType, selected, 'admin')}
    </div>
  `;
}

function renderAdminProfileTypes() {
  const profileTypes = D.settings.profile_types || [];
  return `
    <div class="profile-type-admin-list">
      ${profileTypes.map(type => `
        <div class="admin-card profile-type-admin-card">
          <div class="form-field">
            <label class="form-label">Label</label>
            <input class="legacy-input" value="${escapeHtml(type.label)}" onchange="updateProfileType('${type.id}', 'label', this.value)">
          </div>
          <div class="form-field">
            <label class="form-label">Description</label>
            <textarea class="legacy-textarea" onchange="updateProfileType('${type.id}', 'description', this.value)">${escapeHtml(type.description || '')}</textarea>
          </div>
          <div class="form-field">
            <label class="form-label">Story Prompts</label>
            ${(type.prompts || []).map((prompt, index) => `
              <div class="profile-prompt-row">
                <input class="legacy-input" value="${escapeHtml(prompt)}" onchange="updateProfilePrompt('${type.id}', ${index}, this.value)">
                <button class="duplicate-btn" type="button" onclick="removeProfilePrompt('${type.id}', ${index})">Remove</button>
              </div>
            `).join('')}
            <button class="export-btn" type="button" onclick="addProfilePrompt('${type.id}')">Add Prompt</button>
          </div>
          <div class="form-field">
            <label class="form-label">Show Fields</label>
            <div class="profile-field-toggles">
              ${['bio','story','event','photo'].map(field => `
                <label class="profile-field-toggle">
                  <input type="checkbox" ${(type.show_fields || []).includes(field) ? 'checked' : ''} onchange="toggleProfileTypeField('${type.id}', '${field}', this.checked)">
                  ${field[0].toUpperCase() + field.slice(1)}
                </label>
              `).join('')}
            </div>
          </div>
          <div class="admin-action-row">
            ${profileTypePendingDeleteId === type.id ? `
              <span class="inline-message error" style="margin:0;">Delete ${escapeHtml(type.label)}?</span>
              <button class="duplicate-btn" type="button" onclick="confirmDeleteProfileType('${type.id}')">Yes, delete</button>
              <button class="duplicate-btn" type="button" onclick="cancelDeleteProfileType()">Cancel</button>
            ` : `<button class="duplicate-btn" type="button" onclick="requestDeleteProfileType('${type.id}')">Delete Type</button>`}
          </div>
        </div>
      `).join('')}
      <button class="export-btn" type="button" onclick="addProfileType()">Add Profile Type</button>
    </div>
  `;
}

function getProfileType(id) {
  return (D.settings.profile_types || []).find(type => type.id === id);
}

function updateProfileType(id, field, value) {
  const type = getProfileType(id);
  if (!type) return;
  type[field] = value.trim();
  persistSettings();
  renderAdmin();
}

function updateProfilePrompt(id, index, value) {
  const type = getProfileType(id);
  if (!type) return;
  type.prompts[index] = value.trim();
  persistSettings();
  renderAdmin();
}

function addProfilePrompt(id) {
  const type = getProfileType(id);
  if (!type) return;
  type.prompts.push('Add a family memory prompt here.');
  persistSettings();
  renderAdmin();
}

function removeProfilePrompt(id, index) {
  const type = getProfileType(id);
  if (!type) return;
  type.prompts.splice(index, 1);
  persistSettings();
  renderAdmin();
}

function toggleProfileTypeField(id, field, checked) {
  const type = getProfileType(id);
  if (!type) return;
  const fields = new Set(type.show_fields || []);
  if (checked) fields.add(field);
  else fields.delete(field);
  type.show_fields = [...fields];
  persistSettings();
  renderAdmin();
}

function addProfileType() {
  const id = `profile_type_${Date.now()}`;
  D.settings.profile_types.push({
    id,
    label: 'New Profile Type',
    description: 'Describe who this option is for.',
    prompts: ['What family memory would you like to preserve?'],
    show_fields: ['bio', 'story', 'event', 'photo']
  });
  persistSettings();
  renderAdmin();
}

function requestDeleteProfileType(id) {
  profileTypePendingDeleteId = id;
  renderAdmin();
}

function cancelDeleteProfileType() {
  profileTypePendingDeleteId = null;
  renderAdmin();
}

function confirmDeleteProfileType(id) {
  D.settings.profile_types = (D.settings.profile_types || []).filter(type => type.id !== id);
  if (selectedProfileType === id) selectedProfileType = null;
  profileTypePendingDeleteId = null;
  persistSettings();
  renderAdmin();
}

function renderFamilyAdmins() {
  const admins = D.settings.family_admins || [];
  return `
    <div class="profile-type-admin-list">
      ${admins.map(admin => `
        <div class="admin-card">
          <div class="mini-section-title">${escapeHtml(admin.name)}</div>
          <div class="form-field">
            <label class="form-label">Assigned Branches</label>
            <div class="profile-field-toggles">
              ${D.branches.map(branch => `<label class="profile-field-toggle"><input type="checkbox" ${(admin.branch_ids || []).includes(branch.id) ? 'checked' : ''} onchange="toggleFamilyAdminBranch('${admin.id}','${branch.id}',this.checked)"> ${escapeHtml(branch.name)}</label>`).join('')}
            </div>
          </div>
          <div class="form-field"><label class="form-label">Reset Password</label><input class="legacy-input" type="password" placeholder="Leave blank to keep current password" onchange="resetFamilyAdminPassword('${admin.id}',this.value)"></div>
          <div class="profile-sources">Created ${escapeHtml(admin.created_at || 'Unknown')}</div>
          <div class="admin-action-row">
            ${familyAdminPendingDeleteId === admin.id ? `<span>Remove this Family Admin?</span><button class="duplicate-btn" onclick="confirmRemoveFamilyAdmin('${admin.id}')">Yes, remove</button><button class="duplicate-btn" onclick="familyAdminPendingDeleteId=null;renderAdmin()">Cancel</button>` : `<button class="duplicate-btn" onclick="familyAdminPendingDeleteId='${admin.id}';renderAdmin()">Remove</button>`}
          </div>
        </div>
      `).join('') || '<div class="green-note">No Family Admins have been added yet.</div>'}
      <div class="admin-card">
        <div class="mini-section-title">Add Family Admin</div>
        <div id="family-admin-message"></div>
        <div class="contribute-form-grid">
          <div class="form-field"><label class="form-label">Name</label><input class="legacy-input" id="new-family-admin-name"></div>
          <div class="form-field"><label class="form-label">Password</label><input class="legacy-input" id="new-family-admin-password" type="password"></div>
          <div class="form-field full"><label class="form-label">Branches</label><div class="profile-field-toggles">${D.branches.map(branch => `<label class="profile-field-toggle"><input type="checkbox" name="new-family-admin-branch" value="${branch.id}"> ${escapeHtml(branch.name)}</label>`).join('')}</div></div>
        </div>
        <button class="export-btn" type="button" onclick="addFamilyAdmin()">Add Family Admin</button>
      </div>
    </div>`;
}

function addFamilyAdmin() {
  const name = document.getElementById('new-family-admin-name').value.trim();
  const password = document.getElementById('new-family-admin-password').value;
  const branchIds = [...document.querySelectorAll('[name="new-family-admin-branch"]:checked')].map(input => input.value);
  const message = document.getElementById('family-admin-message');
  if (!name || !password || !branchIds.length) {
    message.innerHTML = '<div class="inline-message error">Name, password, and at least one branch are required.</div>';
    return;
  }
  D.settings.family_admins.push({ id: `famadmin_${Date.now()}`, name, password_hash: simplePasswordHash(password), branch_ids: branchIds, created_by: 'super_admin', created_at: new Date().toISOString().slice(0, 10) });
  persistSettings();
  renderAdmin();
}

function toggleFamilyAdminBranch(id, branchId, checked) {
  const admin = D.settings.family_admins.find(item => item.id === id);
  if (!admin) return;
  const ids = new Set(admin.branch_ids || []);
  checked ? ids.add(branchId) : ids.delete(branchId);
  admin.branch_ids = [...ids];
  persistSettings();
}

function resetFamilyAdminPassword(id, password) {
  if (!password) return;
  const admin = D.settings.family_admins.find(item => item.id === id);
  if (admin) admin.password_hash = simplePasswordHash(password);
  persistSettings();
}

function confirmRemoveFamilyAdmin(id) {
  D.settings.family_admins = D.settings.family_admins.filter(admin => admin.id !== id);
  familyAdminPendingDeleteId = null;
  persistSettings();
  renderAdmin();
}

function getPendingSubmissions() {
  return (D.pendingSubmissions || []).filter(submission => {
    if (submission.status !== 'pending') return false;
    if (currentUserRole === 'super_admin') return true;
    return (submission.branch_ids || []).some(id => currentUserBranchIds.includes(id));
  });
}

function renderPendingSubmissions() {
  const pending = getPendingSubmissions();
  return pending.length ? pending.map(submission => `
    <div class="admin-card" style="margin-bottom:14px;">
      <div class="mini-section-title">${escapeHtml(submission.payload?.title || submission.payload?.storyTitle || [submission.payload?.firstName, submission.payload?.lastName].filter(Boolean).join(' ') || submission.submission_type)}</div>
      <div class="profile-sources">${escapeHtml(submission.submission_type)} — submitted by ${escapeHtml(submission.submitted_by || 'anonymous')}</div>
      ${submission.payload?.noteBody ? `<div class="profile-bio" style="margin-top:12px;">${escapeHtml(submission.payload.noteBody)}</div>` : ''}
      <div class="admin-action-row" style="margin-top:14px;">
        <button class="export-btn" onclick="approveSubmission('${submission.id}')">Approve</button>
        <button class="duplicate-btn" onclick="rejectSubmission('${submission.id}',this)">Reject</button>
      </div>
    </div>`).join('') : '<div class="green-note">No pending submissions in your assigned branches.</div>';
}

async function approveSubmission(id) {
  try {
    await familyApi('approveSubmission', { id });
    await reloadCentralData();
    renderAdmin();
    showSyncStatus('Submission approved and added to the archive.', 'success');
  } catch (error) {
    showSyncStatus('Approval failed — check your connection.', 'error');
  }
}

async function rejectSubmission(id, button) {
  if (button.dataset.confirm !== 'true') {
    button.dataset.confirm = 'true';
    button.textContent = 'Click again to confirm';
    return;
  }
  try {
    await familyApi('rejectSubmission', { id });
    await reloadCentralData();
    renderAdmin();
    showSyncStatus('Submission rejected.', 'success');
  } catch (error) {
    showSyncStatus('Rejection failed — check your connection.', 'error');
  }
}

function setAdminEditorType(type) {
  adminEditorType = type;
  const records = scopedRecords(type);
  adminEditorRecordId = records[0]?.id || '';
  renderAdmin();
}

function setAdminEditorRecord(id) {
  adminEditorRecordId = id;
  renderAdmin();
}

function setAdminEditorMessage(message, status = 'success') {
  const el = document.getElementById('admin-editor-message');
  if (el) el.innerHTML = `<div class="inline-message ${status}">${escapeHtml(message)}</div>`;
}

function renderAdminExport() {
  return `
    <div class="admin-card">
      <div id="admin-export-message"></div>
      <div class="admin-action-row">
        <button class="export-btn" type="button" onclick="exportAllData()">Export All Data as JSON</button>
        <button class="export-btn" type="button" onclick="exportPersonsCsv()">Export Persons CSV</button>
        <button class="export-btn" type="button" onclick="exportEventsCsv()">Export Events CSV</button>
      </div>
    </div>
  `;
}

function setAdminExportMessage(message) {
  const el = document.getElementById('admin-export-message');
  if (el) el.innerHTML = `<div class="inline-message success">${escapeHtml(message)}</div>`;
}

function exportAllData() {
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(`family-legacy-export-${date}.json`, JSON.stringify(getScopedDataset(), null, 2), 'application/json');
  setAdminExportMessage('Full dataset exported.');
}

function csvEscape(value) {
  const str = String(value ?? '');
  return `"${str.replace(/"/g, '""')}"`;
}

function exportPersonsCsv() {
  const date = new Date().toISOString().slice(0, 10);
  const rows = [
    ['id','display_name','first','last','maiden','birth_date','birth_certainty','death_date','is_living','branch_ids','confidence','tags'],
    ...scopedRecords('persons').map(person => [
      person.id, person.name.display, person.name.first, person.name.last, person.name.maiden || '',
      person.birth?.date || '', person.birth?.certainty || '', person.death?.date || '', person.is_living,
      (person.branch_ids || []).join('|'), person.confidence ?? '', (person.tags || []).join('|')
    ])
  ];
  downloadBlob(`family-persons-${date}.csv`, rows.map(row => row.map(csvEscape).join(',')).join('\n'), 'text/csv;charset=utf-8');
  setAdminExportMessage('Persons CSV exported.');
}

function exportEventsCsv() {
  const date = new Date().toISOString().slice(0, 10);
  const rows = [
    ['id','type','title','date_start','date_certainty','location','people_count','tags'],
    ...scopedRecords('events').map(event => [
      event.id, event.type, event.title, event.date?.start || '', event.date?.certainty || '',
      event.location_id ? getLoc(event.location_id) : '', (event.people || []).length, (event.tags || []).join('|')
    ])
  ];
  downloadBlob(`family-events-${date}.csv`, rows.map(row => row.map(csvEscape).join(',')).join('\n'), 'text/csv;charset=utf-8');
  setAdminExportMessage('Events CSV exported.');
}

function scanDuplicates() {
  const pairs = [];
  const people = scopedRecords('persons');
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i];
      const b = people[j];
      const key = [a.id, b.id].sort().join('|');
      if (adminDismissedDuplicates.has(key)) continue;
      let score = 0;
      const reasons = [];
      if ((a.name.last || '').toLowerCase() === (b.name.last || '').toLowerCase() && a.name.last) {
        score++;
        reasons.push('Last name matches');
      }
      const aFirst = (a.name.first || '').toLowerCase();
      const bFirst = (b.name.first || '').toLowerCase();
      if (aFirst.slice(0, 3) && aFirst.slice(0, 3) === bFirst.slice(0, 3)) {
        score++;
        reasons.push('First name shares first 3 characters');
      }
      const aYear = getDateYear(a.birth?.date);
      const bYear = getDateYear(b.birth?.date);
      if (aYear && bYear && Math.abs(aYear - bYear) <= 2) {
        score++;
        reasons.push('Birth years are within 2 years');
      }
      if (score >= 2) pairs.push({ a, b, key, reasons, score });
    }
  }
  return pairs;
}

function renderAdminDuplicates() {
  const duplicates = scanDuplicates();
  if (!duplicates.length) return '<div class="green-note">No potential duplicates found in the current dataset.</div>';
  return duplicates.map(pair => `
    <div class="duplicate-card">
      <div class="mini-section-title">Potential Duplicate</div>
      <div class="duplicate-compare">
        ${renderDuplicatePerson(pair.a)}
        ${renderDuplicatePerson(pair.b)}
      </div>
      <div class="profile-section">
        <div class="profile-section-label">Match Reasons</div>
        <div class="profile-sources">${pair.reasons.map(reason => `• ${escapeHtml(reason)}`).join('<br>')}</div>
      </div>
      <div class="admin-action-row">
        <button class="duplicate-btn" type="button" onclick="mergeDuplicatePair('${pair.a.id}','${pair.b.id}')">These are the same person</button>
        <button class="duplicate-btn" type="button" onclick="dismissDuplicatePair('${pair.key}')">Not a duplicate</button>
      </div>
    </div>
  `).join('');
}

function renderDuplicatePerson(person) {
  const branch = person.branch_ids?.[0] ? getBranch(person.branch_ids[0]) : null;
  return `
    <div class="duplicate-person">
      <div class="relationship-name">${escapeHtml(person.name.display)}</div>
      <div class="relationship-dates">${escapeHtml(getPersonDatesLabel(person))}</div>
      <div class="profile-sources" style="margin-top:10px;">Branch: ${escapeHtml(branch?.name || 'Unknown')}<br>Confidence: ${Math.round((person.confidence || 0) * 100)}%</div>
    </div>
  `;
}

function dismissDuplicatePair(key) {
  adminDismissedDuplicates.add(key);
  renderAdmin();
}

async function mergeDuplicatePair(idA, idB) {
  const personA = getPerson(idA);
  const personB = getPerson(idB);
  if (!personA || !personB) return;
  const keep = (personA.confidence || 0) >= (personB.confidence || 0) ? personA : personB;
  const remove = keep.id === personA.id ? personB : personA;
  keep.sources = [...new Set([...(keep.sources || []), ...(remove.sources || [])])];
  keep.tags = [...new Set([...(keep.tags || []), ...(remove.tags || [])])];
  D.events.forEach(event => {
    event.people = (event.people || []).map(entry => entry.person_id === remove.id ? { ...entry, person_id: keep.id } : entry);
  });
  D.stories.forEach(story => {
    story.people_ids = [...new Set((story.people_ids || []).map(id => id === remove.id ? keep.id : id))];
    if (story.told_by === remove.id) story.told_by = keep.id;
  });
  D.media.forEach(media => {
    media.people_ids = [...new Set((media.people_ids || []).map(id => id === remove.id ? keep.id : id))];
  });
  D.persons.forEach(person => {
    if (person.id === remove.id) return;
    person.relationships.parents = [...new Set((person.relationships.parents || []).map(id => id === remove.id ? keep.id : id))];
    person.relationships.children = [...new Set((person.relationships.children || []).map(id => id === remove.id ? keep.id : id))];
    person.relationships.spouses = (person.relationships.spouses || []).map(spouse => spouse.person_id === remove.id ? { ...spouse, person_id: keep.id } : spouse);
  });
  D.persons = D.persons.filter(person => person.id !== remove.id);
  if (currentPersonId === remove.id) currentPersonId = keep.id;
  refreshAllDerivedViews();
  await Promise.all([
    ...D.persons.map(person => persistRecord('persons', person)),
    ...D.events.map(event => persistRecord('events', event)),
    ...D.stories.map(story => persistRecord('stories', story)),
    ...D.media.map(media => persistRecord('media', media)),
    persistDelete('persons', remove.id)
  ]);
}
