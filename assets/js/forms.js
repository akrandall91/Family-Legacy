// forms.js
// Public Contribute page: multi-step forms for submitting new people,
// notes, events, and stories.

// ============================================================
// CONTRIBUTE
// ============================================================
function renderContribute() {
  renderProfileTypeStep();
  if (!selectedProfileType) return;
  showContributeTab(activeContributeTab);
  applyProfileTypeGuidance();
  renderPersonPicker('event');
  renderPersonPicker('story');
  renderPersonPicker('note');
}

function renderProfileTypeStep() {
  const step = document.getElementById('contribute-profile-step');
  const workflow = document.getElementById('contribute-workflow');
  const summary = document.getElementById('contribute-profile-summary');
  if (!step || !workflow || !summary) return;

  const selected = getProfileType(selectedProfileType);
  if (!selected) {
    selectedProfileType = null;
    workflow.style.display = 'none';
    step.innerHTML = `
      <div class="profile-type-step">
        <div class="mini-section-title">Which best describes you?</div>
        <div class="profile-type-grid">
          ${(D.settings.profile_types || []).map(type => `
            <button class="profile-type-choice" type="button" onclick="selectProfileType('${type.id}')">
              <strong>${escapeHtml(type.label)}</strong>
              <span>${escapeHtml(type.description || '')}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
    summary.innerHTML = '';
    return;
  }

  step.innerHTML = '';
  workflow.style.display = 'block';
  summary.innerHTML = `
    <div class="profile-selection-bar">
      <div class="profile-selection-summary">Guided for <strong>${escapeHtml(selected.label)}</strong> — ${escapeHtml(selected.description || '')}</div>
      <button class="profile-change-link" type="button" onclick="resetProfileType()">Change who I am</button>
    </div>
  `;
}

function selectProfileType(id) {
  selectedProfileType = id;
  renderContribute();
}

function resetProfileType() {
  selectedProfileType = null;
  renderContribute();
}

function applyProfileTypeGuidance() {
  const type = getProfileType(selectedProfileType);
  if (!type) return;
  const fields = type.show_fields || [];
  const eventTab = document.querySelector('[data-contribute-feature="event"]');
  if (eventTab) eventTab.classList.toggle('deemphasized', !fields.includes('event'));
  document.querySelectorAll('.profile-photo-field').forEach(field => {
    field.classList.toggle('deemphasized', !fields.includes('photo'));
  });
  const guide = document.getElementById('story-prompt-guide');
  if (guide) {
    guide.innerHTML = `
      <div class="story-prompt-guide">
        <div class="form-label">Need a place to begin?</div>
        <div class="prompt-suggestions">
          ${(type.prompts || []).map((prompt, index) => `
            <button class="prompt-suggestion" type="button" onclick="useStoryPrompt(${index})">${escapeHtml(prompt)}</button>
          `).join('')}
        </div>
      </div>
    `;
  }
}

function useStoryPrompt(index) {
  const type = getProfileType(selectedProfileType);
  const prompt = type?.prompts?.[index];
  const body = document.getElementById('story-body');
  if (!prompt || !body) return;
  body.placeholder = prompt;
  if (!body.value.trim()) body.value = `${prompt}\n\n`;
  showContributeTab('story');
  body.focus();
  body.setSelectionRange(body.value.length, body.value.length);
}

function showContributeTab(tab) {
  activeContributeTab = tab;
  document.querySelectorAll('.contribute-tab').forEach(button => {
    button.classList.toggle('active', button.textContent.toLowerCase().includes(tab));
  });
  document.querySelectorAll('.contribute-panel').forEach(panel => panel.classList.remove('active'));
  const panel = document.getElementById(`contribute-panel-${tab}`);
  if (panel) panel.classList.add('active');
}

function setToggleValue(inputId, value, btn) {
  document.getElementById(inputId).value = String(value);
  btn.parentElement.querySelectorAll('.legacy-toggle-btn').forEach(button => button.classList.remove('active'));
  btn.classList.add('active');
}

function toggleDateMode(prefix) {
  const approximate = document.getElementById(`${prefix}-approximate`);
  const exact = document.getElementById(prefix === 'event-date' ? 'event-date-exact' : `${prefix}-date`);
  const approximateFields = document.getElementById(`${prefix}-approx-fields`);
  if (!approximate || !exact || !approximateFields) return;
  exact.disabled = approximate.checked;
  approximateFields.hidden = !approximate.checked;
}

