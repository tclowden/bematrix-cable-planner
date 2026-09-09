const form = document.getElementById('planner-form');
const summaryEl = document.getElementById('summary');
const boardViewsEl = document.getElementById('board-views');
const stringsEl = document.getElementById('strings');
const warningsEl = document.getElementById('warnings');
const statTemplate = document.getElementById('stat-template');
const exportPdfBtn = document.getElementById('export-pdf');
const exportPixelMapBtn = document.getElementById('export-pixel-map');
const pixelMapCanvas = document.getElementById('pixel-map-canvas');
const pixelMapSizeEl = document.getElementById('pixel-map-size');
const printSubtitleEl = document.getElementById('print-subtitle');
const printDateEl = document.getElementById('print-date');
const printJobNameEl = document.getElementById('print-job-name');
const printClientNameEl = document.getElementById('print-client-name');
const printProcessorTypeEl = document.getElementById('print-processor-type');
const printIpAddressEl = document.getElementById('print-ip-address');
const printJobNotesEl = document.getElementById('print-job-notes');
const printPowerModeEl = document.getElementById('print-power-mode');
const installDateInput = document.getElementById('install-date');
const viewToggleEl = document.getElementById('view-toggle');
const resetPanelLayoutBtn = document.getElementById('reset-panel-layout');
const newPanelTool = document.getElementById('new-panel-tool');
const deletePanelZone = document.getElementById('delete-panel-zone');

const palette = ['#2563eb','#7c3aed','#db2777','#ea580c','#0891b2','#16a34a','#b91c1c','#4f46e5','#0f766e','#a16207'];
let activeView = 'combined';
let activeDragPayload = null;
let placingNewPanel = false;

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
    width, height, layoutWidth: width, layoutHeight: height, nextAddedPanelId: 1, powerMode,
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

function updateLayoutMetrics(plan) {
  let maxCol = 0;
  let maxRow = 0;
  for (const key of plan.panelMap.keys()) {
    const [col, row] = key.split(':').map(Number);
    maxCol = Math.max(maxCol, col);
    maxRow = Math.max(maxRow, row);
  }
  plan.layoutWidth = maxCol + 1;
  plan.layoutHeight = maxRow + 1;
  plan.physicalWidthIn = plan.layoutWidth * 19.53;
  plan.physicalHeightIn = plan.layoutHeight * 19.53;
  plan.pixelWidth = plan.layoutWidth * 192;
  plan.pixelHeight = plan.layoutHeight * 192;
  plan.totalPanels = plan.panelMap.size;
  plan.dataCables = plan.dataStrings.length;
  plan.powerDrops = plan.powerStrings.length;
  plan.dataJumpers = Math.max(0, plan.totalPanels - plan.dataStrings.length);
  plan.powerJumpers = Math.max(0, plan.totalPanels - plan.powerStrings.length);
}

function sameSourcePanel(a, b) {
  return a.col === b.col && a.row === b.row;
}

