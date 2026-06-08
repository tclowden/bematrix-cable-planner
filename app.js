const form = document.getElementById('planner-form');
const summaryEl = document.getElementById('summary');
const boardViewsEl = document.getElementById('board-views');
const stringsEl = document.getElementById('strings');
const warningsEl = document.getElementById('warnings');
const statTemplate = document.getElementById('stat-template');
const exportPdfBtn = document.getElementById('export-pdf');
const printSubtitleEl = document.getElementById('print-subtitle');
const printDateEl = document.getElementById('print-date');
const printJobNameEl = document.getElementById('print-job-name');
const printClientNameEl = document.getElementById('print-client-name');
const printJobNotesEl = document.getElementById('print-job-notes');
const printPowerModeEl = document.getElementById('print-power-mode');
const installDateInput = document.getElementById('install-date');
const viewToggleEl = document.getElementById('view-toggle');

const palette = ['#2563eb','#7c3aed','#db2777','#ea580c','#0891b2','#16a34a','#b91c1c','#4f46e5','#0f766e','#a16207'];
let activeView = 'combined';

function getInputs() {
  return {
    width: Number(document.getElementById('width').value),
    height: Number(document.getElementById('height').value),
    powerMode: document.getElementById('power-mode').value,
  };
}

function columnTraversal(height, col) {
  const rows = [];
  if (col % 2 === 0) for (let row = height - 1; row >= 0; row -= 1) rows.push(row);
  else for (let row = 0; row < height; row += 1) rows.push(row);
  return rows;
}

function getSnakeOrderedPanels(width, height) {
  const ordered = [];
  for (let col = 0; col < width; col += 1) {
    for (const row of columnTraversal(height, col)) ordered.push({ col, row });
  }
  return ordered;
}

function buildStrings(width, height, limit, kind, preferWholeColumns = true) {
  const warnings = [];
  if (preferWholeColumns && height <= limit) {
    const colsPerString = Math.max(1, Math.floor(limit / height));
    const strings = [];
    if (width > 1 && width % colsPerString !== 0) {
      warnings.push(`Last ${kind} string may end shorter than a full column grouping because the width does not divide evenly.`);
    }
    for (let startCol = 0, id = 1; startCol < width; startCol += colsPerString, id += 1) {
      const endCol = Math.min(width - 1, startCol + colsPerString - 1);
      const panels = [];
      for (let col = startCol; col <= endCol; col += 1) {
        for (const row of columnTraversal(height, col)) panels.push({ col, row });
      }
      strings.push({ id, kind, limit, panels });
    }
    return { strings, warnings };
  }

  if (height > limit) warnings.push(`A ${height}-high column is taller than the ${limit}-panel ${kind} limit, so the ${kind} plan has to break within a column.`);
  else if (preferWholeColumns) warnings.push(`${kind[0].toUpperCase() + kind.slice(1)} grouping is following the snake path in chunks of ${limit} because whole-column grouping is not possible here.`);

  const orderedPanels = getSnakeOrderedPanels(width, height);
  const strings = [];
  for (let i = 0, id = 1; i < orderedPanels.length; i += limit, id += 1) {
    strings.push({ id, kind, limit, panels: orderedPanels.slice(i, i + limit) });
  }
  return { strings, warnings };
}

function mergePanelAssignments(width, height, dataStrings, powerStrings) {
  const map = new Map();
  getSnakeOrderedPanels(width, height).forEach((panel) => {
    map.set(`${panel.col}:${panel.row}`, {
      ...panel,
      dataStringId: null, powerStringId: null,
      dataOrderInString: null, powerOrderInString: null,
      isDataStart: false, isDataEnd: false,
      isPowerStart: false, isPowerEnd: false,
      dataNext: null, powerNext: null,
    });
  });
  dataStrings.forEach((string) => string.panels.forEach((panel, index) => {
    Object.assign(map.get(`${panel.col}:${panel.row}`), {
      dataStringId: string.id,
      dataOrderInString: index + 1,
      isDataStart: index === 0,
      isDataEnd: index === string.panels.length - 1,
      dataNext: string.panels[index + 1] ?? null,
    });
  }));
  powerStrings.forEach((string) => string.panels.forEach((panel, index) => {
    Object.assign(map.get(`${panel.col}:${panel.row}`), {
      powerStringId: string.id,
      powerOrderInString: index + 1,
      isPowerStart: index === 0,
      isPowerEnd: index === string.panels.length - 1,
      powerNext: string.panels[index + 1] ?? null,
    });
  }));
  return map;
}

