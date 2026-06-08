const form = document.getElementById('planner-form');
const summaryEl = document.getElementById('summary');
const boardEl = document.getElementById('board');
const boardPathsEl = document.getElementById('board-paths');
const stringsEl = document.getElementById('strings');
const warningsEl = document.getElementById('warnings');
const statTemplate = document.getElementById('stat-template');
const exportPdfBtn = document.getElementById('export-pdf');
const printSubtitleEl = document.getElementById('print-subtitle');
const printDateEl = document.getElementById('print-date');
const printJobNameEl = document.getElementById('print-job-name');
const printClientNameEl = document.getElementById('print-client-name');
const printJobNotesEl = document.getElementById('print-job-notes');
const installDateInput = document.getElementById('install-date');

const palette = [
  '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#0891b2', '#16a34a', '#b91c1c', '#4f46e5', '#0f766e', '#a16207'
];

function columnTraversal(height, col) {
  const rows = [];
  if (col % 2 === 0) {
    for (let row = height - 1; row >= 0; row -= 1) rows.push(row);
  } else {
    for (let row = 0; row < height; row += 1) rows.push(row);
  }
  return rows;
}

function buildWholeColumnStrings(width, height) {
  const colsPerString = Math.max(1, Math.floor(12 / height));
  const strings = [];
  const warnings = [];

  if (height * 2 <= 12 && width > 1 && width % colsPerString !== 0) {
    warnings.push('Last string may end shorter than your usual full up/down column pair because the width does not divide evenly.');
  }

  for (let startCol = 0, port = 1; startCol < width; startCol += colsPerString, port += 1) {
    const endCol = Math.min(width - 1, startCol + colsPerString - 1);
    const panels = [];
    for (let col = startCol; col <= endCol; col += 1) {
      for (const row of columnTraversal(height, col)) {
        panels.push({ col, row });
      }
    }
    strings.push({ port, outlet: port, startCol, endCol, panels });
  }

  return { strings, warnings };
}

function buildSplitColumnStrings(width, height) {
  const warnings = [
    `A ${height}-high column is taller than the 12-panel string limit, so this layout has to break strings within a column.`
  ];
  const orderedPanels = [];
  for (let col = 0; col < width; col += 1) {
    for (const row of columnTraversal(height, col)) {
      orderedPanels.push({ col, row });
    }
  }

  const strings = [];
  let port = 1;
  for (let i = 0; i < orderedPanels.length; i += 12) {
    strings.push({
      port,
      outlet: port,
      startCol: orderedPanels[i].col,
      endCol: orderedPanels[Math.min(i + 11, orderedPanels.length - 1)].col,
      panels: orderedPanels.slice(i, i + 12),
    });
    port += 1;
  }

  return { strings, warnings };
}

function planLayout(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('Height and width must both be whole numbers greater than 0.');
  }

  const result = height <= 12 ? buildWholeColumnStrings(width, height) : buildSplitColumnStrings(width, height);
  const { strings, warnings } = result;
  const totalPanels = width * height;

  strings.forEach((string, stringIndex) => {
    string.color = palette[stringIndex % palette.length];
    string.panels = string.panels.map((panel, panelIndex) => ({
      ...panel,
      stringId: stringIndex + 1,
      orderInString: panelIndex + 1,
      isStart: panelIndex === 0,
      isEnd: panelIndex === string.panels.length - 1,
      next: string.panels[panelIndex + 1] ?? null,
    }));
  });

  return {
    width,
    height,
    strings,
    warnings,
    totalPanels,
    totalStrings: strings.length,
    dataCables: strings.length,
    powerCables: strings.length,
    dedicatedOutlets: strings.length,
    jumperCables: Math.max(0, totalPanels - strings.length),
    physicalWidthIn: width * 19.53,
    physicalHeightIn: height * 19.53,
    pixelWidth: width * 192,
    pixelHeight: height * 192,
  };
}

function arrowFor(panel) {
  if (panel.isStart) return 'start';
  if (!panel.next) return 'end';
  if (panel.next.col > panel.col) return '→ next';
  if (panel.next.row < panel.row) return '↑ next';
  if (panel.next.row > panel.row) return '↓ next';
  return '•';
}