function refreshStringAssignments(plan) {
  plan.dataStrings = plan.dataStrings.filter((string) => string.panels.length > 0);
  plan.powerStrings = plan.powerStrings.filter((string) => string.panels.length > 0);

  plan.panelMap.forEach((panel) => Object.assign(panel, {
    dataStringId: null, powerStringId: null,
    dataOrderInString: null, powerOrderInString: null,
    isDataStart: false, isDataEnd: false,
    isPowerStart: false, isPowerEnd: false,
    dataNext: null, powerNext: null,
  }));

  plan.dataStrings.forEach((string, stringIndex) => {
    string.id = stringIndex + 1;
    string.port = string.id;
    string.color = palette[stringIndex % palette.length];
    string.panels.forEach((sourcePanel, index) => {
      const panel = [...plan.panelMap.values()].find((mapped) => sameSourcePanel(mapped, sourcePanel));
      if (!panel) return;
      Object.assign(panel, {
        dataStringId: string.id,
        dataOrderInString: index + 1,
        isDataStart: index === 0,
        isDataEnd: index === string.panels.length - 1,
        dataNext: string.panels[index + 1] ?? null,
      });
    });
  });

  plan.powerStrings.forEach((string, stringIndex) => {
    string.id = stringIndex + 1;
    string.outlet = string.id;
    string.color = palette[(stringIndex + 4) % palette.length];
    string.panels.forEach((sourcePanel, index) => {
      const panel = [...plan.panelMap.values()].find((mapped) => sameSourcePanel(mapped, sourcePanel));
      if (!panel) return;
      Object.assign(panel, {
        powerStringId: string.id,
        powerOrderInString: index + 1,
        isPowerStart: index === 0,
        isPowerEnd: index === string.panels.length - 1,
        powerNext: string.panels[index + 1] ?? null,
      });
    });
  });
  updateLayoutMetrics(plan);
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
    ['Total panels', plan.totalPanels, `${plan.layoutWidth} wide × ${plan.layoutHeight} high layout`],
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

function fitCanvasText(ctx, text, maxWidth, preferredSize, minimumSize = 12) {
  let size = preferredSize;
  do {
    ctx.font = `700 ${size}px Inter, Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  } while (size >= minimumSize);
  return minimumSize;
}

function lightenHex(hex, amount = 0.3) {
  const value = hex.replace('#', '');
  const color = Number.parseInt(value, 16);
  const mix = (channel) => Math.round(channel + (255 - channel) * amount);
  const red = mix((color >> 16) & 255);
  const green = mix((color >> 8) & 255);
  const blue = mix(color & 255);
  return `rgb(${red}, ${green}, ${blue})`;
}

function renderPixelMap(plan) {
  const panelPixels = 192;
  const ctx = pixelMapCanvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot create the pixel map canvas.');

  pixelMapCanvas.width = plan.pixelWidth;
  pixelMapCanvas.height = plan.pixelHeight;
  pixelMapSizeEl.textContent = `${plan.pixelWidth.toLocaleString()} × ${plan.pixelHeight.toLocaleString()} px`;

  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, pixelMapCanvas.width, pixelMapCanvas.height);

  for (let row = 0; row < plan.layoutHeight; row += 1) {
    for (let col = 0; col < plan.layoutWidth; col += 1) {
      const x = col * panelPixels;
      const y = row * panelPixels;
      const displayRow = plan.layoutHeight - row;
      const panel = plan.panelMap.get(`${col}:${row}`);
      if (!panel) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(x, y, panelPixels, panelPixels);
        ctx.font = '700 20px Inter, Arial, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('EMPTY', x + panelPixels / 2, y + panelPixels / 2);
        continue;
      }
      const stringBaseColor = plan.dataStrings[panel.dataStringId - 1]?.color ?? '#334155';
      const stringColor = (row + col) % 2 === 0 ? lightenHex(stringBaseColor) : stringBaseColor;
      const panelLabel = `POSITION C${col + 1} / R${displayRow}`;
      const sourceLabel = panel.addedLabel ?? `SOURCE C${panel.col + 1} / R${plan.height - panel.row}`;
      const stringLabel = `DATA STRING D${panel.dataStringId}`;
      const rangeLabel = `X ${x}–${x + panelPixels - 1}`;
      const verticalRangeLabel = `Y ${y}–${y + panelPixels - 1}`;

      ctx.fillStyle = stringColor;
      ctx.fillRect(x, y, panelPixels, panelPixels);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      fitCanvasText(ctx, panelLabel, panelPixels - 20, 22);
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(panelLabel, x + panelPixels / 2, y + 42);

      ctx.font = '700 17px Inter, Arial, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(stringLabel, x + panelPixels / 2, y + 76);

      ctx.font = '600 15px Inter, Arial, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillText(sourceLabel, x + panelPixels / 2, y + 105);

      ctx.font = '500 14px Inter, Arial, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
      ctx.fillText(rangeLabel, x + panelPixels / 2, y + 137);
      ctx.fillText(verticalRangeLabel, x + panelPixels / 2, y + 159);
    }
  }

  ctx.strokeStyle = '#f43f5e';
  ctx.lineWidth = 4;
  for (let col = 0; col <= plan.layoutWidth; col += 1) {
    const x = Math.min(pixelMapCanvas.width - 2, Math.max(2, col * panelPixels));
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, pixelMapCanvas.height);
    ctx.stroke();
  }
  for (let row = 0; row <= plan.layoutHeight; row += 1) {
    const y = Math.min(pixelMapCanvas.height - 2, Math.max(2, row * panelPixels));
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(pixelMapCanvas.width, y);
    ctx.stroke();
  }
}

function safeFilename(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function downloadPixelMap() {
  if (!currentPlan) renderCurrentPlan();
  renderPixelMap(currentPlan);
  const meta = getJobMeta();
  const jobSlug = safeFilename(meta.jobName || meta.clientName || 'led-wall');
  const link = document.createElement('a');
  link.download = `${jobSlug}-pixel-map-${currentPlan.pixelWidth}x${currentPlan.pixelHeight}.jpg`;
  link.href = pixelMapCanvas.toDataURL('image/jpeg', 0.96);
  link.click();
}

function buildBoardPanelHtml(panel, view, position) {
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
    <div class="coords">Position C${position.col + 1}/R${currentPlan.layoutHeight - position.row}</div>
    <div class="coords source-coords">${panel.addedLabel ?? `Source C${panel.col + 1}/R${currentPlan.height - panel.row}`}</div>
    <div class="order">${orderText}</div>
    <div class="arrow">${arrowText}</div>
    <button type="button" class="panel-delete" aria-label="Delete this panel" title="Delete panel">×</button>`;
}

let currentPlan = null;

function createBoardView(plan, view) {
  const wrap = document.createElement('section');
  wrap.className = `board-view${view === activeView ? ' active' : ''} print-page ${view === 'data' ? 'print-page-break' : ''}`;
  wrap.dataset.view = view;
  wrap.innerHTML = `<h3 class="view-title">${view.charAt(0).toUpperCase() + view.slice(1)} view</h3><div class="board-shell"><div class="board-scale-wrap"><svg class="board-paths" aria-hidden="true"></svg><div class="board"></div></div></div>`;
  const board = wrap.querySelector('.board');
  const workspaceWidth = plan.layoutWidth + 1;
  const workspaceHeight = plan.layoutHeight + 1;
  board.style.setProperty('--layout-cols', plan.layoutWidth);
  board.style.gridTemplateColumns = `repeat(${workspaceWidth}, minmax(104px, 1fr))`;
  for (let row = 0; row < workspaceHeight; row += 1) {
    for (let col = 0; col < workspaceWidth; col += 1) {
      const panel = plan.panelMap.get(`${col}:${row}`);
      const tile = document.createElement(panel ? 'article' : 'div');
      tile.dataset.positionKey = `${col}:${row}`;
      tile.style.gridColumn = `${col + 1}`;
      tile.style.gridRow = `${row + 1}`;
      if (!panel) {
        tile.className = `panel empty-panel${col >= plan.layoutWidth || row >= plan.layoutHeight ? ' expansion-slot' : ''}`;
        tile.innerHTML = '<span>Drop panel here</span>';
        tile.title = 'Drop a panel here to expand or reshape the layout';
        addPanelDropHandlers(tile);
        tile.addEventListener('click', () => {
          if (!placingNewPanel) return;
          addPanelAt(tile.dataset.positionKey);
          placingNewPanel = false;
          newPanelTool.classList.remove('placing');
        });
        board.appendChild(tile);
        continue;
      }
      const bg = view === 'power' ? plan.powerStrings[panel.powerStringId - 1]?.color : plan.dataStrings[panel.dataStringId - 1]?.color;
      tile.className = `panel${panel.isDataStart ? ' start-panel' : ''}${panel.isDataEnd ? ' end-panel' : ''}${panel.isPowerStart ? ' power-start-panel' : ''}`;
      if (view === 'power') tile.classList.add('power-mode-panel');
      tile.style.background = bg ?? '#334155';
      tile.dataset.key = `${panel.col}:${panel.row}`;
      tile.draggable = true;
      tile.title = 'Drag onto another panel to swap mapping positions';
      tile.innerHTML = buildBoardPanelHtml(panel, view, { col, row });
      tile.querySelector('.panel-delete').addEventListener('click', (event) => {
        event.stopPropagation();
        deletePanelAt(tile.dataset.positionKey);
      });
      addPanelDragHandlers(tile);
      board.appendChild(tile);
    }
  }
  drawPathsForView(plan, view, wrap.querySelector('.board-paths'), board);
  applyBoardPrintScale(wrap, board);
  return wrap;
}

function addPanelDragHandlers(tile) {
  tile.addEventListener('dragstart', (event) => {
    activeDragPayload = tile.dataset.positionKey;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', tile.dataset.positionKey);
    tile.classList.add('dragging');
  });
  tile.addEventListener('dragend', () => {
    tile.classList.remove('dragging');
    setTimeout(() => { activeDragPayload = null; }, 0);
  });
  addPanelDropHandlers(tile);
}

function addPanelDropHandlers(tile) {
  tile.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = activeDragPayload === 'NEW_PANEL' ? 'copy' : 'move';
    tile.classList.add('drop-target');
  });
  tile.addEventListener('dragleave', () => tile.classList.remove('drop-target'));
  tile.addEventListener('drop', (event) => {
    event.preventDefault();
    tile.classList.remove('drop-target');
    const sourceKey = event.dataTransfer.getData('text/plain') || activeDragPayload;
    const targetKey = tile.dataset.positionKey;
    if (!sourceKey || !targetKey || sourceKey === targetKey) return;
    movePanel(sourceKey, targetKey);
  });
}