function readDateEntry(prefix) {
  const approximate = document.getElementById(`${prefix}-approximate`)?.checked;
  const exactId = prefix === 'event-date' ? 'event-date-exact' : `${prefix}-date`;
  const exact = document.getElementById(exactId)?.value || '';
  if (!approximate) {
    return { value: exact || '0000-00-00', display: exact || 'Unknown', certainty: exact ? 'exact' : 'unknown' };
  }
  const year = document.getElementById(prefix === 'event-date' ? 'event-date-year' : `${prefix}-year`)?.value.trim() || '';
  const month = document.getElementById(prefix === 'event-date' ? 'event-date-month' : `${prefix}-month`)?.value || '';
  const value = year ? `${year}-${month || '00'}-00` : '0000-00-00';
  const monthName = month ? new Date(2000, Number(month) - 1, 1).toLocaleString('en', { month: 'long' }) : '';
  return { value, display: year ? `${monthName ? monthName + ' ' : ''}${year}` : 'Unknown', certainty: year ? 'estimated' : 'unknown' };
}

function renderPersonPicker(kind) {
  const mount = document.getElementById(`person-picker-${kind}`);
  if (!mount) return;

  const state = pickerState[kind];
  const query = state.query.toLowerCase().trim();
  const filtered = D.persons.filter(person => {
    const values = [
      person.name.display,
      person.name.first,
      person.name.last,
      person.name.maiden,
      ...(person.name.nicknames || [])
    ].filter(Boolean).join(' ').toLowerCase();
    return !query || values.includes(query);
  });

  const selectedPeople = state.selected.map(getPerson).filter(Boolean);

  mount.innerHTML = `
    <div class="person-picker">
      <div class="person-picker-head">
        <div class="picker-label">Selected People</div>
        <div class="picker-selected-chips">
          ${selectedPeople.length ? selectedPeople.map(person => `
            <span class="picker-chip">
              ${escapeHtml(person.name.display)}
              <button type="button" onclick="togglePersonSelection('${kind}','${person.id}')">×</button>
            </span>
          `).join('') : '<span class="form-help">No one selected yet.</span>'}
        </div>
        <div style="margin-top:12px;">
          <input class="picker-search-input" type="text" value="${escapeHtml(state.query)}" placeholder="Search people…" oninput="setPickerQuery('${kind}', this.value)">
        </div>
      </div>
      <div class="picker-options">
        ${filtered.map(person => `
          <label class="picker-option">
            <input type="checkbox" ${state.selected.includes(person.id) ? 'checked' : ''} onchange="togglePersonSelection('${kind}','${person.id}')">
            <span class="picker-option-name">${escapeHtml(person.name.display)}</span>
            <span class="picker-option-meta">${escapeHtml(person.is_living ? 'Living' : person.birth?.display || 'No date')}</span>
          </label>
        `).join('') || '<div class="empty-state" style="padding:14px;">No matching people.</div>'}
      </div>
    </div>
  `;
}

function setPickerQuery(kind, query) {
  pickerState[kind].query = query;
  renderPersonPicker(kind);
}

function togglePersonSelection(kind, personId) {
  const selected = pickerState[kind].selected;
  const index = selected.indexOf(personId);
  if (index >= 0) selected.splice(index, 1);
  else {
    if (kind === 'note') selected.splice(0, selected.length);
    selected.push(personId);
  }
  renderPersonPicker(kind);
}

function showContributionSuccess(kind, title, object) {
  const container = document.getElementById(`contribute-success-${kind}`);
  if (!container) return;
  container.innerHTML = `
      <div class="contribute-success">
      <div class="contribute-success-title">${escapeHtml(title)}</div>
      <div class="contribute-success-text">Your contribution is safely queued for a Family Admin to review.</div>
    </div>
  `;
}

function showContributionError(kind, message) {
  const container = document.getElementById(`contribute-success-${kind}`);
  if (!container) return;
  container.innerHTML = `<div class="inline-message error">${escapeHtml(message)}</div>`;
}

