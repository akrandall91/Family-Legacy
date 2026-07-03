// render-home.js
// Home page and Timeline rendering.

// ============================================================
// HOME PAGE
// ============================================================
function renderHome() {
  // Family name
  document.getElementById('nav-family-name').textContent = D.meta.family_name;
  const familyTitleName = D.meta.family_name
    .replace(/^The\s+/i, '')
    .replace(/\s+Family$/i, '');
  document.getElementById('home-family-title').innerHTML =
    'The <em>' + familyTitleName + '</em><br>Family';
  document.getElementById('home-tagline').textContent = D.meta.tagline;

  // Stats
  const living = D.persons.filter(p => p.is_living).length;
  const deceased = D.persons.filter(p => !p.is_living).length;
  document.getElementById('home-stats').innerHTML = `
    <div class="stat-item"><span class="stat-num">${D.persons.length}</span><span class="stat-label">People</span></div>
    <div class="stat-item"><span class="stat-num">${D.events.length}</span><span class="stat-label">Events</span></div>
    <div class="stat-item"><span class="stat-num">${D.stories.length}</span><span class="stat-label">Stories</span></div>
    <div class="stat-item"><span class="stat-num">${D.branches.length}</span><span class="stat-label">Branches</span></div>
  `;

  // Anniversary widget
  renderAnniversaries();

  // Stories preview
  const sc = document.getElementById('home-stories');
  sc.innerHTML = D.stories.map(s => `
    <div class="story-card" onclick="showPage('stories')">
      <div class="story-title">${s.title}</div>
      <div class="story-excerpt">${s.body}</div>
      <div class="story-meta">${s.era || ''} · ${s.people_ids.map(id => getPerson(id)?.name.display || '').filter(Boolean).join(', ')}</div>
    </div>
  `).join('');

  // Events preview (last 5 by date)
  const sorted = [...D.events].sort((a,b) => a.date.start > b.date.start ? 1 : -1);
  const ec = document.getElementById('home-events');
  ec.innerHTML = sorted.slice(0, 6).map(e => `
    <div class="event-card" onclick="openEventDetail('${e.id}')">
      <div class="event-type-dot ${getDotClass(e.type)}"></div>
      <div>
        <div class="event-title">${e.title}</div>
        <div class="event-date">${formatDateDisplay(e.date)}</div>
      </div>
    </div>
  `).join('');
}

function renderAnniversaries() {
  const today = new Date();
  const window = 60; // days
  const upcoming = [];

  D.events.forEach(evt => {
    if (!evt.recurrence || evt.recurrence.type !== 'annual') return;
    const m = evt.recurrence.month - 1;
    const d = evt.recurrence.day || 1;
    let thisYear = new Date(today.getFullYear(), m, d);
    if (thisYear < today) thisYear = new Date(today.getFullYear() + 1, m, d);
    const diff = Math.round((thisYear - today) / 86400000);
    if (diff >= 0 && diff <= window) {
      const startYear = parseInt((evt.date.start || '').substr(0,4));
      const yearsAgo = today.getFullYear() - startYear || null;
      upcoming.push({ evt, diff, yearsAgo });
    }
  });

  upcoming.sort((a,b) => a.diff - b.diff);

  const el = document.getElementById('anniversary-list');
  if (!upcoming.length) {
    el.innerHTML = '<div class="ann-empty">No anniversaries in the next 60 days.</div>';
    return;
  }

  el.innerHTML = upcoming.map(u => {
    const label = u.diff === 0 ? 'TODAY' : u.diff === 1 ? '1 day' : u.diff + ' days';
    const sub = u.yearsAgo ? u.yearsAgo + ' years ago' : '';
    return `
      <div class="ann-item" onclick="openEventDetail('${u.evt.id}')">
        <div class="ann-days">${label}</div>
        <div>
          <div class="ann-title">${u.evt.title}</div>
          ${sub ? `<div class="ann-sub">${sub}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}


// ============================================================
// TIMELINE
// ============================================================
let activeTimelineFilters = new Set(['all']);

function renderTimeline() {
  // Build filter pills
  const types = [...new Set(D.events.map(e => e.type))];
  const fc = document.getElementById('timeline-filters');
  fc.innerHTML = `<button class="filter-pill active" data-filter="all" onclick="toggleTimelineFilter('all', this)">All</button>` +
    types.map(t => `<button class="filter-pill" data-filter="${t}" onclick="toggleTimelineFilter('${t}', this)">${t.charAt(0).toUpperCase()+t.slice(1)}</button>`).join('');

  buildTimelineEntries();
}

function toggleTimelineFilter(type, btn) {
  if (type === 'all') {
    activeTimelineFilters.clear();
    activeTimelineFilters.add('all');
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
  } else {
    activeTimelineFilters.delete('all');
    document.querySelector('.filter-pill[data-filter="all"]').classList.remove('active');
    if (activeTimelineFilters.has(type)) {
      activeTimelineFilters.delete(type);
      btn.classList.remove('active');
    } else {
      activeTimelineFilters.add(type);
      btn.classList.add('active');
    }
    if (!activeTimelineFilters.size) {
      activeTimelineFilters.add('all');
      document.querySelector('.filter-pill[data-filter="all"]').classList.add('active');
    }
  }
  buildTimelineEntries();
}

function buildTimelineEntries() {
  let events = [...D.events];
  if (!activeTimelineFilters.has('all')) {
    events = events.filter(e => activeTimelineFilters.has(e.type));
  }

  // Sort by date
  events.sort((a, b) => {
    const ad = a.date.start.replace(/-00/g, '-01');
    const bd = b.date.start.replace(/-00/g, '-01');
    return ad < bd ? -1 : 1;
  });

  // Group by decade
  const decades = {};
  events.forEach(e => {
    const year = parseInt((e.date.start || '0000').substr(0,4));
    const decade = Math.floor(year / 10) * 10;
    if (!decades[decade]) decades[decade] = [];
    decades[decade].push(e);
  });

  const container = document.getElementById('timeline-entries');
  container.innerHTML = Object.entries(decades).map(([decade, evts]) => `
    <div class="timeline-decade">
      <div class="decade-label">${decade}s</div>
      <div class="decade-events">
        ${evts.map(e => {
          const isEst = e.date.certainty !== 'exact';
          const people = e.people.map(ep => {
            const p = getPerson(ep.person_id);
            return p ? `<span class="person-chip" onclick="openPersonProfile('${p.id}')">${p.name.display}</span>` : '';
          }).filter(Boolean).join('');
          return `
            <div class="tl-event" onclick="openEventDetail('${e.id}')">
              <div class="tl-type">${e.type}</div>
              <div class="tl-title">${e.title}</div>
              <div class="tl-date">
                ${formatDateDisplay(e.date)}
                ${isEst ? '<span class="estimated-badge">est.</span>' : ''}
              </div>
              ${e.description ? `<div class="tl-desc">${e.description}</div>` : ''}
              ${people ? `<div class="tl-people">${people}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');
}
