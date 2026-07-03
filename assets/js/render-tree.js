// render-tree.js
// D3-powered interactive family tree rendering.

// ============================================================
// FAMILY TREE — D3 HIERARCHICAL
// ============================================================
let treeFilterBranch = 'all';

function filterTree(branch, btn) {
  treeFilterBranch = branch;
  document.querySelectorAll('.tree-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  treeRendered = false;
  document.getElementById('tree-svg').innerHTML = '';
  renderTree();
  treeRendered = true;
}

function buildTreeData() {
  // Build a tree structure rooted at whoever D.meta.root_branch_id points to
  const rootBranch = getBranch(D.meta.root_branch_id);
  const rootId = rootBranch ? rootBranch.root_person_id : (D.persons[0] && D.persons[0].id);
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
    p.relationships.children.forEach(childId => {
      const child = buildNode(childId, depth + 1);
      if (child) node.children.push(child);
    });

    return node;
  }

  return buildNode(rootId, 0);
}

function renderTree() {
  const container = document.getElementById('tree-svg-container');
  const svg = d3.select('#tree-svg');
  svg.selectAll('*').remove();

  const W = container.clientWidth || 900;
  const H = container.clientHeight || 600;

  const CARD_W = 140, CARD_H = 64, H_GAP = 40, V_GAP = 100;

  // Build manual layout for family tree (generation-based)
  const generations = [];
  const allNodes = [];

  function collectGenerations(personId, gen, visited2 = new Set()) {
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

    p.relationships.children.forEach(childId => collectGenerations(childId, gen + 1, visited2));
  }

  const rootBranchForRender = getBranch(D.meta.root_branch_id);
  const treeRootId = rootBranchForRender ? rootBranchForRender.root_person_id : (D.persons[0] && D.persons[0].id);
  collectGenerations(treeRootId, 0);

  // Layout
  const totalH = generations.length * (CARD_H + V_GAP) + 80;
  const maxGenWidth = Math.max(...generations.map(g => g.length * (CARD_W + H_GAP)));
  const totalW = Math.max(W, maxGenWidth + 120);

  svg.attr('viewBox', `0 0 ${totalW} ${totalH}`);

  const nodeMap = {};
  allNodes.forEach(n => nodeMap[n.id] = n);

  generations.forEach((gen, gi) => {
    const genW = gen.length * (CARD_W + H_GAP);
    const startX = (totalW - genW) / 2;
    gen.forEach((node, i) => {
      node.x = startX + i * (CARD_W + H_GAP) + CARD_W / 2;
      node.y = 40 + gi * (CARD_H + V_GAP) + CARD_H / 2;
    });
  });

  // Draw edges (parent → child)
  const edgeGroup = svg.append('g').attr('class', 'edges');
  D.persons.forEach(p => {
    const parentNode = nodeMap[p.id];
    if (!parentNode) return;
    p.relationships.children.forEach(childId => {
      const childNode = nodeMap[childId];
      if (!childNode) return;
      const x1 = parentNode.x, y1 = parentNode.y + CARD_H/2;
      const x2 = childNode.x, y2 = childNode.y - CARD_H/2;
      edgeGroup.append('path')
        .attr('d', `M${x1},${y1} C${x1},${(y1+y2)/2} ${x2},${(y1+y2)/2} ${x2},${y2}`)
        .attr('fill', 'none')
        .attr('stroke', '#d6cabb')
        .attr('stroke-width', 1.5);
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
  const nodeGroup = svg.append('g').attr('class', 'nodes');
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

  // Pan + zoom
  let isDragging = false, startX, startY, viewX = 0, viewY = 0;

  const inner = svg.select('.nodes').node().parentNode;

  container.addEventListener('mousedown', e => {
    isDragging = true;
    startX = e.clientX - viewX;
    startY = e.clientY - viewY;
    container.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    viewX = e.clientX - startX;
    viewY = e.clientY - startY;
    svg.selectAll('g').attr('transform', function() {
      const base = this.getAttribute('data-base') || '';
      return base;
    });
    svg.attr('style', `transform: translate(${viewX}px, ${viewY}px)`);
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    container.style.cursor = 'grab';
  });

  // Center initially
  svg.attr('style', 'transform: translate(0,0)');
}
