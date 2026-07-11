// utils.js
// Small stateless helper/formatting functions used across the app.
// No page-rendering or data-mutation logic lives here.

function getBranchColor(branchId) {
  const b = getBranch(branchId);
  return b ? b.color : '#8a7a68';
}

function getPersonColor(person) {
  return getBranchColor(getPrimaryBranchId(person));
}

function getInitials(person) {
  return ((person.name.first?.[0] || '') + (person.name.last?.[0] || '')).toUpperCase();
}

function formatDateDisplay(dateObj) {
  if (!dateObj) return '';
  const cert = dateObj.certainty;
  const disp = dateObj.display || '';
  if (cert === 'estimated' || cert === 'circa') return '~' + disp;
  return disp;
}

function getAge(person) {
  if (!person.birth || !person.birth.date) return null;
  const birthYear = parseInt(person.birth.date.substr(0,4));
  if (!birthYear) return null;
  if (person.death && person.death.date) {
    const deathYear = parseInt(person.death.date.substr(0,4));
    return deathYear - birthYear;
  }
  if (person.is_living) {
    return new Date().getFullYear() - birthYear;
  }
  return null;
}

function getEventTypeColor(type) {
  const map = { wedding:'#b86040', birth:'#4a8c48', death:'#6060a0', reunion:'#b89040', military:'#5080b0' };
  return map[type] || '#806050';
}

function getEventTypeClass(type) { return 'type-' + (type || 'other'); }
function getDotClass(type) { return 'dot-' + (type || 'other'); }

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'entry';
}

function parseLooseDateToStart(value) {
  const raw = (value || '').trim();
  if (!raw) return '';

  const directYear = raw.match(/^(\d{4})$/);
  if (directYear) return `${directYear[1]}-00-00`;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const monthYear = raw.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i);
  if (monthYear) {
    const monthIndex = ['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(monthYear[1].toLowerCase()) + 1;
    return `${monthYear[2]}-${String(monthIndex).padStart(2, '0')}-00`;
  }

  return '0000-00-00';
}

function getBranchPeople(branchId) {
  return D.persons.filter(person => (person.branch_ids || []).includes(branchId));
}

function getBranchEvents(branchId) {
  return D.events.filter(event => (event.branch_ids || []).includes(branchId));
}

function getBranchStoryCount(branchId) {
  const personIds = new Set(getBranchPeople(branchId).map(person => person.id));
  return D.stories.filter(story => story.people_ids.some(id => personIds.has(id))).length;
}

function getStoriesForPerson(personId) {
  return D.stories.filter(story => (story.people_ids || []).includes(personId));
}

function getMediaForPerson(personId) {
  return D.media.filter(media => (media.people_ids || []).includes(personId));
}

function getEventsForPerson(personId) {
  return D.events.filter(event => (event.people || []).some(ep => ep.person_id === personId));
}

function getPersonRelations(person) {
  const parents = getParentIds(person).map(getPerson).filter(Boolean);
  const spouses = (person.relationships.spouses || []).map(s => getPerson(s.person_id)).filter(Boolean);
  const children = (ensureFamilyIndexes().childrenByParentId.get(person.id) || []).map(r => getPerson(r.person_id)).filter(Boolean);
  const siblingGroups = { full:getFullSiblings(person.id), half:getHalfSiblings(person.id), step:getStepSiblings(person.id), adoptive:getAdoptiveSiblings(person.id) };
  const siblings = [...new Map(Object.values(siblingGroups).flat().map(p=>[p.id,p])).values()];
  return { parents, siblings, spouses, children, siblingGroups };
}

function getDateYear(dateValue) {
  const str = typeof dateValue === 'string' ? dateValue : (dateValue?.start || dateValue?.value || dateValue?.date || '');
  const year = parseInt(String(str).slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function getMediaDateDisplay(media) {
  return formatDateDisplay(media.date || { display: '', certainty: 'unknown' }) || media.date?.display || 'Date unknown';
}

function getMediaEraLabel(media) {
  const year = getDateYear(media.date?.value);
  if (!year) return 'Unknown';
  if (year < 1900) return 'Pre-1900';
  return `${Math.floor(year / 10) * 10}s`;
}

function getAllMediaEras() {
  const eras = new Set(D.media.map(getMediaEraLabel).filter(label => label && label !== 'Unknown'));
  return ['Pre-1900', ...Array.from({ length: 13 }, (_, i) => `${1900 + i * 10}s`)].filter((era, index, arr) => arr.indexOf(era) === index && (eras.has(era) || era === 'Pre-1900'));
}

function getMediaTypeLabel(type) {
  const map = { photo: 'Photos', video: 'Videos', document: 'Documents' };
  return map[type] || 'Media';
}

function getMediaIconSvg(type) {
  const iconStroke = 'rgba(255,255,255,0.88)';
  if (type === 'video') {
    return `<svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><rect x="10" y="16" width="32" height="32" rx="3" stroke="${iconStroke}" stroke-width="2.5"/><path d="M28 26l12 6-12 6V26z" fill="${iconStroke}"/><path d="M42 26l12-7v26l-12-7" stroke="${iconStroke}" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
  }
  if (type === 'document') {
    return `<svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M18 10h20l10 10v34H18V10z" stroke="${iconStroke}" stroke-width="2.5" stroke-linejoin="round"/><path d="M38 10v12h12" stroke="${iconStroke}" stroke-width="2.5" stroke-linejoin="round"/><path d="M24 34h18M24 42h14" stroke="${iconStroke}" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  }
  return `<svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><rect x="10" y="14" width="44" height="36" rx="3" stroke="${iconStroke}" stroke-width="2.5"/><circle cx="24" cy="26" r="4" fill="${iconStroke}"/><path d="M16 42l10-10 8 8 6-6 8 8" stroke="${iconStroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function renderMediaPlaceholder(media, size = 'card') {
  const cls = size === 'hero' ? 'media-hero-placeholder' : size === 'thumb' ? 'person-media-thumb' : size === 'page-card' ? 'person-page-media-card' : 'media-placeholder';
  return `
    <div class="${cls}" style="background:${media.storage?.color || '#6a5a46'};">
      <div class="media-icon-wrap">${getMediaIconSvg(media.type)}</div>
      ${size === 'card' || size === 'page-card' ? `
        <div class="media-overlay">
          <div class="media-overlay-title">${escapeHtml(media.title)}</div>
          <div class="media-overlay-meta">${escapeHtml(getMediaDateDisplay(media))}${media.date?.certainty === 'estimated' ? '<span class="media-meta-badge">Estimated</span>' : ''}</div>
        </div>
      ` : ''}
    </div>
  `;
}

function getMissingFields(person) {
  const missing = [];
  if (!person.bio) missing.push('bio');
  if (!person.sources || !person.sources.length) missing.push('sources');
  if (!person.birth || !person.birth.date) missing.push('birth date');
  if (!person.relationships || !person.relationships.parents || !person.relationships.parents.length) missing.push('parents');
  return missing;
}

function getPersonDatesLabel(person) {
  const birthYear = getDateYear(person.birth?.date) || '?';
  const deathYear = person.death ? getDateYear(person.death?.date) || '?' : (person.is_living ? 'living' : '');
  return person.is_living ? `b. ${birthYear}` : `${birthYear}${deathYear ? ' - ' + deathYear : ''}`;
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
