// render-profile.js
// Person profile page rendering and detail modals
// (person/event/media/story quick-view overlays).

// ============================================================
// PERSON PAGE
// ============================================================
function openPersonPage(personId) {
  if (currentPage && !(currentPage === 'person' && currentPersonId === personId)) pushHistoryState();
  currentPersonId = personId;
  showPage('person');
}

function goBackFromPersonPage() {
  const previous = pageHistory.pop();
  if (!previous) {
    showPage('people');
    return;
  }
  if (previous.page === 'person' && previous.personId) {
    currentPersonId = previous.personId;
    showPage('person');
    return;
  }
  showPage(previous.page);
}

function renderPersonPage() {
  const root = document.getElementById('person-page-root');
  if (!root) return;

  const person = getPerson(currentPersonId);
  if (!person) {
    root.innerHTML = '<div class="empty-state">Person not found.</div>';
    return;
  }

  const color = getPersonColor(person);
  const age = getAge(person);
  const relations = getPersonRelations(person);
  const personEvents = getEventsForPerson(person.id).sort((a, b) => (a.date?.start || '').localeCompare(b.date?.start || ''));
  const personStories = getStoriesForPerson(person.id);
  const personMedia = getMediaForPerson(person.id);

  function relationBlock(title, items) {
    return `
      <div class="relationship-group">
        <div class="profile-section-label">${title}</div>
        ${items.length ? `
          <div class="relationship-grid">
            ${items.map(item => `
              <div class="relationship-card" onclick="openPersonPage('${item.id}')">
                <div class="relationship-avatar" style="background:${getPersonColor(item)}">${getInitials(item)}</div>
                <div>
                  <div class="relationship-name">${escapeHtml(item.name.display)}</div>
                  <div class="relationship-dates">${escapeHtml(getPersonDatesLabel(item))}</div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : '<div class="empty-state">No records here yet.</div>'}
      </div>
    `;
  }

  root.innerHTML = `
    <div class="person-page-shell">
      <span class="person-page-back" onclick="goBackFromPersonPage()">← Back</span>
      <section class="person-page-hero">
        <div class="person-page-hero-top">
          <div class="person-page-avatar" style="background:${color}">${getInitials(person)}</div>
          <div style="flex:1;min-width:280px;">
            <div class="person-page-name">${escapeHtml(person.name.display)}</div>
            <div class="person-page-sub">
              ${person.name.maiden ? `née ${escapeHtml(person.name.maiden)}` : ''}
              ${person.name.nicknames?.length ? `${person.name.maiden ? ' · ' : ''}${escapeHtml(person.name.nicknames.join(' · '))}` : ''}
            </div>
            <div class="profile-vitals">
              <div class="vital-item">Born<span>${escapeHtml(formatDateDisplay(person.birth) || 'Unknown')}</span></div>
              ${person.death ? `<div class="vital-item">Died<span>${escapeHtml(formatDateDisplay(person.death))}</span></div>` : ''}
              ${age ? `<div class="vital-item">${person.is_living ? 'Age' : 'Lived'}<span>${age} years</span></div>` : ''}
              ${person.birth?.location_id ? `<div class="vital-item">Birthplace<span>${escapeHtml(getLoc(person.birth.location_id))}</span></div>` : ''}
            </div>
            <div class="branch-badge-row">
              ${(person.branch_ids || []).map(branchId => {
                const branch = getBranch(branchId);
                return branch ? `<span class="branch-badge" style="background:${branch.color}">${escapeHtml(branch.name)}</span>` : '';
              }).join('')}
            </div>
            <div class="profile-section" style="background:transparent;border:none;padding:18px 0 0;margin:0;">
              <div class="profile-section-label">Data Confidence</div>
              <div class="confidence-bar">
                <div class="confidence-track"><div class="confidence-fill" style="width:${(person.confidence || 0) * 100}%"></div></div>
                <div class="confidence-val">${Math.round((person.confidence || 0) * 100)}%</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="person-page-section">
        <div class="mini-section-title">Life Story</div>
        <div class="person-page-story">${escapeHtml(person.bio || 'No biography has been added for this person yet.')}</div>
      </section>

      <section class="person-page-section">
        <div class="mini-section-title">Relationships</div>
        ${relationBlock('Parents', relations.parents)}
        ${relationBlock('Siblings', relations.siblings)}
        ${relationBlock('Spouses', relations.spouses)}
        ${relationBlock('Children', relations.children)}
      </section>

      <section class="person-page-section">
        <div class="mini-section-title">Events Timeline</div>
        ${personEvents.length ? personEvents.map(event => `
          <div class="tl-event" onclick="openEventDetail('${event.id}')">
            <div class="tl-type">${escapeHtml(event.type)}</div>
            <div class="tl-title">${escapeHtml(event.title)}</div>
            <div class="tl-date">${escapeHtml(formatDateDisplay(event.date))}</div>
            ${event.description ? `<div class="tl-desc">${escapeHtml(event.description)}</div>` : ''}
          </div>
        `).join('') : '<div class="empty-state">No events are linked to this person yet.</div>'}
      </section>

      <section class="person-page-section">
        <div class="mini-section-title">Stories</div>
        ${personStories.length ? personStories.map(story => `
          <div class="story-full" style="margin-bottom:24px;padding-bottom:24px;">
            <div class="story-full-title">${escapeHtml(story.title)}</div>
            <div class="story-attribution">${escapeHtml(story.era || 'Family story')}</div>
            <div class="story-body">"${escapeHtml(story.body)}"</div>
          </div>
        `).join('') : '<div class="empty-state">No stories mention this person yet.</div>'}
      </section>

      <section class="person-page-section">
        <div class="mini-section-title">Media</div>
        ${personMedia.length ? `
          <div class="person-page-media-grid">
            ${personMedia.map(media => `
              <div onclick="openMediaDetail('${media.id}')">${renderMediaPlaceholder(media, 'page-card')}</div>
            `).join('')}
          </div>
        ` : '<div class="empty-state">No media is tagged to this person yet.</div>'}
      </section>

      <section class="person-page-section">
        <div class="mini-section-title">Sources &amp; Data Quality</div>
        <div class="profile-section">
          <div class="profile-section-label">Sources</div>
          <div class="profile-sources">${person.sources?.length ? person.sources.map(source => `• ${escapeHtml(source)}`).join('<br>') : 'No sources listed.'}</div>
        </div>
        <div class="profile-section">
          <div class="profile-section-label">Privacy</div>
          <div class="tag-pill">${escapeHtml(person.privacy || 'public')}</div>
        </div>
      </section>
    </div>
  `;
}

// ============================================================
// ADMIN
// ============================================================
const RECORD_SCHEMAS = {
  persons: [
    { path: 'name.first', label: 'First Name', type: 'text' },
    { path: 'name.middle', label: 'Middle Name', type: 'text' },
    { path: 'name.last', label: 'Last Name', type: 'text' },
    { path: 'name.maiden', label: 'Maiden Name', type: 'text' },
    { path: 'name.nicknames', label: 'Nicknames', type: 'list' },
    { path: 'birth', label: 'Birth Date', type: 'date', shape: 'person' },
    { path: 'death', label: 'Death Date', type: 'date', shape: 'person' },
    { path: 'gender', label: 'Gender', type: 'select', options: ['female','male','nonbinary','unknown'] },
    { path: 'is_living', label: 'Living', type: 'toggle' },
    { path: 'bio', label: 'Biography', type: 'textarea', full: true },
    { path: 'branch_ids', label: 'Branches', type: 'branches', full: true },
    { path: 'relationships.parents', label: 'Parents', type: 'persons', full: true },
    { path: 'relationships.spouses', label: 'Spouses', type: 'spouses', full: true },
    { path: 'relationships.children', label: 'Children', type: 'persons', full: true },
    { path: 'privacy', label: 'Privacy', type: 'select', options: ['public','family','private','admin'] },
    { path: 'status', label: 'Review Status', type: 'select', options: ['draft','submitted','approved','published','archived'] },
    { path: 'confidence', label: 'Confidence (0–1)', type: 'number' }
  ],
  branches: [
    { path: 'name', label: 'Branch Name', type: 'text' },
    { path: 'root_person_id', label: 'Root Person', type: 'person' },
    { path: 'parent_branch_id', label: 'Parent Branch', type: 'branch' },
    { path: 'child_branch_ids', label: 'Child Branches', type: 'branches', full: true },
    { path: 'color', label: 'Accent Color', type: 'color' },
    { path: 'description', label: 'Description', type: 'textarea', full: true }
  ],
  events: [
    { path: 'title', label: 'Title', type: 'text' },
    { path: 'type', label: 'Event Type', type: 'select', options: ['birth','death','wedding','reunion','military','graduation','migration','church','homegoing','milestone','other'] },
    { path: 'date', label: 'Event Date', type: 'date', shape: 'event', full: true },
    { path: 'description', label: 'Description', type: 'textarea', full: true },
    { path: 'people', label: 'People Involved', type: 'personRoles', full: true },
    { path: 'branch_ids', label: 'Branches', type: 'branches', full: true },
    { path: 'location_id', label: 'Location', type: 'location' },
    { path: 'privacy', label: 'Privacy', type: 'select', options: ['public','family','private','admin'] },
    { path: 'status', label: 'Review Status', type: 'select', options: ['draft','submitted','approved','published','archived'] }
  ],
  stories: [
    { path: 'title', label: 'Title', type: 'text' },
    { path: 'body', label: 'Story', type: 'textarea', full: true },
    { path: 'era', label: 'Era', type: 'text' },
    { path: 'people_ids', label: 'People Mentioned', type: 'persons', full: true },
    { path: 'branch_ids', label: 'Branches', type: 'branches', full: true },
    { path: 'told_by', label: 'Told By', type: 'person' },
    { path: 'told_date', label: 'Told Date', type: 'plainDate' },
    { path: 'status', label: 'Status', type: 'select', options: ['draft','submitted','approved','published','archived'] },
    { path: 'privacy', label: 'Privacy', type: 'select', options: ['public','family','private','admin'] }
  ],
  media: [
    { path: 'title', label: 'Title', type: 'text' },
    { path: 'type', label: 'Media Type', type: 'select', options: ['photo','video','audio','document'] },
    { path: 'description', label: 'Description', type: 'textarea', full: true },
    { path: 'date', label: 'Media Date', type: 'date', shape: 'media' },
    { path: 'people_ids', label: 'People', type: 'persons', full: true },
    { path: 'branch_ids', label: 'Branches', type: 'branches', full: true },
    { path: 'location_id', label: 'Location', type: 'location' },
    { path: 'privacy', label: 'Privacy', type: 'select', options: ['public','family','private','admin'] }
  ],
  locations: [
    { path: 'name', label: 'Full Place Name', type: 'text' },
    { path: 'short', label: 'Short Label', type: 'text' }
  ],
  sources: [
    { path: 'title', label: 'Source Title', type: 'text' },
    { path: 'type', label: 'Source Type', type: 'select', options: ['census','family_bible','obituary','birth_certificate','death_certificate','marriage_record','interview','photo','document','other'] },
    { path: 'date', label: 'Source Date', type: 'plainDate' },
    { path: 'location', label: 'Location', type: 'location' },
    { path: 'drive_file_id', label: 'Drive File ID', type: 'text' },
    { path: 'notes', label: 'Notes', type: 'textarea', full: true },
    { path: 'reliability', label: 'Reliability (0–1)', type: 'number' }
  ]
};


// ============================================================
// MODALS
// ============================================================
function openPersonProfile(personId) {
  const p = getPerson(personId);
  if (!p) return;

  const color = getPersonColor(p);
  const initials = getInitials(p);
  const age = getAge(p);

  // Relationships
  const { parents, spouses, children, siblings } = getPersonRelations(p);

  function relList(items, role) {
    if (!items.length) return '';
    return items.map(person => `
      <li class="profile-rel-item" onclick="openPersonPage('${person.id}')">
        <span class="rel-role">${role}</span>
        <span class="rel-name">${person.name.display}</span>
        <span class="rel-arrow">›</span>
      </li>
    `).join('');
  }

  const relHtml = [
    relList(parents, 'Parent'),
    relList(spouses, 'Spouse'),
    relList(siblings, 'Sibling'),
    relList(children, 'Child')
  ].filter(Boolean).join('');

  // Events for this person
  const personEvents = getEventsForPerson(p.id);
  const personMedia = getMediaForPerson(p.id);

  const panel = document.getElementById('modal-panel');
  panel.innerHTML = `
    <div class="profile-hero">
      <button class="profile-hero-close" onclick="closeModal()">✕ Close</button>
      <div class="profile-avatar-lg" style="background:${color}">${initials}</div>
      <div class="profile-name">${p.name.first} ${p.name.middle ? p.name.middle + ' ' : ''}${p.name.last}</div>
      ${p.name.maiden ? `<div class="profile-maiden">née ${p.name.maiden}</div>` : ''}
      ${p.name.nicknames && p.name.nicknames.length ? `<div class="profile-nickname">${p.name.nicknames.join(' · ')}</div>` : ''}
      <div class="profile-vitals">
        <div class="vital-item">Born<span>${formatDateDisplay(p.birth) || 'Unknown'}</span></div>
        ${p.death ? `<div class="vital-item">Died<span>${formatDateDisplay(p.death)}</span></div>` : ''}
        ${age ? `<div class="vital-item">${p.is_living ? 'Age' : 'Lived'}<span>${age} years</span></div>` : ''}
        ${p.birth && p.birth.location_id ? `<div class="vital-item">Birthplace<span>${getLoc(p.birth.location_id)}</span></div>` : ''}
      </div>
    </div>

    <div class="profile-body">
      ${p.bio ? `
        <div class="profile-section">
          <div class="profile-section-label">Biography</div>
          <div class="profile-bio">${p.bio}</div>
        </div>
      ` : ''}

      ${relHtml ? `
        <div class="profile-section">
          <div class="profile-section-label">Relationships</div>
          <ul class="profile-rel-list">${relHtml}</ul>
        </div>
      ` : ''}

      ${personEvents.length ? `
        <div class="profile-section">
          <div class="profile-section-label">Events</div>
          <ul class="profile-rel-list">
            ${personEvents.map(e => `
              <li class="profile-rel-item" onclick="openEventDetail('${e.id}')">
                <span class="rel-role">${e.type}</span>
                <span class="rel-name">${e.title}</span>
                <span class="rel-arrow">›</span>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}

      ${personMedia.length ? `
        <div class="profile-section">
          <div class="profile-section-label">Media</div>
          <div class="media-strip">
            ${personMedia.map(media => `<div onclick="openMediaDetail('${media.id}')">${renderMediaPlaceholder(media, 'thumb')}</div>`).join('')}
          </div>
        </div>
      ` : ''}

      ${p.tags && p.tags.length ? `
        <div class="profile-section">
          <div class="profile-section-label">Tags</div>
          <div class="profile-tags">
            ${p.tags.map(t => `<span class="tag-pill">${t}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      <div class="profile-section">
        <div class="profile-section-label">Data Confidence</div>
        <div class="confidence-bar">
          <div class="confidence-track">
            <div class="confidence-fill" style="width:${(p.confidence || 0) * 100}%"></div>
          </div>
          <div class="confidence-val">${Math.round((p.confidence||0)*100)}%</div>
        </div>
      </div>

      ${p.sources && p.sources.length ? `
        <div class="profile-section">
          <div class="profile-section-label">Sources</div>
          <div class="profile-sources">${p.sources.map(s => `· ${s}`).join('<br>')}</div>
        </div>
      ` : ''}
    </div>
  `;

  document.getElementById('modal-overlay').classList.add('open');
}

function openEventDetail(eventId) {
  const e = getEvent(eventId);
  if (!e) return;
  const colorClass = getEventTypeClass(e.type);

  const people = e.people.map(ep => {
    const p = getPerson(ep.person_id);
    return p ? `<span class="person-chip" onclick="openPersonProfile('${p.id}')">${p.name.display}${ep.role ? ' (' + ep.role + ')' : ''}</span>` : '';
  }).filter(Boolean).join('');

  const panel = document.getElementById('modal-panel');
  panel.innerHTML = `
    <div class="profile-hero ${colorClass}">
      <button class="profile-hero-close" onclick="closeModal()">✕ Close</button>
      <div class="event-detail-type">${e.type}</div>
      <div class="event-detail-title">${e.title}</div>
      <div class="event-detail-date">${formatDateDisplay(e.date)}${e.date.certainty !== 'exact' ? ' (estimated)' : ''}</div>
    </div>
    <div class="profile-body">
      ${e.description ? `
        <div class="profile-section">
          <div class="profile-section-label">About</div>
          <div class="event-detail-desc">${e.description}</div>
        </div>
      ` : ''}

      ${e.location_id ? `
        <div class="profile-section">
          <div class="profile-section-label">Location</div>
          <div class="profile-bio">${getLoc(e.location_id)}</div>
        </div>
      ` : ''}

      ${people ? `
        <div class="profile-section">
          <div class="profile-section-label">People Involved</div>
          <div class="tl-people">${people}</div>
        </div>
      ` : ''}

      ${e.recurrence && e.recurrence.type === 'annual' && e.recurrence.month ? `
        <div class="profile-section">
          <div class="profile-section-label">Recurrence</div>
          <div class="profile-bio" style="font-style:normal;font-size:14px;">This event is commemorated annually on ${new Date(2000, e.recurrence.month-1, e.recurrence.day||1).toLocaleDateString('en-US',{month:'long', day:'numeric'})}.</div>
        </div>
      ` : ''}

      ${e.tags && e.tags.length ? `
        <div class="profile-section">
          <div class="profile-section-label">Tags</div>
          <div class="profile-tags">${e.tags.map(t => `<span class="tag-pill">${t}</span>`).join('')}</div>
        </div>
      ` : ''}

      ${e.sources && e.sources.length ? `
        <div class="profile-section">
          <div class="profile-section-label">Sources</div>
          <div class="profile-sources">${e.sources.map(s => `· ${s}`).join('<br>')}</div>
        </div>
      ` : ''}
    </div>
  `;

  document.getElementById('modal-overlay').classList.add('open');
}

function openMediaDetail(mediaId) {
  const media = getMedia(mediaId);
  if (!media) return;

  const people = (media.people_ids || []).map(getPerson).filter(Boolean);
  const events = (media.event_ids || []).map(getEvent).filter(Boolean);
  const branches = (media.branch_ids || []).map(getBranch).filter(Boolean);

  const panel = document.getElementById('modal-panel');
  panel.innerHTML = `
    <div class="profile-hero">
      <button class="profile-hero-close" onclick="closeModal()">Close</button>
      <div class="event-detail-type">${escapeHtml(media.type || 'media')}</div>
      <div class="event-detail-title">${escapeHtml(media.title)}</div>
      <div class="event-detail-date">${escapeHtml(getMediaDateDisplay(media))}</div>
    </div>
    <div class="profile-body">
      ${renderMediaPlaceholder(media, 'hero')}
      ${media.description ? `
        <div class="profile-section">
          <div class="profile-section-label">Description</div>
          <div class="event-detail-desc">${escapeHtml(media.description)}</div>
        </div>
      ` : ''}
      ${people.length ? `
        <div class="profile-section">
          <div class="profile-section-label">People Tagged</div>
          <div class="tl-people">${people.map(person => `<span class="person-chip" onclick="openPersonProfile('${person.id}')">${escapeHtml(person.name.display)}</span>`).join('')}</div>
        </div>
      ` : ''}
      ${events.length ? `
        <div class="profile-section">
          <div class="profile-section-label">Events Linked</div>
          <div class="tl-people">${events.map(event => `<span class="person-chip" onclick="openEventDetail('${event.id}')">${escapeHtml(event.title)}</span>`).join('')}</div>
        </div>
      ` : ''}
      ${branches.length ? `
        <div class="profile-section">
          <div class="profile-section-label">Branches</div>
          <div class="media-tag-list">${branches.map(branch => `<span class="tag-pill">${escapeHtml(branch.name)}</span>`).join('')}</div>
        </div>
      ` : ''}
      ${(media.original_format || media.digitized_date) ? `
        <div class="profile-section">
          <div class="profile-section-label">Format &amp; Digitization</div>
          <div class="profile-sources">
            ${media.original_format ? `Original format: ${escapeHtml(media.original_format)}` : ''}
            ${media.original_format && media.digitized_date ? '<br>' : ''}
            ${media.digitized_date ? `Digitized: ${escapeHtml(media.digitized_date)}` : ''}
          </div>
        </div>
      ` : ''}
      ${media.source_info || media.submitted_by ? `
        <div class="profile-section">
          <div class="profile-section-label">Source Info</div>
          <div class="profile-sources">${escapeHtml(media.source_info || `Submitted by ${media.submitted_by}`)}</div>
        </div>
      ` : ''}
      ${media.tags?.length ? `
        <div class="profile-section">
          <div class="profile-section-label">Tags</div>
          <div class="profile-tags">${media.tags.map(tag => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join('')}</div>
        </div>
      ` : ''}
    </div>
  `;

  document.getElementById('modal-overlay').classList.add('open');
}

function openStoryDetail(storyId) {
  const story = D.stories.find(item => item.id === storyId);
  if (!story) return;

  const teller = story.told_by ? getPerson(story.told_by) : null;
  const people = (story.people_ids || []).map(getPerson).filter(Boolean);

  const panel = document.getElementById('modal-panel');
  panel.innerHTML = `
    <div class="profile-hero">
      <button class="profile-hero-close" onclick="closeModal()">Close</button>
      <div class="event-detail-type">Story</div>
      <div class="event-detail-title">${escapeHtml(story.title)}</div>
      <div class="event-detail-date">${escapeHtml(story.era || 'Era not specified')}</div>
    </div>
    <div class="profile-body">
      ${(teller || story.told_by_name) ? `
        <div class="profile-section">
          <div class="profile-section-label">Told By</div>
          <div class="profile-bio" style="font-style:normal;">${escapeHtml(teller ? teller.name.display : story.told_by_name)}</div>
        </div>
      ` : ''}

      <div class="profile-section">
        <div class="profile-section-label">Story</div>
        <div class="event-detail-desc">${escapeHtml(story.body)}</div>
      </div>

      ${people.length ? `
        <div class="profile-section">
          <div class="profile-section-label">People Mentioned</div>
          <div class="tl-people">
            ${people.map(person => `<span class="person-chip" onclick="openPersonPage('${person.id}')">${escapeHtml(person.name.display)}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      ${story.tags && story.tags.length ? `
        <div class="profile-section">
          <div class="profile-section-label">Tags</div>
          <div class="profile-tags">${story.tags.map(tag => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join('')}</div>
        </div>
      ` : ''}
    </div>
  `;

  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay')) return;
  document.getElementById('modal-overlay').classList.remove('open');
}

// ESC to close
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.getElementById('modal-overlay').classList.remove('open');
});