function panelKey(panel) {
  return `${panel.col}:${panel.row}`;
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
    ['Physical size', `${plan.physicalWidthIn.toFixed(2)}" × ${plan.physicalHeightIn.toFixed(2)}"`, 'Calculated at 19.53" per panel'],
    ['Pixel size', `${plan.pixelWidth} × ${plan.pixelHeight}`, 'Calculated at 192 × 192 pixels per panel'],
    ['Strings', plan.totalStrings, 'Each string starts a processor port and a power drop'],
    ['Data home runs', plan.dataCables, 'One processor data cable to each string start'],
    ['Power drops', plan.powerCables, 'One dedicated 20A outlet per string start'],
    ['Daisy-chain jumpers', plan.jumperCables, 'Inter-panel jumpers between panels on the same string'],
    ['Processor ports', plan.totalStrings, `Ports 1-${plan.totalStrings}`],
  ];

  stats.forEach(([label, value, note]) => {
    const node = statTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.label').textContent = label;
    node.querySelector('.value').textContent = value;
    node.querySelector('.note').textContent = note;
    summaryEl.appendChild(node);
  });
}

function renderBoard(plan) {
  boardEl.innerHTML = '';
  boardEl.style.gridTemplateColumns = `repeat(${plan.width}, minmax(104px, 1fr))`;

  const byKey = new Map();
  plan.strings.flatMap((string) => string.panels).forEach((panel) => {
    byKey.set(panelKey(panel), { ...panel, color: plan.strings[panel.stringId - 1].color, port: panel.stringId, outlet: panel.stringId });
  });

  for (let row = 0; row < plan.height; row += 1) {
    for (let col = 0; col < plan.width; col += 1) {
      const panel = byKey.get(`${col}:${row}`);
      const tile = document.createElement('article');
      tile.className = `panel${panel.isStart ? ' start-panel' : ''}${panel.isEnd ? ' end-panel' : ''}`;
      tile.style.background = panel?.color ?? '#334155';
      tile.dataset.key = panelKey(panel);
      tile.innerHTML = `
        <div class="panel-top">
          <strong>S${panel.stringId}</strong>
          ${panel.isStart ? `<span class="start-badge">P${panel.port} · 20A ${panel.outlet}</span>` : ''}
        </div>
        <div class="coords">Col ${col + 1}, Row ${plan.height - row}</div>
        <div class="order">Panel ${panel.orderInString} of ${plan.strings[panel.stringId - 1].panels.length}</div>
        <div class="arrow">${arrowFor(panel)}</div>
      `;
      boardEl.appendChild(tile);
    }
  }

  drawPaths(plan);
}

function getCenter(el) {
  return {
    x: el.offsetLeft + el.offsetWidth / 2,
    y: el.offsetTop + el.offsetHeight / 2,
  };
}

function drawPaths(plan) {
  boardPathsEl.innerHTML = '';
  boardPathsEl.setAttribute('width', boardEl.scrollWidth);
  boardPathsEl.setAttribute('height', boardEl.scrollHeight);
  boardPathsEl.setAttribute('viewBox', `0 0 ${boardEl.scrollWidth} ${boardEl.scrollHeight}`);
  boardPathsEl.style.width = `${boardEl.scrollWidth}px`;
  boardPathsEl.style.height = `${boardEl.scrollHeight}px`;

  const panelEls = new Map();
  boardEl.querySelectorAll('.panel').forEach((el) => panelEls.set(el.dataset.key, el));

  plan.strings.forEach((string) => {
    string.panels.forEach((panel) => {
      if (!panel.next) return;
      const currentEl = panelEls.get(panelKey(panel));
      const nextEl = panelEls.get(panelKey(panel.next));
      if (!currentEl || !nextEl) return;
      const a = getCenter(currentEl);
      const b = getCenter(nextEl);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const midX = (a.x + b.x) / 2;
      path.setAttribute('d', `M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`);
      path.setAttribute('class', 'path-line');
      path.setAttribute('stroke', string.color);
      boardPathsEl.appendChild(path);
    });

    const startPanel = string.panels[0];
    const startEl = panelEls.get(panelKey(startPanel));
    if (startEl) {
      const c = getCenter(startEl);
      const startLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      startLine.setAttribute('d', `M ${Math.max(8, c.x - 54)} ${Math.max(12, c.y - 34)} L ${c.x - 14} ${c.y - 10}`);
      startLine.setAttribute('class', 'data-line');
      boardPathsEl.appendChild(startLine);
    }
  });
}

