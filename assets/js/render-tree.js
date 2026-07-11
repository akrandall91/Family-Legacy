// render-tree.js
// D3-powered interactive family tree rendering.

// ============================================================
// FAMILY TREE — D3 HIERARCHICAL
// ============================================================
let treeFilterBranch = 'all';
let treePanControlsInitialized = false;
let treeIsDragging = false;
let treeDragStartX = 0;
let treeDragStartY = 0;
let treeViewX = 0;
let treeViewY = 0;
let treeExplorationMode = 'home';
const treeRelationshipFilters = { step:true, household:false, uncertain:true };
function setTreeExploration(mode){treeExplorationMode=mode;treeRendered=false;renderTree();treeRendered=true;}
function resetTreeToHome(){treeFilterBranch=getHomeBranchId();setTreeExploration('home');}
function setTreeRelationshipFilter(type,enabled){treeRelationshipFilters[type]=enabled;treeRendered=false;renderTree();treeRendered=true;}
function explainTreeRelationship(text){const el=document.getElementById('tree-relationship-explanation');if(el)el.textContent=text;}

function filterTree(branch, btn) {
  treeFilterBranch = branch;
  document.querySelectorAll('.tree-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  treeRendered = false;
  document.getElementById('tree-svg').innerHTML = '';
  renderTree();
  treeRendered = true;
}

function findFamilyGroups(dataset) {
  const persons = (dataset.persons || []).filter(isPublicRecord);
  const personIds = new Set(persons.map(p => p.id));
  const adjacency = {};

  persons.forEach(person => {
    adjacency[person.id] = new Set();
  });

  function link(a, b) {
    if (!a || !b || !personIds.has(a) || !personIds.has(b)) return;
    adjacency[a].add(b);
    adjacency[b].add(a);
  }

  persons.forEach(person => {
    const rel = person.relationships || {};
    (rel.parents || []).forEach(parent => link(person.id, relationshipPersonId(parent)));
    (rel.children || []).forEach(child => link(person.id, relationshipPersonId(child)));
    (rel.spouses || []).forEach(spouse => link(person.id, spouse.person_id));
  });

  const visited = new Set();
  const rootBranch = getBranch(getHomeBranchId());
  const mainRootId = rootBranch ? rootBranch.root_person_id : (persons[0] && persons[0].id);
  const groups = [];

  persons.forEach(person => {
    if (visited.has(person.id)) return;

    const componentIds = new Set();
    const queue = [person.id];
    visited.add(person.id);

    while (queue.length) {
      const currentId = queue.shift();
      componentIds.add(currentId);
      (adjacency[currentId] || []).forEach(nextId => {
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push(nextId);
        }
      });
    }

    const componentPersons = persons.filter(p => componentIds.has(p.id));
    const topPeople = componentPersons.filter(p => !(((p.relationships || {}).parents || []).length));
    let rootCandidates = topPeople.length ? topPeople : [componentPersons[0]];

    if (mainRootId && componentIds.has(mainRootId)) {
      const mainRoot = getPerson(mainRootId);
      const seedIds = new Set([mainRootId]);
      ((mainRoot && mainRoot.relationships && mainRoot.relationships.spouses) || []).forEach(spouse => {
        if (componentIds.has(spouse.person_id)) seedIds.add(spouse.person_id);
      });

      const ancestorIds = new Set();

      function climbToTop(personId, depth = 0) {
        const personForClimb = getPerson(personId);
        if (!personForClimb || !componentIds.has(personId)) return;
        const parentIds = getParentIds(personForClimb).filter(parentId => componentIds.has(parentId));
        if (!parentIds.length) {
          if (depth > 0) ancestorIds.add(personId);
          return;
        }
        parentIds.forEach(parentId => climbToTop(parentId, depth + 1));
      }

      seedIds.forEach(seedId => climbToTop(seedId));
      const preferredIds = ancestorIds.size ? Array.from(ancestorIds) : [mainRootId];
      rootCandidates = preferredIds.map(id => getPerson(id)).filter(Boolean);
    }

    const rootPersonIds = [];
    const claimed = new Set();

    rootCandidates.forEach(rootPerson => {
      if (!rootPerson || claimed.has(rootPerson.id)) return;
      rootPersonIds.push(rootPerson.id);
      claimed.add(rootPerson.id);

      ((rootPerson.relationships || {}).spouses || []).forEach(spouseRef => {
        const spouse = getPerson(spouseRef.person_id);
        const spouseIsTop = spouse && rootCandidates.some(candidate => candidate.id === spouse.id);
        if (spouse && componentIds.has(spouse.id) && spouseIsTop) claimed.add(spouse.id);
      });
    });

    groups.push({
      rootPersonIds,
      personIds: componentIds,
      containsMainRoot: mainRootId ? componentIds.has(mainRootId) : false
    });
  });

  return groups.sort((a, b) => {
    if (a.containsMainRoot && !b.containsMainRoot) return -1;
    if (!a.containsMainRoot && b.containsMainRoot) return 1;
    return a.rootPersonIds.join('|').localeCompare(b.rootPersonIds.join('|'));
  });
}

