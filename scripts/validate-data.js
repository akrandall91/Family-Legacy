#!/usr/bin/env node
// validate-data.js
//
// Lightweight, dependency-free validator for data/family-legacy-data.js.
// Run it locally before committing data changes:
//
//   node scripts/validate-data.js
//
// Exit code 0  -> no errors (warnings may still be printed)
// Exit code 1  -> at least one error was found
//
// This script never modifies data/family-legacy-data.js. It only reads it
// and reports problems. It does not talk to the network or Google Sheets.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DATA_PATH = path.join(__dirname, '..', 'data', 'family-legacy-data.js');

function loadFamilyData() {
  const source = fs.readFileSync(DATA_PATH, 'utf8');
  // family-legacy-data.js is a plain browser <script> file that declares
  // `const FamilyData = {...}` with no module.exports. Run it in an
  // isolated VM sandbox and pull the resulting value back out, rather
  // than modifying the source file just to make it Node-loadable.
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(source + '\nthis.__FamilyData = FamilyData;', sandbox, { filename: DATA_PATH });
  if (!sandbox.__FamilyData) {
    throw new Error('Could not find `const FamilyData = {...}` in ' + DATA_PATH);
  }
  return sandbox.__FamilyData;
}

const errors = [];
const warnings = [];

function err(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

const VALID_PRIVACY = new Set(['public', 'family', 'private', 'admin']);
const VALID_PARENT_TYPES = new Set(['biological','adoptive','step','foster','guardian','social-parent','unknown']);
const VALID_PARTNER_TYPES = new Set(['marriage','partnership','former-marriage','former-partnership','co-parent','unknown']);
const VALID_STATUSES = new Set(['confirmed','probable','possible','oral-history','disputed','unknown']);
const VALID_BRANCH_CONNECTIONS = new Set(['descends-from','maternal-origin','paternal-origin','married-into','adoptive-origin','stepfamily-connection','household-connection','merged-with','possible-connection','unknown-connection']);
const relId = value => typeof value === 'string' ? value : value && value.person_id;
const REQUIRED_PERSON_FIELDS = ['id', 'name', 'gender', 'is_living', 'relationships', 'branch_ids', 'privacy'];
const REQUIRED_EVENT_FIELDS = ['id', 'type', 'title', 'date', 'people', 'branch_ids', 'privacy'];
const REQUIRED_STORY_FIELDS = ['id', 'title', 'body', 'people_ids', 'status', 'privacy'];
const REQUIRED_MEDIA_FIELDS = ['id', 'type', 'title', 'storage', 'privacy'];

function validate(D) {
  const persons = D.persons || [];
  const branches = D.branches || [];
  const events = D.events || [];
  const stories = D.stories || [];
  const media = D.media || [];
  const locations = D.locations || {};
  const sources = D.sources || [];
  const unions = D.unions || [];

  const personIds = new Set();
  const branchIds = new Set(branches.map(b => b.id));
  const eventIds = new Set(events.map(e => e.id));
  const mediaIds = new Set(media.map(m => m.id));
  const locationIds = new Set(Object.keys(locations));

  // ---- Duplicate IDs (persons, branches, events, stories, media) ----
  function checkDuplicateIds(list, label) {
    const seen = new Set();
    for (const item of list) {
      if (!item || !item.id) continue;
      if (seen.has(item.id)) err(`Duplicate ${label} id: "${item.id}"`);
      seen.add(item.id);
    }
  }
  checkDuplicateIds(persons, 'person');
  checkDuplicateIds(branches, 'branch');
  checkDuplicateIds(events, 'event');
  checkDuplicateIds(stories, 'story');
  checkDuplicateIds(media, 'media');

  for (const p of persons) if (p && p.id) personIds.add(p.id);

  // ---- Persons: required fields, privacy, branch refs, relationships ----
  const parentOf = new Map(); // personId -> Set of children who list it as parent
  const spouseOf = new Map(); // personId -> Set of spouse ids who list it back

  for (const p of persons) {
    const who = p.id || '(missing id)';

    for (const field of REQUIRED_PERSON_FIELDS) {
      if (p[field] === undefined) err(`Person "${who}" is missing required field "${field}"`);
    }

    if (p.privacy && !VALID_PRIVACY.has(p.privacy)) {
      err(`Person "${who}" has invalid privacy value "${p.privacy}" (expected one of ${[...VALID_PRIVACY].join(', ')})`);
    }

    for (const bid of p.branch_ids || []) {
      if (!branchIds.has(bid)) err(`Person "${who}" references missing branch "${bid}"`);
    }

    const rel = p.relationships || {};

    for (const parentRef of rel.parents || []) {
      const parentId = relId(parentRef);
      if (typeof parentRef === 'object' && (!VALID_PARENT_TYPES.has(parentRef.relationship_type) || !VALID_STATUSES.has(parentRef.status))) err(`Person "${who}" has an invalid parent relationship type or status`);
      if (parentId === who) err(`Person "${who}" cannot be their own parent`);
      if (!personIds.has(parentId)) {
        err(`Person "${who}" has broken parent reference "${parentId}"`);
      } else {
        if (!parentOf.has(parentId)) parentOf.set(parentId, new Set());
        parentOf.get(parentId).add(who);
      }
    }

    for (const childRef of rel.children || []) {
      const childId = relId(childRef);
      if (childId === who) err(`Person "${who}" cannot be their own child`);
      if (!personIds.has(childId)) err(`Person "${who}" has broken child reference "${childId}"`);
    }

    for (const spouse of rel.spouses || []) {
      const spouseId = spouse && spouse.person_id;
      if (spouseId === who) err(`Person "${who}" cannot be partnered with themselves`);
      if (spouse.relationship_type && !VALID_PARTNER_TYPES.has(spouse.relationship_type)) err(`Person "${who}" has invalid partnership type "${spouse.relationship_type}"`);
      if (spouse.status && !VALID_STATUSES.has(spouse.status)) err(`Person "${who}" has invalid partnership status "${spouse.status}"`);
      if (!spouseId || !personIds.has(spouseId)) {
        err(`Person "${who}" has broken spouse reference "${spouseId}"`);
      } else {
        if (!spouseOf.has(who)) spouseOf.set(who, new Set());
        spouseOf.get(who).add(spouseId);
      }
    }

    // ---- Sensitive data on living people ----
    if (p.is_living) {
      if (p.birth && p.birth.date && p.birth.certainty === 'exact') {
        warn(`Living person "${who}" has an exact birth date recorded. This file is public — consider certainty "estimated"/"unknown" or removing the date until real auth exists.`);
      }
      for (const field of ['address', 'phone', 'email', 'ssn', 'medical', 'financial']) {
        if (p[field]) err(`Living person "${who}" has a "${field}" field set. Remove sensitive data about living people from this public file.`);
      }
    }
  }

  // ---- Missing reciprocal relationships ----
  for (const p of persons) {
    const who = p.id;
    const rel = p.relationships || {};
    for (const childRef of rel.children || []) {
      const childId = relId(childRef);
      const child = persons.find(x => x.id === childId);
      if (child && !(child.relationships.parents || []).some(parent => relId(parent) === who)) {
        err(`Missing reciprocal link: "${who}" lists "${childId}" as a child, but "${childId}" does not list "${who}" as a parent`);
      }
    }
    for (const spouse of rel.spouses || []) {
      const spouseId = spouse && spouse.person_id;
      const spousePerson = persons.find(x => x.id === spouseId);
      if (spousePerson) {
        const backRef = (spousePerson.relationships.spouses || []).some(s => s.person_id === who);
        if (!backRef) err(`Missing reciprocal link: "${who}" lists "${spouseId}" as a spouse, but not the reverse`);
      }
    }
  }

  // ---- Branches: root person + parent branch refs ----
  for (const b of branches) {
    const who = b.id || '(missing id)';
    if (b.root_person_id && !personIds.has(b.root_person_id)) {
      err(`Branch "${who}" has a root_person_id "${b.root_person_id}" that does not exist`);
    }
    if (b.parent_branch_id && !branchIds.has(b.parent_branch_id)) {
      err(`Branch "${who}" has a parent_branch_id "${b.parent_branch_id}" that does not exist`);
    }
    for (const cid of b.child_branch_ids || []) {
      if (!branchIds.has(cid)) err(`Branch "${who}" references missing child branch "${cid}"`);
    }
    for (const connection of b.connected_branches || []) {
      if (!branchIds.has(connection.branch_id)) err(`Branch "${who}" connects to missing branch "${connection.branch_id}"`);
      if (!VALID_BRANCH_CONNECTIONS.has(connection.relationship)) err(`Branch "${who}" has invalid connection type "${connection.relationship}"`);
    }
  }

  for (const rootId of D.meta.root_branch_ids || [D.meta.root_branch_id].filter(Boolean)) if (!branchIds.has(rootId)) err(`Meta references missing root branch "${rootId}"`);
  if (D.meta.home_branch_id && !branchIds.has(D.meta.home_branch_id)) err(`Meta references missing home branch "${D.meta.home_branch_id}"`);
  checkDuplicateIds(unions, 'union');
  for (const union of unions) {
    if (!VALID_PARTNER_TYPES.has(union.relationship_type || 'unknown')) err(`Union "${union.id}" has invalid type`);
    if ((union.partner_ids || []).some(id => !personIds.has(id))) err(`Union "${union.id}" references a missing partner`);
    if (new Set(union.partner_ids || []).size !== (union.partner_ids || []).length) err(`Union "${union.id}" repeats a partner`);
    for (const childId of union.child_ids || []) { if (!personIds.has(childId)) err(`Union "${union.id}" references missing child "${childId}"`); const child=persons.find(p=>p.id===childId); if (child && !(child.relationships.parents || []).some(r=>(union.partner_ids || []).includes(relId(r)))) err(`Union "${union.id}" child "${childId}" is not connected to either partner`); }
    if (union.start_date && union.end_date && union.start_date > union.end_date) err(`Union "${union.id}" ends before it starts`);
  }

  // ---- Events ----
  for (const e of events) {
    const who = e.id || '(missing id)';
    for (const field of REQUIRED_EVENT_FIELDS) {
      if (e[field] === undefined) err(`Event "${who}" is missing required field "${field}"`);
    }
    if (e.privacy && !VALID_PRIVACY.has(e.privacy)) err(`Event "${who}" has invalid privacy value "${e.privacy}"`);
    for (const person of e.people || []) {
      if (!personIds.has(person.person_id)) err(`Event "${who}" references missing person "${person.person_id}"`);
    }
    for (const bid of e.branch_ids || []) {
      if (!branchIds.has(bid)) err(`Event "${who}" references missing branch "${bid}"`);
    }
    for (const mid of e.media_ids || []) {
      if (!mediaIds.has(mid)) err(`Event "${who}" references missing media "${mid}"`);
    }
    if (e.location_id && !locationIds.has(e.location_id)) {
      err(`Event "${who}" references missing location "${e.location_id}"`);
    }
  }

  // ---- Stories ----
  for (const s of stories) {
    const who = s.id || '(missing id)';
    for (const field of REQUIRED_STORY_FIELDS) {
      if (s[field] === undefined) err(`Story "${who}" is missing required field "${field}"`);
    }
    if (s.privacy && !VALID_PRIVACY.has(s.privacy)) err(`Story "${who}" has invalid privacy value "${s.privacy}"`);
    for (const pid of s.people_ids || []) {
      if (!personIds.has(pid)) err(`Story "${who}" references missing person "${pid}"`);
    }
    for (const eid of s.event_ids || []) {
      if (!eventIds.has(eid)) err(`Story "${who}" references missing event "${eid}"`);
    }
    if (s.media_id && !mediaIds.has(s.media_id)) err(`Story "${who}" references missing media "${s.media_id}"`);
  }

  // ---- Media ----
  for (const m of media) {
    const who = m.id || '(missing id)';
    for (const field of REQUIRED_MEDIA_FIELDS) {
      if (m[field] === undefined) err(`Media "${who}" is missing required field "${field}"`);
    }
    if (m.privacy && !VALID_PRIVACY.has(m.privacy)) err(`Media "${who}" has invalid privacy value "${m.privacy}"`);
    for (const pid of m.people_ids || []) {
      if (!personIds.has(pid)) err(`Media "${who}" references missing person "${pid}"`);
    }
    for (const eid of m.event_ids || []) {
      if (!eventIds.has(eid)) err(`Media "${who}" references missing event "${eid}"`);
    }
    for (const bid of m.branch_ids || []) {
      if (!branchIds.has(bid)) err(`Media "${who}" references missing branch "${bid}"`);
    }
    if (m.location_id && !locationIds.has(m.location_id)) {
      err(`Media "${who}" references missing location "${m.location_id}"`);
    }
  }

  // ---- Sources: light shape check only (not yet rendered by the front end) ----
  for (const s of sources) {
    if (!s.id) err('A source record is missing an "id" field');
    if (!s.title) warn(`Source "${s.id || '(missing id)'}" is missing a "title"`);
  }

  return { errorCount: errors.length, warningCount: warnings.length };
}

function main() {
  let D;
  try {
    D = loadFamilyData();
  } catch (e) {
    console.error('Failed to load family-legacy-data.js:', e.message);
    process.exit(1);
  }

  validate(D);

  const counts = {
    branches: (D.branches || []).length,
    persons: (D.persons || []).length,
    events: (D.events || []).length,
    stories: (D.stories || []).length,
    media: (D.media || []).length,
    locations: Object.keys(D.locations || {}).length,
    sources: (D.sources || []).length
  };

  console.log('Family Legacy data validation');
  console.log('==============================');
  console.log(
    `Records: ${counts.persons} persons, ${counts.branches} branches, ${counts.events} events, ` +
    `${counts.stories} stories, ${counts.media} media, ${counts.locations} locations, ${counts.sources} sources`
  );
  console.log('');

  if (errors.length) {
    console.log(`ERRORS (${errors.length}):`);
    for (const e of errors) console.log('  - ' + e);
    console.log('');
  }

  if (warnings.length) {
    console.log(`WARNINGS (${warnings.length}):`);
    for (const w of warnings) console.log('  - ' + w);
    console.log('');
  }

  if (!errors.length && !warnings.length) {
    console.log('No issues found.');
  }

  process.exit(errors.length ? 1 : 0);
}

main();
