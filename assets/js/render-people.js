// render-people.js
// People directory, Stories list, Branches, Search, and Gallery rendering.

// ============================================================
// PEOPLE GRID
// ============================================================
let allPersonsForFilter = [];

function renderPeople() {
  allPersonsForFilter = [...D.persons];
  document.getElementById('people-count').textContent = `${D.persons.length} people`;
  renderPeopleGrid(allPersonsForFilter);
}

function filterPeople(query) {
  const q = query.toLowerCase().trim();
  if (!q) { renderPeopleGrid(allPersonsForFilter); return; }
  const filtered = allPersonsForFilter.filter(p => {
    const n = p.name;
    return [n.first, n.last, n.maiden, n.display, ...(n.nicknames||[]), ...(p.tags||[])]
      .filter(Boolean).some(s => s.toLowerCase().includes(q));
  });
  renderPeopleGrid(filtered);
}

function renderPeopleGrid(persons) {
  const grid = document.getElementById('people-grid');
  if (!persons.length) { grid.innerHTML = '<div class="empty-state">No people found.</div>'; return; }

  // Sort: deceased first (historical), then living alphabetically
  const sorted = [...persons].sort((a,b) => {
    if (!a.is_living && b.is_living) return -1;
    if (a.is_living && !b.is_living) return 1;
    const ay = a.birth ? parseInt(a.birth.date.substr(0,4)) : 9999;
    const by = b.birth ? parseInt(b.birth.date.substr(0,4)) : 9999;
    return ay - by;
  });

  grid.innerHTML = sorted.map(p => {
    const color = getPersonColor(p);
    const initials = getInitials(p);
    const byear = p.birth ? p.birth.date.substr(0,4) : '?';
    const dyear = p.death ? p.death.date.substr(0,4) : '';
    const datesStr = p.is_living ? `b. ${byear}` : `${byear}${dyear ? ' – ' + dyear : ''}`;
    const nickname = p.name.nicknames && p.name.nicknames.length ? '"' + p.name.nicknames[0] + '"' : '';
    const mainBranch = p.branch_ids && p.branch_ids[0] ? getBranch(p.branch_ids[0]) : null;
    return `
      <div class="person-card" onclick="openPersonPage('${p.id}')">
        ${p.is_living ? '<div class="pc-living" title="Living"></div>' : ''}
        <div class="pc-avatar" style="background:${color}">${initials}</div>
        <div class="pc-name">${p.name.display}</div>
        ${nickname ? `<div class="pc-nickname">${nickname}</div>` : ''}
        <div class="pc-dates">${datesStr}</div>
        ${mainBranch ? `<div class="pc-branch" style="background:${color}22;color:${color}">${mainBranch.name}</div>` : ''}
      </div>
    `;
  }).join('');
}

