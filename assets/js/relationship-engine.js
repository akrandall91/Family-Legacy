// Backward-compatible genealogy relationship engine.
// Raw records remain untouched; every helper returns normalized copies.
const PARENT_TYPES = new Set(['biological','adoptive','step','foster','guardian','social-parent','unknown']);
const PARTNER_TYPES = new Set(['marriage','partnership','former-marriage','former-partnership','co-parent','unknown']);
const EVIDENCE_STATUSES = new Set(['confirmed','probable','possible','oral-history','disputed','unknown']);
const LINEAGE_PARENT_TYPES = new Set(['biological','adoptive']);
let familyIndexes = {};

function normalizeParentRelationship(value, defaults = {}) {
  const input = typeof value === 'string' ? { person_id: value } : (value || {});
  const type = input.relationship_type || defaults.relationship_type || 'biological';
  return { person_id: input.person_id || input.id || '', relationship_type: type, status: input.status || defaults.status || 'confirmed', confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 1, source_ids: [...(input.source_ids || [])], notes: input.notes || '', privacy: input.privacy || 'family', public: input.public !== false, establishes_branch_descent: type === 'step' ? false : input.establishes_branch_descent !== false, show_in_tree: input.show_in_tree !== false, under_research: !!input.under_research };
}
function normalizeParentRelationships(person) { return (person?.relationships?.parents || []).map(normalizeParentRelationship).filter(r => r.person_id); }
function normalizeChildRelationship(value, defaults = {}) { const r=normalizeParentRelationship(value, defaults); const input=typeof value==='object'&&value?value:{}; return {...r,union_id:input.union_id || null,connection_kind:input.connection_kind || 'genealogical'}; }
function normalizeChildRelationships(person) { return (person?.relationships?.children || []).map(normalizeChildRelationship).filter(r => r.person_id); }
function normalizeSpouseRelationship(value) {
  const input = typeof value === 'string' ? { person_id: value } : (value || {});
  return { person_id: input.person_id || '', relationship_id: input.relationship_id || null, relationship_type: input.relationship_type || 'marriage', status: input.status || 'confirmed', current: input.current ?? !input.end_date, start_date: input.start_date || null, end_date: input.end_date || null, union_id: input.union_id || null, source_ids: [...(input.source_ids || [])], notes: input.notes || '', privacy: input.privacy || 'family', public: input.public !== false };
}
function normalizeBranchRelationship(value) {
  const input = typeof value === 'string' ? { branch_id: value } : (value || {});
  return { branch_id: input.branch_id || '', connection_type: input.connection_type || 'descent', through_person_id: input.through_person_id || null, primary: !!input.primary, status: input.status || 'confirmed', source_ids: [...(input.source_ids || [])] };
}
function relationshipPersonId(value) { return typeof value === 'string' ? value : value?.person_id; }
function getParentRelationships(personOrId, options = {}) {
  const person = typeof personOrId === 'string' ? getPerson(personOrId) : personOrId;
  return normalizeParentRelationships(person).filter(r => (options.includePrivate || r.public) && (!options.types || options.types.includes(r.relationship_type)) && (!options.statuses || options.statuses.includes(r.status)));
}
function getParentIds(personOrId, options = {}) { return getParentRelationships(personOrId, options).map(r => r.person_id); }
function getBiologicalParentIds(personOrId) { return getParentIds(personOrId, { types: ['biological'] }); }
function getAdoptiveParentIds(personOrId) { return getParentIds(personOrId, { types: ['adoptive'] }); }
function getLineageParentIds(personOrId) { return getParentIds(personOrId, { types: [...LINEAGE_PARENT_TYPES] }); }

function rebuildFamilyIndexes() {
  const maps = { peopleById:new Map(), parentsByChildId:new Map(), childrenByParentId:new Map(), unionsByPersonId:new Map(), unionsByChildId:new Map(), branchesById:new Map(), branchConnectionsById:new Map(), branchMembershipsByPersonId:new Map(), peopleByBranchId:new Map(), storiesByBranchId:new Map(), eventsByBranchId:new Map(), mediaByBranchId:new Map() };
  (D.persons || []).forEach(p => { maps.peopleById.set(p.id,p); const parents=normalizeParentRelationships(p); maps.parentsByChildId.set(p.id,parents); parents.forEach(r => { if(!maps.childrenByParentId.has(r.person_id)) maps.childrenByParentId.set(r.person_id,[]); maps.childrenByParentId.get(r.person_id).push({...r,person_id:p.id}); }); const memberships=(p.branch_memberships || (p.branch_ids || []).map((branch_id,i)=>({branch_id,connection_type:'descent',primary:(p.primary_branch_id || p.branch_ids?.[0])===branch_id,status:'confirmed',source_ids:[]}))).map(normalizeBranchRelationship); maps.branchMembershipsByPersonId.set(p.id,memberships); memberships.forEach(m=>{if(!maps.peopleByBranchId.has(m.branch_id)) maps.peopleByBranchId.set(m.branch_id,[]); maps.peopleByBranchId.get(m.branch_id).push(p);}); });
  (D.unions || []).forEach(u => { (u.partner_ids || []).forEach(id=>{if(!maps.unionsByPersonId.has(id)) maps.unionsByPersonId.set(id,[]);maps.unionsByPersonId.get(id).push(u);}); (u.child_ids || []).forEach(id=>{if(!maps.unionsByChildId.has(id)) maps.unionsByChildId.set(id,[]);maps.unionsByChildId.get(id).push(u);}); });
  (D.branches || []).forEach(b=>{maps.branchesById.set(b.id,b);maps.branchConnectionsById.set(b.id,b.connected_branches || []);});
  ['stories','events','media'].forEach(type=>(D[type] || []).forEach(record=>(record.branch_ids || []).forEach(id=>{const key=type+'ByBranchId';if(!maps[key].has(id))maps[key].set(id,[]);maps[key].get(id).push(record);})));
  familyIndexes=maps; return maps;
}
function ensureFamilyIndexes(){ if(!familyIndexes.peopleById || familyIndexes.peopleById.size !== (D.persons || []).length) rebuildFamilyIndexes(); return familyIndexes; }