function movePanel(sourceKey, targetKey) {
  if (sourceKey === 'NEW_PANEL') {
    if (!currentPlan.panelMap.has(targetKey)) addPanelAt(targetKey);
    return;
  }
  const sourcePanel = currentPlan.panelMap.get(sourceKey);
  const targetPanel = currentPlan.panelMap.get(targetKey);
  if (!sourcePanel) return;
  currentPlan.panelMap.delete(sourceKey);
  if (targetPanel) currentPlan.panelMap.set(sourceKey, targetPanel);
  currentPlan.panelMap.set(targetKey, sourcePanel);
  updateLayoutMetrics(currentPlan);
  renderMappedPlan();
}

function appendPanelToString(strings, sourcePanel, kind, limit) {
  let string = strings[strings.length - 1];
  if (!string || string.panels.length >= limit) {
    const id = strings.length + 1;
    const colorIndex = kind === 'power' ? id + 3 : id - 1;
    string = { id, kind, limit, panels: [], color: palette[colorIndex % palette.length] };
    if (kind === 'data') string.port = id;
    else string.outlet = id;
    strings.push(string);
  }
  string.panels.push(sourcePanel);
}

function addPanelAt(targetKey) {
  const addedId = currentPlan.nextAddedPanelId++;
  const sourcePanel = { col: currentPlan.width + addedId - 1, row: -1, addedLabel: `ADDED PANEL ${addedId}` };
  const panel = {
    ...sourcePanel,
    dataStringId: null, powerStringId: null,
    dataOrderInString: null, powerOrderInString: null,
    isDataStart: false, isDataEnd: false,
    isPowerStart: false, isPowerEnd: false,
    dataNext: null, powerNext: null,
  };
  currentPlan.panelMap.set(targetKey, panel);
  appendPanelToString(currentPlan.dataStrings, sourcePanel, 'data', 12);
  appendPanelToString(currentPlan.powerStrings, sourcePanel, 'power', currentPlan.powerMode === 'limited' ? 15 : 12);
  refreshStringAssignments(currentPlan);
  renderMappedPlan();
}