// ============================================================
// STORIES
// ============================================================
function renderStories() {
  const container = document.getElementById('stories-list');
  container.innerHTML = D.stories.map(s => {
    const people = s.people_ids.map(id => getPerson(id)).filter(Boolean);
    const teller = getPerson(s.told_by);
    return `
      <div class="story-full">
        <div class="story-full-title">${s.title}</div>
        <div class="story-attribution">
          ${teller ? 'As told by ' + teller.name.display : ''}
          ${s.era ? ' · ' + s.era : ''}
        </div>
        <div class="story-body">"${s.body}"</div>
        ${people.length ? `
          <div class="story-people-link">
            <span class="story-people-label">People in this story:</span>
            ${people.map(p => `<span class="person-chip" onclick="openPersonPage('${p.id}')">${p.name.display}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// ============================================================
// BRANCHES
// ============================================================
const branchConnectionFilters = { descendantBranches:true, marriage:false, adoption:true, stepfamily:false, household:false, uncertain:true };
function setBranchConnectionFilter(key,value){branchConnectionFilters[key]=value;renderBranches();}
function renderBranches() {
  const container = document.getElementById('branches-content');
  if (!container) return;

  if (activeBranchId) {
    const branch = getBranch(activeBranchId);
    if (!branch) {
      activeBranchId = null;
      renderBranches();
      return;
    }

    const memberships=(D.persons||[]).flatMap(person=>getBranchMemberships(person).filter(m=>m.branch_id===branch.id).map(m=>({person,m})));
    const directPeople=[...new Map(memberships.filter(x=>x.m.connection_type==='descent').map(x=>[x.person.id,x.person])).values()];
    const adoptivePeople=[...new Map(memberships.filter(x=>x.m.connection_type==='adoption').map(x=>[x.person.id,x.person])).values()];
    const connectedPeople=[...new Map(memberships.filter(x=>!['descent','adoption'].includes(x.m.connection_type) && (branchConnectionFilters.uncertain || x.m.status==='confirmed')).map(x=>[x.person.id,x.person])).values()];
    const branchPeople=[...new Map([...directPeople,...(branchConnectionFilters.adoption?adoptivePeople:[]),...connectedPeople.filter(p=>{const m=memberships.find(x=>x.person.id===p.id)?.m;return (m.connection_type==='marriage'&&branchConnectionFilters.marriage)||(m.connection_type==='stepfamily'&&branchConnectionFilters.stepfamily)||(m.connection_type==='household'&&branchConnectionFilters.household)||m.connection_type==='research';})].map(p=>[p.id,p])).values()];
    const branchEvents = [...getBranchEvents(branch.id)].sort((a, b) => {
      const ad = (a.date?.start || '9999-99-99').replace(/-00/g, '-01');
      const bd = (b.date?.start || '9999-99-99').replace(/-00/g, '-01');
      return ad.localeCompare(bd);
    });
    const rootAncestor = getPerson(branch.root_person_id);

    container.innerHTML = `
      <div class="branch-detail-shell">
        <span class="branch-back-link" onclick="closeBranchDetail()">← Back to Branches</span>
        <div class="branch-detail-bar" style="background:${branch.color}"></div>
        <div class="branch-detail-name">${escapeHtml(branch.name)}</div>
        <div class="branch-detail-era">${escapeHtml(branch.era_start || 'Era not recorded')}</div>
        <div class="branch-detail-desc">${escapeHtml(branch.description || 'No description yet.')}</div>
        <div class="branch-stat-row">
          <div class="branch-stat-chip"><div class="branch-stat-value">${directPeople.length}</div><div class="branch-stat-label">Direct descendants</div></div>
          <div class="branch-stat-chip"><div class="branch-stat-value">${new Set([...directPeople,...adoptivePeople].map(p=>p.id)).size}</div><div class="branch-stat-label">Total descendants</div></div>
          <div class="branch-stat-chip"><div class="branch-stat-value">${connectedPeople.length}</div><div class="branch-stat-label">Connected relatives</div></div>
          <div class="branch-stat-chip"><div class="branch-stat-value">${(D.unions||[]).filter(u=>(u.partner_ids||[]).some(id=>branchPeople.some(p=>p.id===id))).length}</div><div class="branch-stat-label">Unions</div></div>
          <div class="branch-stat-chip"><div class="branch-stat-value">${(D.households||[]).filter(h=>[...(h.adult_ids||[]),...(h.child_ids||[]),...(h.member_ids||[])].some(id=>branchPeople.some(p=>p.id===id))).length}</div><div class="branch-stat-label">Households</div></div>
          <div class="branch-stat-chip">
            <div class="branch-stat-value">${branchEvents.length}</div>
            <div class="branch-stat-label">Events</div>
          </div>
          <div class="branch-stat-chip">
            <div class="branch-stat-value">${getBranchStoryCount(branch.id)}</div>
            <div class="branch-stat-label">Stories</div>
          </div>
          <div class="branch-stat-chip">
            <div class="branch-stat-value">${escapeHtml(rootAncestor ? rootAncestor.name.display : 'Unknown')}</div>
            <div class="branch-stat-label">Root Ancestor</div>
          </div>
        </div>
        <div class="exploration-control" aria-label="Branch connection filters"><label><input type="checkbox" ${branchConnectionFilters.adoption?'checked':''} onchange="setBranchConnectionFilter('adoption',this.checked)"> Adoption</label><label><input type="checkbox" ${branchConnectionFilters.marriage?'checked':''} onchange="setBranchConnectionFilter('marriage',this.checked)"> Marriage</label><label><input type="checkbox" ${branchConnectionFilters.stepfamily?'checked':''} onchange="setBranchConnectionFilter('stepfamily',this.checked)"> Step-family</label><label><input type="checkbox" ${branchConnectionFilters.household?'checked':''} onchange="setBranchConnectionFilter('household',this.checked)"> Household</label><label><input type="checkbox" ${branchConnectionFilters.uncertain?'checked':''} onchange="setBranchConnectionFilter('uncertain',this.checked)"> Uncertain</label></div>

        <div class="mini-section-title">People in This Branch</div>
        ${branchPeople.length ? `
          <div class="mini-people-grid">
            ${branchPeople.map(person => `
              <div class="mini-person-card" onclick="openPersonPage('${person.id}')">
                <div class="mini-person-top">
                  <div class="mini-person-avatar" style="background:${getPersonColor(person)}">${getInitials(person)}</div>
                  <div>
                    <div class="mini-person-name">${escapeHtml(person.name.display)}</div>
                    <div class="mini-person-meta">${escapeHtml(person.is_living ? 'Living' : formatDateDisplay(person.birth) || 'Dates unknown')}</div>
                  </div>
                </div>
                <div class="mini-person-meta">${escapeHtml(buildStoryExcerpt(person.bio || 'No biography yet.', 110))}</div>
              </div>
            `).join('')}
          </div>
        ` : '<div class="empty-state">No people are tagged to this branch yet.</div>'}

        <div class="mini-section-title">Branch Timeline</div>
        ${branchEvents.length ? `
          <div class="mini-timeline-list">
            ${branchEvents.map(event => `
              <div class="mini-event-card" onclick="openEventDetail('${event.id}')">
                <div class="mini-event-date">${escapeHtml(formatDateDisplay(event.date) || 'Date unknown')}</div>
                <div class="mini-event-title">${escapeHtml(event.title)}</div>
                <div class="mini-person-meta">${escapeHtml(event.description || 'No description yet.')}</div>
              </div>
            `).join('')}
          </div>
        ` : '<div class="empty-state">No events are tagged to this branch yet.</div>'}
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="branches-grid">
      ${D.branches.map(branch => {
        const rootAncestor = getPerson(branch.root_person_id);
        const peopleCount = getBranchPeople(branch.id).length;
        const eventCount = getBranchEvents(branch.id).length;
        return `
          <div class="branch-card">
            <div class="branch-card-bar" style="background:${branch.color}"></div>
            <div class="branch-card-name">${escapeHtml(branch.name)}</div>
            <div class="branch-card-desc">${escapeHtml(branch.description || 'No description yet.')}</div>
            <div class="branch-meta-list">
              <div class="branch-meta-item">
                <span class="branch-meta-label">Root Ancestor</span>
                <span class="branch-meta-value">${escapeHtml(rootAncestor ? rootAncestor.name.display : 'Unknown')}</span>
              </div>
              <div class="branch-meta-item">
                <span class="branch-meta-label">People</span>
                <span class="branch-meta-value">${peopleCount}</span>
              </div>
              <div class="branch-meta-item">
                <span class="branch-meta-label">Events</span>
                <span class="branch-meta-value">${eventCount}</span>
              </div>
            </div>
            <button class="branch-action-btn" type="button" onclick="openBranchDetail('${branch.id}')">View Branch</button>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function openBranchDetail(branchId) {
  activeBranchId = branchId;
  renderBranches();
}

function closeBranchDetail() {
  activeBranchId = null;
  renderBranches();
}


// ============================================================
// SEARCH
// ============================================================
function renderSearchPage() {
  renderSearchResults((document.getElementById('search-page-input') || {}).value || '');
}

function handleGlobalSearchInput(value) {
  clearTimeout(globalSearchTimer);
  globalSearchTimer = setTimeout(() => renderSearchResults(value), 300);
}

function clearGlobalSearch() {
  const input = document.getElementById('search-page-input');
  if (input) input.value = '';
  clearTimeout(globalSearchTimer);
  renderSearchResults('');
}

function renderSearchResults(query) {
  const container = document.getElementById('search-results');
  if (!container) return;

  const q = (query || '').toLowerCase().trim();
  if (!q) {
    container.innerHTML = '<div class="search-empty">Start typing to search across people, events, and stories.</div>';
    return;
  }

  const people = D.persons.filter(person => {
    const fields = [
      person.name.first,
      person.name.last,
      person.name.maiden,
      person.name.display,
      ...(person.name.nicknames || []),
      person.bio,
      ...(person.tags || [])
    ].filter(Boolean).join(' ').toLowerCase();
    return fields.includes(q);
  });

  const events = D.events.filter(event => {
    const fields = [
      event.title,
      event.description,
      ...(event.tags || [])
    ].filter(Boolean).join(' ').toLowerCase();
    return fields.includes(q);
  });

  const stories = D.stories.filter(story => {
    const fields = [
      story.title,
      story.body,
      ...(story.tags || [])
    ].filter(Boolean).join(' ').toLowerCase();
    return fields.includes(q);
  });

  const total = people.length + events.length + stories.length;
  if (!total) {
    container.innerHTML = `<div class="search-empty">Nothing found for "${escapeHtml(query)}"</div>`;
    return;
  }

  container.innerHTML = `
    <div class="search-results-wrap">
      ${renderSearchGroup('People', people.length, people.map(person => `
        <div class="search-result-card" onclick="openPersonPage('${person.id}')">
          <div class="search-result-type">Person</div>
          <div class="search-result-title">${escapeHtml(person.name.display)}</div>
          <div class="search-result-meta">${escapeHtml(buildStoryExcerpt(person.bio || ((person.tags || []).join(', ') || 'No biography yet.'), 140))}</div>
        </div>
      `).join(''))}
      ${renderSearchGroup('Events', events.length, events.map(item => `
        <div class="search-result-card" onclick="openEventDetail('${item.id}')">
          <div class="search-result-type">Event</div>
          <div class="search-result-title">${escapeHtml(item.title)}</div>
          <div class="search-result-meta">${escapeHtml(buildStoryExcerpt(item.description || formatDateDisplay(item.date) || 'No description yet.', 140))}</div>
        </div>
      `).join(''))}
      ${renderSearchGroup('Stories', stories.length, stories.map(story => `
        <div class="search-result-card" onclick="openStoryDetail('${story.id}')">
          <div class="search-result-type">Story</div>
          <div class="search-result-title">${escapeHtml(story.title)}</div>
          <div class="search-result-meta">${escapeHtml(buildStoryExcerpt(story.body, 160))}</div>
        </div>
      `).join(''))}
    </div>
  `;
}

function renderSearchGroup(label, count, cards) {
  return `
    <section>
      <div class="search-group-head">
        <div class="search-group-title">${label}</div>
        <div class="search-group-count">${count} result${count === 1 ? '' : 's'}</div>
      </div>
      ${count ? `<div class="search-result-grid">${cards}</div>` : '<div class="search-empty">No matches in this section.</div>'}
    </section>
  `;
}

// ============================================================
// GALLERY
// ============================================================
function renderGallery() {
  const root = document.getElementById('gallery-root');
  if (!root) return;

  let mediaItems = [...D.media];
  if (galleryTypeFilter !== 'all') mediaItems = mediaItems.filter(media => media.type === galleryTypeFilter);
  if (galleryBranchFilter !== 'all') mediaItems = mediaItems.filter(media => (media.branch_ids || []).includes(galleryBranchFilter));
  if (galleryEraFilter !== 'all') mediaItems = mediaItems.filter(media => getMediaEraLabel(media) === galleryEraFilter);

  mediaItems.sort((a, b) => (b.date?.value || '').localeCompare(a.date?.value || ''));

  root.innerHTML = `
    <div class="gallery-filters">
      <div class="timeline-filters">
        ${['all', 'photo', 'video', 'document'].map(type => `
          <button class="filter-pill ${galleryTypeFilter === type ? 'active' : ''}" type="button" onclick="setGalleryType('${type}')">${type === 'all' ? 'All' : getMediaTypeLabel(type)}</button>
        `).join('')}
      </div>
      <select class="legacy-select gallery-select" onchange="setGalleryBranch(this.value)">
        <option value="all">All Branches</option>
        ${D.branches.map(branch => `<option value="${branch.id}" ${galleryBranchFilter === branch.id ? 'selected' : ''}>${escapeHtml(branch.name)}</option>`).join('')}
      </select>
      <select class="legacy-select gallery-select" onchange="setGalleryEra(this.value)">
        <option value="all">All Eras</option>
        ${getAllMediaEras().map(era => `<option value="${era}" ${galleryEraFilter === era ? 'selected' : ''}>${escapeHtml(era)}</option>`).join('')}
      </select>
    </div>
    ${mediaItems.length ? `
      <div class="gallery-masonry">
        ${mediaItems.map(media => `
          <div class="media-card" onclick="openMediaDetail('${media.id}')">
            ${renderMediaPlaceholder(media)}
          </div>
        `).join('')}
      </div>
    ` : '<div class="empty-state">No media matches the current filters.</div>'}
  `;
}

function setGalleryType(type) {
  galleryTypeFilter = type;
  renderGallery();
}

function setGalleryBranch(branchId) {
  galleryBranchFilter = branchId;
  renderGallery();
}

function setGalleryEra(era) {
  galleryEraFilter = era;
  renderGallery();
}
