// app.js
// Page routing/navigation, global UI state, nav wiring, and app init.
// This file must load LAST (after all other assets/js/*.js files) because
// it triggers the initial render on load.

// ============================================================
// NAVIGATION
// ============================================================
let currentPage = 'home';
let treeRendered = false;
let activeBranchId = null;
let activeContributeTab = 'person';
let globalSearchTimer = null;
let currentPersonId = null;
let pageHistory = [];
let galleryTypeFilter = 'all';
let galleryBranchFilter = 'all';
let galleryEraFilter = 'all';
let adminTab = 'overview';
let adminEditorType = 'persons';
let adminEditorRecordId = '';
let adminEditorOriginal = '';
let adminDismissedDuplicates = new Set();
let editDataType = 'persons';
let editDataRecordId = '';
let selectedProfileType = null;
let profileTypePendingDeleteId = null;
let familyAdminPendingDeleteId = null;
let currentUserRole = null;
let currentUserName = '';
let currentUserBranchIds = [];
let pageRevealObserver = null;
const pickerState = {
  event: { selected: [], query: '' },
  story: { selected: [], query: '' },
  note: { selected: [], query: '' }
};

function pushHistoryState() {
  if (currentPage === 'person' && currentPersonId) {
    pageHistory.push({ page: currentPage, personId: currentPersonId });
  } else {
    pageHistory.push({ page: currentPage });
  }
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById('page-' + name).classList.add('active');
  const btns = document.querySelectorAll('.nav-btn');
  btns.forEach(b => {
    const normalized = b.textContent.trim().replace(/^⚙\s*/, '').toLowerCase();
    if (normalized === name || (name === 'home' && normalized === 'home')) b.classList.add('active');
  });

  currentPage = name;

  if (name === 'tree' && !treeRendered) { renderTree(); treeRendered = true; }
  if (name === 'timeline') renderTimeline();
  if (name === 'people') renderPeople();
  if (name === 'stories') renderStories();
  if (name === 'branches') renderBranches();
  if (name === 'contribute') renderContribute();
  if (name === 'search') renderSearchPage();
  if (name === 'gallery') renderGallery();
  if (name === 'person') renderPersonPage();
  if (name === 'admin' || name === 'edit-data') {
    renderProtectedPage(name);
  }
  requestAnimationFrame(() => setupPageReveals(name));
}

function setupPageReveals(name) {
  if (pageRevealObserver) pageRevealObserver.disconnect();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const selectors = {
    home: ['.anniversary-widget', '.home-sections > div'],
    timeline: ['.tl-event'],
    people: ['.person-card'],
    stories: ['.story-full'],
    branches: ['.branch-card'],
    gallery: ['.media-card'],
    person: ['.person-page-section']
  };
  const page = document.getElementById(`page-${name}`);
  if (!page || !selectors[name]) return;
  const items = selectors[name].flatMap(selector => [...page.querySelectorAll(selector)]);
  items.forEach((item, index) => {
    item.classList.remove('is-revealed');
    item.classList.add('scroll-reveal');
    item.classList.toggle('reveal-story', name === 'stories');
    item.classList.toggle('reveal-branch', name === 'branches');
    item.classList.toggle('reveal-gallery', name === 'gallery');
    item.classList.toggle('reveal-left', name === 'timeline' && index % 2 === 0);
    item.classList.toggle('reveal-right', name === 'timeline' && index % 2 === 1);
    item.style.setProperty('--reveal-delay', `${(index % 5) * 80}ms`);
  });
  if (reduceMotion) {
    items.forEach(item => item.classList.add('is-revealed'));
    return;
  }
  pageRevealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      pageRevealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  items.forEach(item => pageRevealObserver.observe(item));
}


// Fix nav button matching
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.onclick = () => {
    const label = btn.textContent.trim().replace(/^⚙\s*/, '');
    const pages = { 'Home':'home','Tree':'tree','Timeline':'timeline','People':'people','Stories':'stories', 'Branches':'branches', 'Contribute':'contribute', 'Search':'search', 'Gallery':'gallery', 'Edit Data':'edit-data', 'Admin':'admin' };
    const p = pages[label];
    if (p) showPage(p);
  };
});


// ============================================================
// INIT
// ============================================================
async function initializeFamilyLegacy() {
  await loadCentralFamilyData();
  rebuildFamilyIndexes();
  renderHome();
  if (window.location.hash.toLowerCase() === '#contribute') {
    showPage('contribute');
  }
}
initializeFamilyLegacy();