function planLayout(width, height, powerMode) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('Height and width must both be whole numbers greater than 0.');
  const dataResult = buildStrings(width, height, 12, 'data', true);
  const powerResult = buildStrings(width, height, powerMode === 'limited' ? 15 : 12, 'power', powerMode !== 'limited');
  const dataStrings = dataResult.strings.map((string, i) => ({ ...string, port: string.id, color: palette[i % palette.length] }));
  const powerStrings = powerResult.strings.map((string, i) => ({ ...string, outlet: string.id, color: palette[(i + 4) % palette.length] }));
  const warnings = [...dataResult.warnings, ...powerResult.warnings];
  if (powerMode === 'limited' && powerStrings.length < dataStrings.length) warnings.unshift(`Limited power mode is active: data uses ${dataStrings.length} strings, power uses ${powerStrings.length} strings.`);
  return {
    width, height, powerMode,
    dataStrings, powerStrings,
    panelMap: mergePanelAssignments(width, height, dataStrings, powerStrings),
    warnings,
    totalPanels: width * height,
    dataCables: dataStrings.length,
    powerDrops: powerStrings.length,
    dataJumpers: width * height - dataStrings.length,
    powerJumpers: width * height - powerStrings.length,
    physicalWidthIn: width * 19.53,
    physicalHeightIn: height * 19.53,
    pixelWidth: width * 192,
    pixelHeight: height * 192,
  };
}

function renderWarnings(warnings) {
  warningsEl.innerHTML = '';
  warnings.forEach((warning) => {
    const div = document.createElement('div');
    div.className = 'warning';
    div.textContent = warning;
    warningsEl.appendChild(div);
  });
}

function renderSummary(plan) {
  summaryEl.innerHTML = '';
  const stats = [
    ['Total panels', plan.totalPanels, `${plan.width} wide × ${plan.height} high`],
    ['Physical size', `${plan.physicalWidthIn.toFixed(2)}" × ${plan.physicalHeightIn.toFixed(2)}"`, '19.53" per panel'],
    ['Pixel size', `${plan.pixelWidth} × ${plan.pixelHeight}`, '192 × 192 per panel'],
    ['Data strings', plan.dataStrings.length, '12 max panels per data string'],
    ['Power strings', plan.powerStrings.length, plan.powerMode === 'limited' ? '15 max panels per power string' : 'Power follows data strings'],
    ['Data home runs', plan.dataCables, 'One processor port per data string'],
    ['Power drops', plan.powerDrops, 'One dedicated 20A outlet per power string'],
    ['Data jumpers', plan.dataJumpers, 'Between panels inside each data string'],
    ['Power jumpers', plan.powerJumpers, 'Between panels inside each power string'],
  ];
  stats.forEach(([label, value, note]) => {
    const node = statTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.label').textContent = label;
    node.querySelector('.value').textContent = value;
    node.querySelector('.note').textContent = note;
    summaryEl.appendChild(node);
  });
}

function buildBoardPanelHtml(panel, view) {
  const title = view === 'power' ? `P${panel.powerStringId}` : `D${panel.dataStringId}`;
  const orderText = view === 'combined'
    ? `Data ${panel.dataOrderInString}${panel.isPowerStart ? ` · Power ${panel.powerOrderInString}` : ''}`
    : view === 'power'
      ? `Power ${panel.powerOrderInString}`
      : `Data ${panel.dataOrderInString}`;
  const arrowText = view === 'power'
    ? (panel.isPowerStart ? 'power start' : panel.powerNext ? 'power run' : 'end')
    : panel.isDataStart
      ? 'start'
      : panel.dataNext
        ? 'next'
        : 'end';
  return `
    <div class="panel-top">
      <strong>${title}</strong>
      <div class="badge-stack">
        ${view !== 'power' && panel.isDataStart ? `<span class="start-badge">Port ${panel.dataStringId}</span>` : ''}
        ${panel.isPowerStart ? `<span class="power-badge">20A ${panel.powerStringId}</span>` : ''}
      </div>
    </div>
    <div class="coords">Col ${panel.col + 1}, Row ${currentPlan.height - panel.row}</div>
    <div class="order">${orderText}</div>
    <div class="arrow">${arrowText}</div>`;
}

let currentPlan = null;