function getFamilyGroupLabel(group, index) {
  if (index === 0) return (D.meta && D.meta.family_name) || 'Family Tree';
  const rootNames = group.rootPersonIds
    .map(id => getPerson(id))
    .filter(Boolean)
    .map(person => person.name.display || `${person.name.first} ${person.name.last}`.trim());
  if (!rootNames.length) return 'Family Group';
  if (rootNames.length === 1) return `${rootNames[0]}' Family`;
  return `${rootNames.join(' & ')} Family`;
}

function buildTreeData() {
  const groups = findFamilyGroups(D);
  const rootId = groups[0] && groups[0].rootPersonIds[0];
  const visited = new Set();

  function buildNode(personId, depth) {
    if (visited.has(personId) || depth > 8) return null;
    visited.add(personId);
    const p = getPerson(personId);
    if (!p) return null;

    // Branch filter
    if (treeFilterBranch !== 'all' && !p.branch_ids.includes(treeFilterBranch)) return null;

    const node = { id: p.id, data: p, children: [] };

    // Add spouse
    p.relationships.spouses.forEach(sp => {
      if (!visited.has(sp.person_id)) {
        const spouse = getPerson(sp.person_id);
        if (spouse && (treeFilterBranch === 'all' || spouse.branch_ids.includes(treeFilterBranch))) {
          visited.add(sp.person_id);
          node.spouse = { id: spouse.id, data: spouse };
        }
      }
    });

    // Add children
    (ensureFamilyIndexes().childrenByParentId.get(p.id) || []).forEach(childRef => {
      const child = buildNode(childRef.person_id, depth + 1);
      if (child) node.children.push(child);
    });

    return node;
  }

  return buildNode(rootId, 0);
}

function applyTreePanTransform() {
  d3.select('#tree-svg').attr('style', `transform: translate(${treeViewX}px, ${treeViewY}px)`);
}

function initTreePanControls() {
  if (treePanControlsInitialized) return;

  const container = document.getElementById('tree-svg-container');
  if (!container) return;

  container.addEventListener('mousedown', e => {
    treeIsDragging = true;
    treeDragStartX = e.clientX - treeViewX;
    treeDragStartY = e.clientY - treeViewY;
    container.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', e => {
    if (!treeIsDragging) return;
    treeViewX = e.clientX - treeDragStartX;
    treeViewY = e.clientY - treeDragStartY;
    applyTreePanTransform();
  });

  window.addEventListener('mouseup', () => {
    treeIsDragging = false;
    container.style.cursor = 'grab';
  });

  treePanControlsInitialized = true;
}