function deletePanelAt(positionKey) {
  const panel = currentPlan.panelMap.get(positionKey);
  if (!panel) return;
  currentPlan.panelMap.delete(positionKey);
  currentPlan.dataStrings.forEach((string) => { string.panels = string.panels.filter((source) => !sameSourcePanel(source, panel)); });
  currentPlan.powerStrings.forEach((string) => { string.panels = string.panels.filter((source) => !sameSourcePanel(source, panel)); });
  refreshStringAssignments(currentPlan);
  renderMappedPlan();
}

function renderMappedPlan() {
  applyPrintSizing(currentPlan);
  renderPrintMeta(currentPlan);
  renderSummary(currentPlan);
  renderPixelMap(currentPlan);
  renderBoardViews(currentPlan);
  renderStrings(currentPlan);
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

function getMappedPanel(plan, panel) {
  return [...plan.panelMap.values()].find((mapped) => mapped.col === panel.col && mapped.row === panel.row);
}

function getPanelPosition(plan, panel) {
  for (const [key, mapped] of plan.panelMap.entries()) {
    if (mapped === panel) {
      const [col, row] = key.split(':').map(Number);
      return { col, row };
    }
  }
  return { col: panel.col, row: panel.row };
}

function getStringPanelPosition(plan, stringPanel) {
  return getPanelPosition(plan, getMappedPanel(plan, stringPanel) ?? stringPanel);
}

function renderStrings(plan) {
  stringsEl.innerHTML = '';
  const renderGroup = (title, note, strings, kind) => {
    const section = document.createElement('section');
    section.className = 'strings-group';
    section.innerHTML = `<h3>${title}</h3>${note ? `<p class="group-note">${note}</p>` : ''}`;
    strings.forEach((string) => {
      const first = getStringPanelPosition(plan, string.panels[0]);
      const last = getStringPanelPosition(plan, string.panels[string.panels.length - 1]);
      const card = document.createElement('article');
      card.className = 'string-item card-lite';
      card.innerHTML = `
        <div class="string-title">
          <h3><span class="swatch" style="background:${string.color}"></span>${title.slice(0, -1)} ${string.id}</h3>
          <strong>${kind === 'data' ? `Port ${string.id}` : `20A ${string.id}`}</strong>
        </div>
        <div class="string-meta">
          <div><strong>Start position:</strong> Col ${first.col + 1}, Row ${plan.layoutHeight - first.row}</div>
          <div><strong>End position:</strong> Col ${last.col + 1}, Row ${plan.layoutHeight - last.row}</div>
          <div><strong>Panels on string:</strong> ${string.panels.length}</div>
          <div><strong>${kind === 'data' ? 'Jumpers' : 'Power jumpers'}:</strong> ${Math.max(0, string.panels.length - 1)}</div>
        </div>
        <p class="string-route codeish"><strong>Route:</strong> ${string.panels.map((panel) => { const position = getStringPanelPosition(plan, panel); return `C${position.col + 1}/R${plan.layoutHeight - position.row}`; }).join(' → ')}</p>`;
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
    processorType: document.getElementById('processor-type').value,
    ipAddress: document.getElementById('ip-address').value.trim(),
    jobNotes: document.getElementById('job-notes').value.trim(),
    powerMode: document.getElementById('power-mode').value,
  };
}

function applyPrintSizing(plan) {
  const maxSide = Math.max(plan.layoutWidth, plan.layoutHeight);
  const area = plan.layoutWidth * plan.layoutHeight;

  let panelSize = 104;
  let gap = 8;
  if (maxSide >= 8 || area >= 40) { panelSize = 92; gap = 6; }
  if (maxSide >= 10 || area >= 60) { panelSize = 84; gap = 5; }
  if (maxSide >= 12 || area >= 84) { panelSize = 76; gap = 4; }

  const printGap = Math.max(2, gap - 2);
  const printWidthBudget = 980;
  const printHeightBudget = 420;
  const widthLimited = Math.floor((printWidthBudget - (printGap * Math.max(0, plan.layoutWidth - 1))) / plan.layoutWidth);
  const heightLimited = Math.floor((printHeightBudget - (printGap * Math.max(0, plan.layoutHeight - 1))) / plan.layoutHeight);
  const printPanelSize = Math.max(28, Math.min(76, widthLimited, heightLimited));

  document.documentElement.style.setProperty('--panel-size', `${panelSize}px`);
  document.documentElement.style.setProperty('--panel-gap', `${gap}px`);
  document.documentElement.style.setProperty('--print-panel-gap', `${printGap}px`);
  document.documentElement.style.setProperty('--print-panel-size', `${printPanelSize}px`);
}

function renderPrintMeta(plan) {
  const meta = getJobMeta();
  printSubtitleEl.textContent = `${plan.layoutWidth} wide × ${plan.layoutHeight} high • ${plan.totalPanels} panels • ${plan.dataStrings.length} data strings • ${plan.powerStrings.length} power strings`;
  printDateEl.textContent = meta.installDate ? `Install date: ${meta.installDate}` : `Created: ${new Date().toLocaleString()}`;
  printJobNameEl.textContent = meta.jobName ? `Job: ${meta.jobName}` : '';
  printClientNameEl.textContent = meta.clientName ? `Client: ${meta.clientName}` : '';
  printProcessorTypeEl.textContent = meta.processorType ? `Processor: ${meta.processorType}` : '';
  printIpAddressEl.textContent = meta.ipAddress ? `IP address: ${meta.ipAddress}` : '';
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
  renderPixelMap(plan);
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
  if (!btn?.dataset.view) return;
  activeView = btn.dataset.view;
  syncActiveView();
});

exportPdfBtn.addEventListener('click', () => {
  if (currentPlan) renderPrintMeta(currentPlan);
  window.print();
});

exportPixelMapBtn.addEventListener('click', () => {
  try { downloadPixelMap(); } catch (error) { renderWarnings([error.message]); }
});

resetPanelLayoutBtn.addEventListener('click', () => {
  try { renderCurrentPlan(); } catch (error) { renderWarnings([error.message]); }
});

newPanelTool.addEventListener('dragstart', (event) => {
  activeDragPayload = 'NEW_PANEL';
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('text/plain', 'NEW_PANEL');
  newPanelTool.classList.add('dragging');
});
newPanelTool.addEventListener('dragend', () => {
  newPanelTool.classList.remove('dragging');
  setTimeout(() => { activeDragPayload = null; }, 0);
});
newPanelTool.addEventListener('click', () => {
  placingNewPanel = !placingNewPanel;
  newPanelTool.classList.toggle('placing', placingNewPanel);
});

deletePanelZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  deletePanelZone.classList.add('drop-target');
});
deletePanelZone.addEventListener('dragleave', () => deletePanelZone.classList.remove('drop-target'));
deletePanelZone.addEventListener('drop', (event) => {
  event.preventDefault();
  deletePanelZone.classList.remove('drop-target');
  const positionKey = event.dataTransfer.getData('text/plain') || activeDragPayload;
  if (positionKey && positionKey !== 'NEW_PANEL') deletePanelAt(positionKey);
});

window.addEventListener('resize', () => { if (currentPlan) renderBoardViews(currentPlan); });
if (!installDateInput.value) installDateInput.value = new Date().toISOString().slice(0, 10);
renderCurrentPlan();