function getSiblingRelationship(aValue,bValue){
  const a=typeof aValue==='string'?getPerson(aValue):aValue,b=typeof bValue==='string'?getPerson(bValue):bValue;
  if(!a||!b||a.id===b.id)return {type:'none',shared_parent_ids:[]};
  const aBio=new Set(getBiologicalParentIds(a)),bBio=new Set(getBiologicalParentIds(b));
  const aAdopt=new Set(getAdoptiveParentIds(a)),bAdopt=new Set(getAdoptiveParentIds(b));
  const sharedBio=[...aBio].filter(id=>bBio.has(id)),sharedAdopt=[...aAdopt].filter(id=>bAdopt.has(id));
  if(sharedAdopt.length) return {type:'adoptive',shared_parent_ids:sharedAdopt};
  if(sharedBio.length>=2 && aBio.size===bBio.size) return {type:'full',shared_parent_ids:sharedBio};
  if(sharedBio.length===1) return {type:'half',shared_parent_ids:sharedBio};
  const parentIds=[...new Set([...aBio,...aAdopt,...bBio,...bAdopt])];
  const unions=(D.unions || []).some(u=>(u.partner_ids || []).some(id=>[...aBio,...aAdopt].includes(id))&&(u.partner_ids || []).some(id=>[...bBio,...bAdopt].includes(id)));
  const households=(D.households || []).some(h=>(h.child_ids || []).includes(a.id)&&(h.child_ids || []).includes(b.id));
  return unions||households ? {type:'step',shared_parent_ids:[],through_ids:parentIds} : {type:'none',shared_parent_ids:[]};
}
function getSiblingsByType(personId,type){ return (D.persons || []).filter(p=>p.id!==personId && getSiblingRelationship(personId,p.id).type===type); }
function getFullSiblings(id){return getSiblingsByType(id,'full');} function getHalfSiblings(id){return getSiblingsByType(id,'half');}
function getStepSiblings(id){return getSiblingsByType(id,'step');} function getAdoptiveSiblings(id){return getSiblingsByType(id,'adoptive');}
function getHomeBranchId(){ return D.meta?.home_branch_id || D.meta?.root_branch_id || D.branches?.[0]?.id || null; }
function getRootBranchIds(){ return D.meta?.root_branch_ids?.length ? [...D.meta.root_branch_ids] : [D.meta?.root_branch_id || getHomeBranchId()].filter(Boolean); }
function getPrimaryBranchId(person){ return person?.primary_branch_id || person?.branch_memberships?.find(m=>m.primary)?.branch_id || person?.branch_ids?.[0] || getHomeBranchId(); }

function getChildRelationships(personOrId, options={}) { const person=typeof personOrId==='string'?getPerson(personOrId):personOrId; return (ensureFamilyIndexes().childrenByParentId.get(person?.id) || []).filter(r=>(options.includePrivate || r.public) && (!options.types || options.types.includes(r.relationship_type))); }
function getUnionsForPerson(id){ return ensureFamilyIndexes().unionsByPersonId.get(id) || []; }
function getHouseholdsForPerson(id){ return (D.households || []).filter(h=>[...(h.adult_ids||[]),...(h.child_ids||[]),...(h.member_ids||[])].includes(id)); }
function isPublicRecord(record){ return !record || !['private','admin'].includes(record.privacy); }
function getBranchMemberships(person){ return ensureFamilyIndexes().branchMembershipsByPersonId.get(person.id) || []; }
function getBranchPeopleByConnection(branchId, allowed=['descent']) { return (D.persons || []).filter(p=>getBranchMemberships(p).some(m=>m.branch_id===branchId && allowed.includes(m.connection_type) && isPublicRecord(m))); }
function getDirectDescendantIds(branchId){ return new Set(getBranchPeopleByConnection(branchId,['descent','adoption']).map(p=>p.id)); }
function wouldCreateParentCycle(parentId, childId){ const seen=new Set(); const visit=id=>{if(id===parentId)return true;if(seen.has(id))return false;seen.add(id);return getChildRelationships(id,{includePrivate:true}).some(r=>visit(r.person_id));}; return visit(childId); }
function validateRelationshipChange(ownerId, relationship, role='parent') { const issues=[]; if(!relationship.person_id)issues.push('Select a person.'); if(ownerId===relationship.person_id)issues.push(`A person cannot be their own ${role}.`); if(!PARENT_TYPES.has(relationship.relationship_type))issues.push('Choose a valid relationship type.'); if(!EVIDENCE_STATUSES.has(relationship.status))issues.push('Choose a valid evidence status.'); if(relationship.relationship_type==='step'&&relationship.establishes_branch_descent)issues.push('A step-parent relationship cannot establish biological descent.'); (relationship.source_ids||[]).forEach(id=>{if(!(D.sources||[]).some(s=>s.id===id))issues.push(`Source ${id} does not exist.`);}); if(role==='parent'&&relationship.person_id&&wouldCreateParentCycle(relationship.person_id,ownerId))issues.push('This change would create a parent-child cycle.'); return issues; }