function renderTree() {
  const container = document.getElementById('tree-svg-container');
  const svg = d3.select('#tree-svg');
  svg.selectAll('*').remove();
  initTreePanControls();

  const W = container.clientWidth || 900;
  const H = container.clientHeight || 600;

  const CARD_W = 140, CARD_H = 64, H_GAP = 40, V_GAP = 100;
  const GROUP_LABEL_H = 34, GROUP_GAP = 86;

  function collectGenerations(personId, gen, generations, allNodes, visited2 = new Set()) {
    if (visited2.has(personId)) return;
    visited2.add(personId);
    const p = getPerson(personId);
    if (!p) return;
    if (treeFilterBranch !== 'all' && !p.branch_ids.includes(treeFilterBranch)) return;

    if (!generations[gen]) generations[gen] = [];

    // Add person node
    const node = { id: p.id, person: p, gen, x: 0, y: 0 };
    generations[gen].push(node);
    allNodes.push(node);

    // Add spouse at same gen
    p.relationships.spouses.forEach(sp => {
      if (!visited2.has(sp.person_id)) {
        visited2.add(sp.person_id);
        const spouse = getPerson(sp.person_id);
        if (spouse && (treeFilterBranch === 'all' || spouse.branch_ids.includes(treeFilterBranch))) {
          const spNode = { id: spouse.id, person: spouse, gen, x: 0, y: 0, isSpouse: true, spouseOf: p.id };
          generations[gen].push(spNode);
          allNodes.push(spNode);
        }
      }
    });

    (ensureFamilyIndexes().childrenByParentId.get(p.id) || []).forEach(child => collectGenerations(child.person_id, gen + 1, generations, allNodes, visited2));
  }

  const groups = findFamilyGroups(D);
  const allSections = [];
  let totalH = 40;
  let widestSection = W;

  groups.forEach((group, index) => {
    const generations = [];
    const allNodes = [];
    const visited = new Set();

    group.rootPersonIds.forEach(rootId => collectGenerations(rootId, 0, generations, allNodes, visited));
    if (!allNodes.length) return;

    const populatedGenerations = generations.filter(Boolean);
    const maxGenWidth = Math.max(...populatedGenerations.map(g => g.length * (CARD_W + H_GAP)));
    const sectionH = populatedGenerations.length * (CARD_H + V_GAP) + GROUP_LABEL_H;
    allSections.push({ group, index, generations, allNodes, yOffset: totalH, sectionH });
    widestSection = Math.max(widestSection, maxGenWidth + 120);
    totalH += sectionH + GROUP_GAP;
  });

  const totalW = Math.max(W, widestSection);
  svg.attr('viewBox', `0 0 ${totalW} ${Math.max(H, totalH)}`);

  const edgeGroup = svg.append('g').attr('class', 'edges');
  const nodeGroup = svg.append('g').attr('class', 'nodes');
  const nodeMap = {};

  allSections.forEach(section => {
    svg.append('text')
      .attr('x', 60)
      .attr('y', section.yOffset)
      .attr('font-family', 'DM Mono, monospace')
      .attr('font-size', 10)
      .attr('font-weight', '600')
      .attr('fill', '#8a7a68')
      .attr('letter-spacing', '0.12em')
      .text(getFamilyGroupLabel(section.group, section.index).toUpperCase());

    section.generations.forEach((gen, gi) => {
      if (!gen) return;
      const genW = gen.length * (CARD_W + H_GAP);
      const startX = (totalW - genW) / 2;
      gen.forEach((node, i) => {
        node.x = startX + i * (CARD_W + H_GAP) + CARD_W / 2;
        node.y = section.yOffset + GROUP_LABEL_H + gi * (CARD_H + V_GAP) + CARD_H / 2;
      });
    });

    section.allNodes.forEach(n => nodeMap[n.id] = n);
  });

  // Draw edges (parent -> child)
  D.persons.forEach(p => {
    const parentNode = nodeMap[p.id];
    if (!parentNode) return;
    (ensureFamilyIndexes().childrenByParentId.get(p.id) || []).forEach(relationship => {
      if (!treeRelationshipFilters.step && ['step','guardian','foster','social-parent'].includes(relationship.relationship_type)) return;
      if (!treeRelationshipFilters.uncertain && relationship.status !== 'confirmed') return;
      const childNode = nodeMap[relationship.person_id];
      if (!childNode) return;
      const x1 = parentNode.x, y1 = parentNode.y + CARD_H/2;
      const x2 = childNode.x, y2 = childNode.y - CARD_H/2;
      const explanation = `${relationship.status} ${relationship.relationship_type} parent relationship: ${p.name.display} to ${childNode.person.name.display}`;
      edgeGroup.append('path')
        .attr('d', `M${x1},${y1} C${x1},${(y1+y2)/2} ${x2},${(y1+y2)/2} ${x2},${y2}`)
        .attr('fill', 'none')
        .attr('stroke', '#d6cabb')
        .attr('stroke-width', relationship.relationship_type === 'adoptive' ? 3 : 1.5)
        .attr('stroke-dasharray', ['step','guardian','foster','social-parent'].includes(relationship.relationship_type) ? '7,5' : (relationship.status === 'confirmed' ? null : '2,5'))
        .attr('aria-label', `${p.name.display} is ${relationship.status} ${relationship.relationship_type} parent of ${childNode.person.name.display}`)
        .attr('tabindex', 0).attr('role','button')
        .on('click',()=>explainTreeRelationship(explanation)).on('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();explainTreeRelationship(explanation);}})
        .append('title').text(`${relationship.relationship_type} parent relationship (${relationship.status})`);
    });

    // Spouse line
    p.relationships.spouses.forEach(sp => {
      const spNode = nodeMap[sp.person_id];
      if (!spNode || spNode.gen !== parentNode.gen) return;
      edgeGroup.append('line')
        .attr('x1', parentNode.x + CARD_W/2)
        .attr('y1', parentNode.y)
        .attr('x2', spNode.x - CARD_W/2)
        .attr('y2', spNode.y)
        .attr('stroke', '#d6cabb')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,3');
    });
  });

  // Draw person cards
  const allNodes = allSections.flatMap(section => section.allNodes);
  allNodes.forEach(node => {
    const p = node.person;
    const color = getPersonColor(p);
    const g = nodeGroup.append('g')
      .attr('class', 'person-node')
      .attr('data-person-id', p.id)
      .attr('transform', `translate(${node.x - CARD_W/2}, ${node.y - CARD_H/2})`)
      .attr('cursor', 'pointer')
      .on('click', () => openPersonProfile(p.id));

    // Card bg
    g.append('rect')
      .attr('class', 'person-card-bg')
      .attr('width', CARD_W).attr('height', CARD_H)
      .attr('rx', 2)
      .attr('fill', '#f7f3ec')
      .attr('stroke', '#d6cabb')
      .attr('stroke-width', 1);

    // Left color bar
    g.append('rect')
      .attr('width', 4).attr('height', CARD_H)
      .attr('rx', 2)
      .attr('fill', color);

    // Name
    const displayName = p.name.display || (p.name.first + ' ' + p.name.last);
    const nameParts = displayName.split(' ');
    g.append('text')
      .attr('x', 14).attr('y', 22)
      .attr('font-family', 'Cormorant Garamond, serif')
      .attr('font-size', nameParts[0].length > 8 ? 12 : 13)
      .attr('font-weight', '700')
      .attr('fill', '#3d2e1a')
      .text(nameParts[0]);

    g.append('text')
      .attr('x', 14).attr('y', 36)
      .attr('font-family', 'Cormorant Garamond, serif')
      .attr('font-size', 12)
      .attr('fill', '#3d2e1a')
      .text(nameParts.slice(1).join(' '));

    // Birth year / death year
    const byear = p.birth ? p.birth.date.substr(0,4) : '?';
    const dyear = p.death ? p.death.date.substr(0,4) : (p.is_living ? 'living' : '?');
    g.append('text')
      .attr('x', 14).attr('y', 52)
      .attr('font-family', 'DM Mono, monospace')
      .attr('font-size', 8)
      .attr('fill', '#8a7a68')
      .attr('letter-spacing', '0.05em')
      .text(`${byear} – ${dyear}`);

    // Living dot
    if (p.is_living) {
      g.append('circle')
        .attr('cx', CARD_W - 12).attr('cy', 12)
        .attr('r', 4)
        .attr('fill', '#4a8c48');
    }
  });

  applyTreePanTransform();
}