async function submitPersonForm(event) {
  event.preventDefault();

  const first = document.getElementById('person-first-name').value.trim();
  const last = document.getElementById('person-last-name').value.trim();
  if (!first || !last) {
    showContributionError('person', 'First name and last name are required.');
    return;
  }

  const maiden = document.getElementById('person-maiden-name').value.trim();
  const nickname = document.getElementById('person-nickname').value.trim();
  const birthDate = readDateEntry('person-birth');
  const birthYear = getDateYear(birthDate.value) || '';
  const birthCertainty = birthDate.certainty;
  const birthLocation = document.getElementById('person-birth-location').value.trim();
  const isLiving = document.getElementById('person-living').value === 'true';
  const bio = document.getElementById('person-bio').value.trim();
  const photoLink = document.getElementById('person-photo-link').value.trim();
  const submittedBy = document.getElementById('person-submitted-by').value.trim() || 'anonymous';

  const proposedPerson = {
    personId: `person_${Date.now()}`,
    firstName: first,
    lastName: last,
    maidenName: maiden,
    nickname,
    birthDate: birthDate.value !== '0000-00-00' || birthLocation ? {
      date: birthDate.value,
      display: birthDate.display,
      certainty: birthDate.certainty,
      location_name: birthLocation || null,
      location_id: null
    } : null,
    living: isLiving,
    bio,
    photoLink,
    branchIds: resolveBranchForPerson({ name: { last } }),
    submittedBy,
    submittedEmail: ''
  };

  const saved = await submitContribution({
    submissionType: 'person',
    ...proposedPerson,
    relationship: selectedProfileType || '',
    birthYear,
    birthCertainty,
  });
  if (!saved) {
    showContributionError('person', 'This submission was not saved. Please check your connection and try again.');
    return;
  }
  document.querySelector('#contribute-panel-person form').reset();
  toggleDateMode('person-birth');
  document.getElementById('person-living').value = 'true';
  document.querySelectorAll('#person-living-toggle .legacy-toggle-btn').forEach(button => button.classList.remove('active'));
  document.querySelector('#person-living-toggle .legacy-toggle-btn').classList.add('active');
  showContributionSuccess('person', `${first} ${last} was submitted for family review.`, proposedPerson);
}

async function submitNoteForm(event) {
  event.preventDefault();
  const targetPersonId = pickerState.note.selected[0];
  const noteBody = document.getElementById('note-body').value.trim();
  if (!targetPersonId || !noteBody) {
    showContributionError('note', 'Choose one person and enter a memory or note.');
    return;
  }
  const target = getPerson(targetPersonId);
  const payload = {
    submissionType: 'note',
    targetPersonId,
    title: document.getElementById('note-title').value.trim(),
    noteBody,
    photoLink: document.getElementById('note-photo-link').value.trim(),
    branchIds: target?.branch_ids || [],
    relationship: selectedProfileType || '',
    submittedBy: document.getElementById('note-submitted-by').value.trim() || 'anonymous',
    submittedEmail: ''
  };
  const saved = await submitContribution(payload);
  if (!saved) {
    showContributionError('note', 'This memory was not saved. Please check your connection and try again.');
    return;
  }
  document.querySelector('#contribute-panel-note form').reset();
  pickerState.note = { selected: [], query: '' };
  renderPersonPicker('note');
  showContributionSuccess('note', `Memory about ${target?.name.display || 'this person'} submitted for review.`, payload);
}