function createBoardView(plan, view) {
  const wrap = document.createElement('section');
  wrap.className = `board-view${view === activeView ? ' active' : ''} print-page ${view === 'data' ? 'print-page-break' : ''}`;
  wrap.dataset.view = view;
  wrap.innerHTML = `<h3 class="view-title">${view.charAt(0).toUpperCase() + view.slice(1)} view</h3><div class="board-shell"><div class="board-scale-wrap"><svg class="board-paths" aria-hidden="true"></svg><div class="board"></div></div></div>`;
  const board = wrap.querySelector('.board');
  board.style.gridTemplateColumns = `repeat(${plan.width}, minmax(104px, 1fr))`;
  for (let row = 0; row < plan.height; row += 1) {
    for (let col = 0; col < plan.width; col += 1) {
      const panel = plan.panelMap.get(`${col}:${row}`);
      const tile = document.createElement('article');
      const bg = view === 'power' ? plan.powerStrings[panel.powerStringId - 1]?.color : plan.dataStrings[panel.dataStringId - 1]?.color;
      tile.className = `panel${panel.isDataStart ? ' start-panel' : ''}${panel.isDataEnd ? ' end-panel' : ''}${panel.isPowerStart ? ' power-start-panel' : ''}`;
      if (view === 'power') tile.classList.add('power-mode-panel');
      tile.style.background = bg ?? '#334155';
      tile.dataset.key = `${col}:${row}`;
      tile.innerHTML = buildBoardPanelHtml(panel, view);
      board.appendChild(tile);
    }
  }
  drawPathsForView(plan, view, wrap.querySelector('.board-paths'), board);
  applyBoardPrintScale(wrap, board);
  return wrap;
}

function getCenter(el) {
  return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 };
}

function applyBoardPrintScale(wrap, board) {
  const widthBudget = 980;
  const heightBudget = 360;
  const scale = Math.min(1, widthBudget / Math.max(1, board.scrollWidth), heightBudget / Math.max(1, board.scrollHeight));
  wrap.style.setProperty('--print-board-scale', `${scale}`);
  wrap.style.setProperty('--print-board-height', `${Math.ceil(board.scrollHeight * scale)}px`);
}