function renderStrings(plan) {
  stringsEl.innerHTML = '';
  plan.strings.forEach((string, index) => {
    const first = string.panels[0];
    const last = string.panels[string.panels.length - 1];
    const route = string.panels.map((panel) => `C${panel.col + 1}/R${plan.height - panel.row}`).join(' → ');
    const card = document.createElement('article');
    card.className = 'string-item card-lite';
    card.innerHTML = `
      <div class="string-title">
        <h3><span class="swatch" style="background:${string.color}"></span>String ${index + 1}</h3>
        <strong>Port ${string.port}</strong>
      </div>
      <div class="string-meta">
        <div><strong>Start panel:</strong> Col ${first.col + 1}, Row ${plan.height - first.row}</div>
        <div><strong>End panel:</strong> Col ${last.col + 1}, Row ${plan.height - last.row}</div>
        <div><strong>Panels on string:</strong> ${string.panels.length}</div>
        <div><strong>Daisy-chain jumpers:</strong> ${Math.max(0, string.panels.length - 1)}</div>
        <div><strong>Processor data:</strong> Port ${string.port} home run to the start panel</div>
        <div><strong>Dedicated power:</strong> 20A outlet ${string.outlet}</div>
      </div>
      <p class="string-route codeish"><strong>Route:</strong> ${route}</p>
    `;
    stringsEl.appendChild(card);
  });
}

function getJobMeta() {
  const jobName = document.getElementById('job-name').value.trim();
  const clientName = document.getElementById('client-name').value.trim();
  const installDate = document.getElementById('install-date').value;
  const jobNotes = document.getElementById('job-notes').value.trim();
  return { jobName, clientName, installDate, jobNotes };
}

function applyPrintSizing(plan) {
  const maxSide = Math.max(plan.width, plan.height);
  const area = plan.width * plan.height;

  let panelSize = 104;
  let printPanelSize = 76;
  let gap = 8;

  if (maxSide >= 8 || area >= 40) {
    panelSize = 92;
    printPanelSize = 64;
    gap = 6;
  }
  if (maxSide >= 10 || area >= 60) {
    panelSize = 84;
    printPanelSize = 56;
    gap = 5;
  }
  if (maxSide >= 12 || area >= 84) {
    panelSize = 76;
    printPanelSize = 48;
    gap = 4;
  }

  document.documentElement.style.setProperty('--panel-size', `${panelSize}px`);
  document.documentElement.style.setProperty('--panel-gap', `${gap}px`);
  document.documentElement.style.setProperty('--print-panel-size', `${printPanelSize}px`);
}

function renderPrintMeta(plan) {
  const meta = getJobMeta();
  printSubtitleEl.textContent = `${plan.width} wide × ${plan.height} high • ${plan.totalPanels} panels • ${plan.totalStrings} strings`;
  printDateEl.textContent = meta.installDate ? `Install date: ${meta.installDate}` : `Created: ${new Date().toLocaleString()}`;
  printJobNameEl.textContent = meta.jobName ? `Job: ${meta.jobName}` : '';
  printClientNameEl.textContent = meta.clientName ? `Client: ${meta.clientName}` : '';
  printJobNotesEl.textContent = meta.jobNotes ? `Notes: ${meta.jobNotes}` : '';
}

function renderPlan(plan) {
  applyPrintSizing(plan);
  renderPrintMeta(plan);
  renderWarnings(plan.warnings);
  renderSummary(plan);
  renderBoard(plan);
  renderStrings(plan);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const width = Number(document.getElementById('width').value);
  const height = Number(document.getElementById('height').value);

  try {
    renderPlan(planLayout(width, height));
  } catch (error) {
    renderWarnings([error.message]);
    summaryEl.innerHTML = '';
    boardEl.innerHTML = '';
    boardPathsEl.innerHTML = '';
    stringsEl.innerHTML = '';
  }
});

exportPdfBtn.addEventListener('click', () => {
  const width = Number(document.getElementById('width').value);
  const height = Number(document.getElementById('height').value);
  try {
    renderPrintMeta(planLayout(width, height));
  } catch {
    // ignore
  }
  window.print();
});

window.addEventListener('resize', () => {
  const width = Number(document.getElementById('width').value);
  const height = Number(document.getElementById('height').value);
  try {
    drawPaths(planLayout(width, height));
  } catch {
    // ignore invalid state while typing
  }
});

if (!installDateInput.value) {
  installDateInput.value = new Date().toISOString().slice(0, 10);
}

renderPlan(planLayout(4, 5));