async function submitEventForm(event) {
  event.preventDefault();

  const type = document.getElementById('event-type').value;
  const title = document.getElementById('event-title').value.trim();
  if (!title) {
    showContributionError('event', 'Event title is required.');
    return;
  }

  const description = document.getElementById('event-description').value.trim();
  const eventDate = readDateEntry('event-date');
  const dateDisplay = eventDate.display;
  const dateCertainty = eventDate.certainty;
  const selectedPeople = pickerState.event.selected.slice();
  const location = document.getElementById('event-location').value.trim();
  const recurring = document.getElementById('event-recurring').value === 'true';
  const photoLink = document.getElementById('event-photo-link').value.trim();
  const submittedBy = document.getElementById('event-submitted-by').value.trim() || 'anonymous';

  const selectedPersonObjects = selectedPeople.map(getPerson).filter(Boolean);
  const branchIds = [...new Set(selectedPersonObjects.flatMap(person => person.branch_ids || []))];
  const dateStart = eventDate.value;
  const [year, month, day] = (dateStart || '0000-00-00').split('-').map(part => parseInt(part, 10));

  const createdEvent = {
    id: `event_${Date.now()}`,
    type,
    title,
    description,
    date: {
      start: dateStart || '0000-00-00',
      display: dateDisplay || 'Unknown',
      certainty: dateDisplay ? dateCertainty : 'unknown',
      end: null
    },
    recurrence: recurring && month ? { type: 'annual', month, day: day || 1 } : { type: 'none' },
    people: selectedPeople.map(personId => ({ person_id: personId, role: 'participant' })),
    branch_ids: branchIds,
    location_id: null,
    location_name: location || null,
    media_ids: [],
    cover_media_id: null,
    tags: [type, submittedBy ? `submitted-by:${submittedBy}` : null].filter(Boolean),
    sources: submittedBy ? [`Submitted by ${submittedBy}`] : [],
    submitted_by: submittedBy,
    privacy: 'family',
    status: 'submitted'
  };

  const saved = await submitContribution({
    submissionType: 'event',
    record: createdEvent,
    branchIds,
    relationship: selectedProfileType || '',
    eventTitle: title,
    eventType: type,
    eventDate: dateDisplay,
    birthLocation: location,
    bio: description,
    photoLink,
    submittedBy,
    submittedEmail: ''
  });
  if (!saved) {
    showContributionError('event', 'This event was not saved. Please check your connection and try again.');
    return;
  }
  document.querySelector('#contribute-panel-event form').reset();
  toggleDateMode('event-date');
  pickerState.event.selected = [];
  pickerState.event.query = '';
  document.getElementById('event-recurring').value = 'false';
  document.querySelectorAll('#event-recurring-toggle .legacy-toggle-btn').forEach(button => button.classList.remove('active'));
  document.querySelectorAll('#event-recurring-toggle .legacy-toggle-btn')[1].classList.add('active');
  renderPersonPicker('event');
  showContributionSuccess('event', `${createdEvent.title} was submitted for family review.`, createdEvent);
}

async function submitStoryForm(event) {
  event.preventDefault();

  const title = document.getElementById('story-title').value.trim();
  const body = document.getElementById('story-body').value.trim();
  if (!title || !body) {
    showContributionError('story', 'Story title and story body are required.');
    return;
  }

  const peopleIds = pickerState.story.selected.slice();
  const era = document.getElementById('story-era').value.trim();
  const toldByName = document.getElementById('story-told-by').value.trim();
  const photoLink = document.getElementById('story-photo-link').value.trim();
  const submittedBy = document.getElementById('story-submitted-by').value.trim() || 'anonymous';
  let toldById = null;

  if (toldByName) {
    const match = D.persons.find(person => person.name.display.toLowerCase() === toldByName.toLowerCase());
    toldById = match ? match.id : null;
  }

  const story = {
    id: `story_${Date.now()}`,
    type: 'written',
    title,
    body,
    people_ids: peopleIds,
    branch_ids: [...new Set(peopleIds.map(getPerson).filter(Boolean).flatMap(person => person.branch_ids || []))],
    event_ids: [],
    era,
    told_by: toldById,
    told_by_name: toldByName || null,
    told_date: new Date().toISOString().slice(0, 10),
    media_id: null,
    tags: [era || null, submittedBy ? `submitted-by:${submittedBy}` : null].filter(Boolean),
    submitted_by: submittedBy,
    status: 'submitted',
    privacy: 'family'
  };

  const saved = await submitContribution({
    submissionType: 'story',
    record: story,
    branchIds: story.branch_ids,
    relationship: selectedProfileType || '',
    storyTitle: title,
    storyBody: body,
    photoLink,
    submittedBy,
    submittedEmail: ''
  });
  if (!saved) {
    showContributionError('story', 'This story was not saved. Please check your connection and try again.');
    return;
  }
  document.querySelector('#contribute-panel-story form').reset();
  pickerState.story.selected = [];
  pickerState.story.query = '';
  renderPersonPicker('story');
  showContributionSuccess('story', `${story.title} was submitted for family review.`, story);
}