function drawPathsForView(plan, view, svg, board) {
  svg.innerHTML = '';
  svg.setAttribute('width', board.scrollWidth);
  svg.setAttribute('height', board.scrollHeight);
  svg.setAttribute('viewBox', `0 0 ${board.scrollWidth} ${board.scrollHeight}`);
  svg.style.width = `${board.scrollWidth}px`;
  svg.style.height = `${board.scrollHeight}px`;
  const panelEls = new Map();
  board.querySelectorAll('.panel').forEach((el) => panelEls.set(el.dataset.key, el));

  const drawSet = (strings, kind) => {
    strings.forEach((string) => {
      string.panels.forEach((panel, index) => {
        const next = string.panels[index + 1];
        if (!next) return;
        const aEl = panelEls.get(`${panel.col}:${panel.row}`);
        const bEl = panelEls.get(`${next.col}:${next.row}`);
        if (!aEl || !bEl) return;
        const a = getCenter(aEl), b = getCenter(bEl), midX = (a.x + b.x) / 2;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`);
        path.setAttribute('class', kind === 'power' ? 'power-path-line' : 'path-line');
        path.setAttribute('stroke', string.color);
        svg.appendChild(path);
      });
    });
  };

  if (view === 'data' || view === 'combined') drawSet(plan.dataStrings, 'data');
  if (view === 'power') drawSet(plan.powerStrings, 'power');
}

function renderBoardViews(plan) {
  boardViewsEl.innerHTML = '';
  ['combined', 'data', 'power'].forEach((view) => boardViewsEl.appendChild(createBoardView(plan, view)));
  syncActiveView();
}

function renderStrings(plan) {
  stringsEl.innerHTML = '';
  const renderGroup = (title, note, strings, kind) => {
    const section = document.createElement('section');
    section.className = 'strings-group';
    section.innerHTML = `<h3>${title}</h3>${note ? `<p class="group-note">${note}</p>` : ''}`;
    strings.forEach((string) => {
      const first = string.panels[0], last = string.panels[string.panels.length - 1];
      const card = document.createElement('article');
      card.className = 'string-item card-lite';
      card.innerHTML = `
        <div class="string-title">
          <h3><span class="swatch" style="background:${string.color}"></span>${title.slice(0, -1)} ${string.id}</h3>
          <strong>${kind === 'data' ? `Port ${string.id}` : `20A ${string.id}`}</strong>
        </div>
        <div class="string-meta">
          <div><strong>Start panel:</strong> Col ${first.col + 1}, Row ${plan.height - first.row}</div>
          <div><strong>End panel:</strong> Col ${last.col + 1}, Row ${plan.height - last.row}</div>
          <div><strong>Panels on string:</strong> ${string.panels.length}</div>
          <div><strong>${kind === 'data' ? 'Jumpers' : 'Power jumpers'}:</strong> ${Math.max(0, string.panels.length - 1)}</div>
        </div>
        <p class="string-route codeish"><strong>Route:</strong> ${string.panels.map((panel) => `C${panel.col + 1}/R${plan.height - panel.row}`).join(' → ')}</p>`;
      section.appendChild(card);
    });
    stringsEl.appendChild(section);
  };
  renderGroup('Data strings', '', plan.dataStrings, 'data');
  renderGroup('Power strings', plan.powerMode === 'limited' ? 'Limited power mode: up to 15 panels per power string.' : 'Standard mode: power follows the data breaks.', plan.powerStrings, 'power');
}

function getJobMeta() {
  return {
    jobName: document.getElementById('job-name').value.trim(),
    clientName: document.getElementById('client-name').value.trim(),
    installDate: document.getElementById('install-date').value,
    jobNotes: document.getElementById('job-notes').value.trim(),
    powerMode: document.getElementById('power-mode').value,
  };
}

function applyPrintSizing(plan) {
  const maxSide = Math.max(plan.width, plan.height);
  const area = plan.width * plan.height;

  let panelSize = 104;
  let gap = 8;
  if (maxSide >= 8 || area >= 40) { panelSize = 92; gap = 6; }
  if (maxSide >= 10 || area >= 60) { panelSize = 84; gap = 5; }
  if (maxSide >= 12 || area >= 84) { panelSize = 76; gap = 4; }

  const printGap = Math.max(2, gap - 2);
  const printWidthBudget = 980;
  const printHeightBudget = 420;
  const widthLimited = Math.floor((printWidthBudget - (printGap * Math.max(0, plan.width - 1))) / plan.width);
  const heightLimited = Math.floor((printHeightBudget - (printGap * Math.max(0, plan.height - 1))) / plan.height);
  const printPanelSize = Math.max(28, Math.min(76, widthLimited, heightLimited));

  document.documentElement.style.setProperty('--panel-size', `${panelSize}px`);
  document.documentElement.style.setProperty('--panel-gap', `${gap}px`);
  document.documentElement.style.setProperty('--print-panel-gap', `${printGap}px`);
  document.documentElement.style.setProperty('--print-panel-size', `${printPanelSize}px`);
}

function renderPrintMeta(plan) {
  const meta = getJobMeta();
  printSubtitleEl.textContent = `${plan.width} wide × ${plan.height} high • ${plan.totalPanels} panels • ${plan.dataStrings.length} data strings • ${plan.powerStrings.length} power strings`;
  printDateEl.textContent = meta.installDate ? `Install date: ${meta.installDate}` : `Created: ${new Date().toLocaleString()}`;
  printJobNameEl.textContent = meta.jobName ? `Job: ${meta.jobName}` : '';
  printClientNameEl.textContent = meta.clientName ? `Client: ${meta.clientName}` : '';
  printJobNotesEl.textContent = meta.jobNotes ? `Notes: ${meta.jobNotes}` : '';
  printPowerModeEl.textContent = meta.powerMode === 'limited' ? 'Power mode: limited outlets (15 max power panels)' : 'Power mode: standard (power follows data)';
}

function syncActiveView() {
  document.querySelectorAll('.toggle-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === activeView));
  document.querySelectorAll('.legend').forEach((legend) => legend.classList.toggle('active', legend.dataset.legend === activeView));
  document.querySelectorAll('.board-view').forEach((view) => view.classList.toggle('active', view.dataset.view === activeView));
}

function renderPlan(plan) {
  currentPlan = plan;
  applyPrintSizing(plan);
  renderPrintMeta(plan);
  renderWarnings(plan.warnings);
  renderSummary(plan);
  renderBoardViews(plan);
  renderStrings(plan);
}

function renderCurrentPlan() {
  const { width, height, powerMode } = getInputs();
  renderPlan(planLayout(width, height, powerMode));
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  try { renderCurrentPlan(); } catch (error) {
    renderWarnings([error.message]);
    summaryEl.innerHTML = ''; boardViewsEl.innerHTML = ''; stringsEl.innerHTML = '';
  }
});

viewToggleEl.addEventListener('click', (event) => {
  const btn = event.target.closest('.toggle-btn');
  if (!btn) return;
  activeView = btn.dataset.view;
  syncActiveView();
});

exportPdfBtn.addEventListener('click', () => {
  try { renderCurrentPlan(); } catch {}
  window.print();
});

window.addEventListener('resize', () => { if (currentPlan) renderBoardViews(currentPlan); });
if (!installDateInput.value) installDateInput.value = new Date().toISOString().slice(0, 10);
renderCurrentPlan();
