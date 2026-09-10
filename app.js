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
const exportProjectBtn = document.getElementById('export-project');
const importProjectBtn = document.getElementById('import-project');
const importProjectFile = document.getElementById('import-project-file');
const exportNprjBtn = document.getElementById('export-nprj');
const nprjStatusEl = document.getElementById('nprj-status');
const panelEditorEmpty = document.getElementById('panel-editor-empty');
const panelEditorControls = document.getElementById('panel-editor-controls');
const selectedPanelLabel = document.getElementById('selected-panel-label');
const selectedDataString = document.getElementById('selected-data-string');
const selectedDataOrder = document.getElementById('selected-data-order');
const undoPanelEditBtn = document.getElementById('undo-panel-edit');
const zoomLevelEl = document.getElementById('zoom-level');

const palette = ['#2563eb','#7c3aed','#db2777','#ea580c','#0891b2','#16a34a','#b91c1c','#4f46e5','#0f766e','#a16207'];
let activeView = 'combined';
let activeDragPayload = null;
let placingNewPanel = false;
let selectedPositionKey = null;
let boardZoom = 1;
const panelEditHistory = [];

function snapshotPlan() {
  return {
    panelMap: [...currentPlan.panelMap.entries()].map(([key, panel]) => [key, { ...panel }]),
    dataStrings: structuredClone(currentPlan.dataStrings),
    powerStrings: structuredClone(currentPlan.powerStrings),
    nextAddedPanelId: currentPlan.nextAddedPanelId,
  };
}

function pushPanelUndo() {
  if (!currentPlan) return;
  panelEditHistory.push(snapshotPlan());
  if (panelEditHistory.length > 25) panelEditHistory.shift();
  undoPanelEditBtn.disabled = false;
}

function restorePlan(snapshot) {
  currentPlan.panelMap = new Map(snapshot.panelMap);
  currentPlan.dataStrings = snapshot.dataStrings;
  currentPlan.powerStrings = snapshot.powerStrings;
  currentPlan.nextAddedPanelId = snapshot.nextAddedPanelId;
  refreshStringAssignments(currentPlan);
  if (selectedPositionKey && !currentPlan.panelMap.has(selectedPositionKey)) selectedPositionKey = null;
  renderMappedPlan();
}

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

function downloadFile(filename, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function setNprjStatus(message, isError = false) {
  nprjStatusEl.textContent = message;
  nprjStatusEl.classList.toggle('error', isError);
}

function getProjectDevices(checkXml) {
  const documentXml = new DOMParser().parseFromString(checkXml, 'application/xml');
  if (documentXml.querySelector('parsererror')) throw new Error('The template has an invalid check.xml file.');
  return [...documentXml.querySelectorAll('Device')].map((device) => ({
    element: device,
    ip: device.querySelector('DeviceIp')?.textContent?.trim() || '',
    name: device.querySelector('DeviceName')?.textContent?.trim() || '',
    model: device.querySelector('DeviceTypeName')?.textContent?.trim() || 'Unknown controller',
    path: device.querySelector('DeviceDataFilePath')?.textContent?.trim() || '',
  }));
}

function getPrimaryTemplateController(devices) {
  if (!devices.length) throw new Error('The VMP template does not contain a controller.');
  return devices.find((device) => device.name.toLowerCase() === 'primary') || devices[0];
}

function getProcessorIp() {
  const value = document.getElementById('ip-address').value.trim() || '192.168.0.10';
  const octets = value.split('.');
  if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/.test(octet) || Number(octet) > 255)) {
    throw new Error('Enter a valid IPv4 processor address, such as 192.168.0.10.');
  }
  return value;
}

function getProcessorTemplate() {
  const processorType = document.getElementById('processor-type').value || 'MX40';
  const templates = {
    MX20: { file: 'mx20-vmp-template.nprj', label: 'MX20' },
    MX30: { file: 'mx30-vmp-template.nprj', label: 'MX30' },
    MX40: { file: 'mx40-vmp-template.nprj', label: 'MX40 Pro' },
  };
  const template = templates[processorType];
  if (!template) throw new Error('Select an MX20, MX30, or MX40 processor before creating the VMP project.');
  return { ...template, processorType };
}

function updateProjectXml(checkXml, controller, processorIp, archivePath, projectName) {
  const documentXml = new DOMParser().parseFromString(checkXml, 'application/xml');
  if (documentXml.querySelector('parsererror')) throw new Error('The template has an invalid check.xml file.');
  const projectDevices = [...documentXml.querySelectorAll('Device')];
  const targetDevice = projectDevices.find((device) => device.querySelector('DeviceDataFilePath')?.textContent?.trim() === controller.path);
  if (!targetDevice) throw new Error('The primary controller could not be found in check.xml.');
  projectDevices.forEach((device) => { if (device !== targetDevice) device.remove(); });
  documentXml.querySelector('Devices')?.setAttribute('DeviceNumber', '1');
  const setText = (selector, value) => {
    const element = targetDevice.querySelector(selector);
    if (element) element.textContent = value;
  };
  setText('DeviceIp', processorIp);
  setText('DeviceDataFilePath', archivePath);
  if (projectName) {
    setText('ProejctName', projectName);
    documentXml.documentElement.setAttribute('ProjectName', projectName);
  }
  return new XMLSerializer().serializeToString(documentXml);
}

function updateScreenConfig(screenConfig, plan, cabinetIds, processorLabel) {
  const canvases = screenConfig.screens?.flatMap((screen) => screen.canvases || []) || [];
  if (!canvases.length) throw new Error('The selected controller template has no screen canvas.');
  const cabinetPool = canvases.flatMap((canvas) => canvas.cabinets || []);
  if (plan.totalPanels > cabinetPool.length) {
    throw new Error(`This template contains ${cabinetPool.length} cabinet records, but the plan needs ${plan.totalPanels}. Use a template with at least that many cabinets.`);
  }

  const targetCanvas = canvases[0];
  const cabinetRecords = cabinetPool.map((cabinet, index) => ({
    cabinet,
    cabinetId: cabinetIds[index],
  }));
  const cabinetsByOutput = new Map();
  cabinetRecords.forEach((record) => {
    const records = cabinetsByOutput.get(record.cabinet.outputID) || [];
    records.push(record);
    cabinetsByOutput.set(record.cabinet.outputID, records);
  });
  const assignments = plan.dataStrings.flatMap((string) => string.panels.map((sourcePanel, index) => ({
    sourcePanel,
    outputID: 2048 + (string.port - 1),
    connectID: index,
  })));
  const positionBySource = new Map([...plan.panelMap.entries()].map(([positionKey, panel]) => [
    `${panel.col}:${panel.row}`,
    positionKey.split(':').map(Number),
  ]));

  const outputOffsets = new Map();
  targetCanvas.cabinets = assignments.map((assignment) => {
    const position = positionBySource.get(`${assignment.sourcePanel.col}:${assignment.sourcePanel.row}`);
    if (!position) throw new Error('A data string references a panel that is not in the current layout.');
    const outputCabinets = cabinetsByOutput.get(assignment.outputID) || [];
    const outputOffset = outputOffsets.get(assignment.outputID) || 0;
    const templateRecord = outputCabinets[outputOffset];
    if (!templateRecord?.cabinetId) {
      throw new Error(`The ${processorLabel} template does not have enough cabinet records for Port ${assignment.outputID - 2047}. Add panels to an available port or provide a ${processorLabel} VMP template that uses this port.`);
    }
    outputOffsets.set(assignment.outputID, outputOffset + 1);
    const [col, row] = position;
    return {
      ...templateRecord.cabinet,
      cabinetID: `__NOVA_CABINET_ID_${templateRecord.cabinetId}__`,
      connectID: assignment.connectID,
      outputID: assignment.outputID,
      pageID: 0,
      position: { x: col * 192, y: row * 192 },
      size: { width: 192, height: 192 },
      angle: 0,
      lockStatus: false,
    };
  });
  canvases.slice(1).forEach((canvas) => { canvas.cabinets = []; });
  targetCanvas.size = { width: plan.pixelWidth, height: plan.pixelHeight };
  targetCanvas.rectSize = { width: plan.pixelWidth, height: plan.pixelHeight };
  targetCanvas.position = { x: 0, y: 0 };
  targetCanvas.isCustomSize = true;
  const screen = screenConfig.screens[0];
  screen.workingMode = 0;
  const internalLayout = screen.layersInWorkingMode?.find((layout) => layout.workingMode === 0);
  if (internalLayout?.layers?.length) {
    const layer = internalLayout.layers[0];
    layer.source = 224;
    layer.position = { x: 0, y: 0 };
    layer.scaler = { width: plan.pixelWidth, height: plan.pixelHeight };
    layer.layerInCanvasId = targetCanvas.canvasID;
    layer.followState = false;
  }
  const internalCanvas = targetCanvas.canvasInWorkingMode?.find((entry) => entry.workingMode === 0);
  if (internalCanvas) {
    internalCanvas.size = { width: plan.pixelWidth, height: plan.pixelHeight };
    internalCanvas.isCustomSize = true;
  }
  return screenConfig;
}

function serializeNovaConfig(config) {
  return `${JSON.stringify(config, null, 4).replace(/"__NOVA_CABINET_ID_(\d+)__"/g, '$1')}\n`;
}

function setInternalOutputSource(outputConfig) {
  (outputConfig.OutputConfigs || []).forEach((config) => {
    const internal = config.outputSyncParas?.find((entry) => entry.WorkingMode === 0);
    if (internal) {
      internal.SelectSource = 224;
      internal.InputId = 102;
      internal.SourceName = 'internal-source';
    }
  });
  return outputConfig;
}

async function createNprj() {
  if (!window.JSZip) throw new Error('The ZIP library did not load. Check the internet connection and try again.');
  if (!currentPlan) renderCurrentPlan();

  const template = getProcessorTemplate();
  const templateResponse = await fetch(`./${template.file}`);
  if (!templateResponse.ok) throw new Error(`The ${template.label} VMP template could not be loaded.`);
  const outerZip = await JSZip.loadAsync(await templateResponse.arrayBuffer());
  const checkEntry = outerZip.file('check.xml');
  if (!checkEntry) throw new Error('This is not a VMP project: check.xml is missing.');
  const checkXml = await checkEntry.async('string');
  const devices = getProjectDevices(checkXml);
  const processorIp = getProcessorIp();
  const controller = getPrimaryTemplateController(devices);
  const controllerEntry = outerZip.file(controller.path);
  if (!controller.path || !controllerEntry) throw new Error(`The controller archive ${controller.path || '(missing)'} was not found.`);

  const controllerZip = await JSZip.loadAsync(await controllerEntry.async('uint8array'));
  const configPath = 'controller3.1/usrconfig/screenConfig.json';
  const configEntry = controllerZip.file(configPath);
  if (!configEntry) throw new Error(`The ${controller.model} template does not contain ${configPath}.`);
  const rawScreenConfig = await configEntry.async('string');
  const cabinetIds = [...rawScreenConfig.matchAll(/"cabinetID"\s*:\s*(\d+)/g)].map((match) => match[1]);
  if (cabinetIds.length < currentPlan.totalPanels) {
    throw new Error(`The template contains only ${cabinetIds.length} exact cabinet IDs for ${currentPlan.totalPanels} panels.`);
  }
  const screenConfig = JSON.parse(rawScreenConfig);
  controllerZip.file(configPath, serializeNovaConfig(updateScreenConfig(screenConfig, currentPlan, cabinetIds, template.label)));

  const meta = getJobMeta();
  const projectName = meta.jobName || meta.clientName || 'LED Wall';
  const outputPath = `${processorIp}_project_`;
  const customConfigPath = 'controller3.1/customconfig/deviceCustomConfig.json';
  const customConfigEntry = controllerZip.file(customConfigPath);
  if (customConfigEntry) {
    const customConfig = JSON.parse(await customConfigEntry.async('string'));
    customConfig.CustomIp = processorIp;
    controllerZip.file(customConfigPath, `${JSON.stringify(customConfig, null, 4)}\n`);
  }
  const outputConfigPath = 'controller3.1/usrconfig/outputConfig.json';
  const outputConfigEntry = controllerZip.file(outputConfigPath);
  if (outputConfigEntry) {
    const outputConfig = JSON.parse(await outputConfigEntry.async('string'));
    controllerZip.file(outputConfigPath, `${JSON.stringify(setInternalOutputSource(outputConfig), null, 4)}\n`);
  }
  devices.forEach((device) => outerZip.remove(device.path));
  outerZip.file(outputPath, await controllerZip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
  outerZip.file('check.xml', updateProjectXml(checkXml, controller, processorIp, outputPath, projectName));

  const filename = `${safeFilename(projectName)}-${processorIp.replaceAll('.', '-')}.nprj`;
  const output = await outerZip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  downloadFile(filename, output, 'application/octet-stream');
  setNprjStatus(`Created ${filename}: ${template.label} with ${currentPlan.totalPanels} cabinets mapped across ${currentPlan.dataStrings.length} ports on ${processorIp}, using the Internal source.`);
}

function exportProject() {
  if (!currentPlan) renderCurrentPlan();
  const meta = getJobMeta();
  const project = {
    app: 'bematrix-led-cable-planner',
    version: 1,
    exportedAt: new Date().toISOString(),
    source: { width: currentPlan.width, height: currentPlan.height },
    powerMode: currentPlan.powerMode,
    nextAddedPanelId: currentPlan.nextAddedPanelId,
    meta,
    panels: [...currentPlan.panelMap.entries()].map(([positionKey, panel]) => {
      const [col, row] = positionKey.split(':').map(Number);
      return {
        position: { col, row },
        source: { col: panel.col, row: panel.row, addedLabel: panel.addedLabel ?? null },
        data: { stringId: panel.dataStringId, order: panel.dataOrderInString },
        power: { stringId: panel.powerStringId, order: panel.powerOrderInString },
      };
    }),
  };
  const jobSlug = safeFilename(meta.jobName || meta.clientName || 'led-wall');
  downloadFile(`${jobSlug}-cable-plan.json`, `${JSON.stringify(project, null, 2)}\n`, 'application/json');
}

function requireInteger(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) throw new Error(`${label} must be a whole number of at least ${minimum}.`);
  return value;
}

function buildImportedStrings(panels, kind, limit) {
  const groups = new Map();
  panels.forEach((entry) => {
    const assignment = entry[kind];
    const stringId = requireInteger(assignment?.stringId, `${kind} string ID`, 1);
    const order = requireInteger(assignment?.order, `${kind} string order`, 1);
    if (!groups.has(stringId)) groups.set(stringId, []);
    groups.get(stringId).push({ order, source: { ...entry.source } });
  });
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, entries], index) => ({
      id: index + 1,
      kind,
      limit,
      panels: entries.sort((a, b) => a.order - b.order).map((entry) => entry.source),
      color: palette[(kind === 'power' ? index + 4 : index) % palette.length],
      ...(kind === 'data' ? { port: index + 1 } : { outlet: index + 1 }),
    }));
}

function importProject(project) {
  if (!project || project.app !== 'bematrix-led-cable-planner' || project.version !== 1) {
    throw new Error('This is not a supported LED Cable Planner project file.');
  }
  const width = requireInteger(project.source?.width, 'Source width', 1);
  const height = requireInteger(project.source?.height, 'Source height', 1);
  if (!['standard', 'limited'].includes(project.powerMode)) throw new Error('The project has an invalid power mode.');
  if (!Array.isArray(project.panels) || project.panels.length > 10000) throw new Error('The project panel list is invalid or too large.');

  const plan = planLayout(width, height, project.powerMode);
  const positionKeys = new Set();
  const sourceKeys = new Set();
  plan.panelMap = new Map();
  project.panels.forEach((entry, index) => {
    const col = requireInteger(entry.position?.col, `Panel ${index + 1} position column`);
    const row = requireInteger(entry.position?.row, `Panel ${index + 1} position row`);
    const sourceCol = requireInteger(entry.source?.col, `Panel ${index + 1} source column`);
    const sourceRow = requireInteger(entry.source?.row, `Panel ${index + 1} source row`, -1);
    const positionKey = `${col}:${row}`;
    const sourceKey = `${sourceCol}:${sourceRow}`;
    if (positionKeys.has(positionKey)) throw new Error(`More than one panel occupies position ${positionKey}.`);
    if (sourceKeys.has(sourceKey)) throw new Error(`Panel source ${sourceKey} is duplicated.`);
    positionKeys.add(positionKey);
    sourceKeys.add(sourceKey);
    plan.panelMap.set(positionKey, {
      col: sourceCol,
      row: sourceRow,
      addedLabel: typeof entry.source.addedLabel === 'string' ? entry.source.addedLabel.slice(0, 80) : undefined,
    });
  });
  plan.dataStrings = buildImportedStrings(project.panels, 'data', 12);
  plan.powerStrings = buildImportedStrings(project.panels, 'power', project.powerMode === 'limited' ? 15 : 12);
  plan.nextAddedPanelId = requireInteger(project.nextAddedPanelId ?? 1, 'Next added panel ID', 1);
  plan.warnings = [];
  refreshStringAssignments(plan);

  const meta = project.meta && typeof project.meta === 'object' ? project.meta : {};
  document.getElementById('width').value = width;
  document.getElementById('height').value = height;
  document.getElementById('power-mode').value = project.powerMode;
  document.getElementById('job-name').value = typeof meta.jobName === 'string' ? meta.jobName : '';
  document.getElementById('client-name').value = typeof meta.clientName === 'string' ? meta.clientName : '';
  document.getElementById('install-date').value = typeof meta.installDate === 'string' ? meta.installDate : '';
  document.getElementById('processor-type').value = ['MX20', 'MX30', 'MX40'].includes(meta.processorType) ? meta.processorType : 'MX40';
  document.getElementById('ip-address').value = typeof meta.ipAddress === 'string' ? meta.ipAddress : '';
  document.getElementById('job-notes').value = typeof meta.jobNotes === 'string' ? meta.jobNotes : '';
  renderPlan(plan);
}

async function loadProjectFile(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) throw new Error('Project JSON files must be smaller than 5 MB.');
  importProject(JSON.parse(await file.text()));
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
      if (tile.dataset.positionKey === selectedPositionKey) tile.classList.add('selected-panel');
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
      tile.addEventListener('click', () => {
        selectedPositionKey = tile.dataset.positionKey;
        renderBoardViews(currentPlan);
        renderPanelEditor();
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
  pushPanelUndo();
  currentPlan.panelMap.delete(sourceKey);
  if (targetPanel) currentPlan.panelMap.set(sourceKey, targetPanel);
  currentPlan.panelMap.set(targetKey, sourcePanel);
  if (selectedPositionKey === sourceKey) selectedPositionKey = targetKey;
  else if (selectedPositionKey === targetKey) selectedPositionKey = sourceKey;
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
  pushPanelUndo();
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
  pushPanelUndo();
  currentPlan.panelMap.delete(positionKey);
  currentPlan.dataStrings.forEach((string) => { string.panels = string.panels.filter((source) => !sameSourcePanel(source, panel)); });
  currentPlan.powerStrings.forEach((string) => { string.panels = string.panels.filter((source) => !sameSourcePanel(source, panel)); });
  refreshStringAssignments(currentPlan);
  if (selectedPositionKey === positionKey) selectedPositionKey = null;
  renderMappedPlan();
}

function renderMappedPlan() {
  applyPrintSizing(currentPlan);
  renderPrintMeta(currentPlan);
  renderSummary(currentPlan);
  renderPixelMap(currentPlan);
  renderBoardViews(currentPlan);
  renderStrings(currentPlan);
  renderPanelEditor();
}

function getSelectedPanel() {
  return selectedPositionKey ? currentPlan?.panelMap.get(selectedPositionKey) : null;
}

function movePanelToDataString(positionKey, targetStringId, requestedOrder) {
  const panel = currentPlan.panelMap.get(positionKey);
  if (!panel) return;
  const sourceString = currentPlan.dataStrings.find((string) => string.panels.some((item) => sameSourcePanel(item, panel)));
  let targetString = currentPlan.dataStrings.find((string) => string.id === targetStringId);
  if (!targetString) {
    targetString = { id: currentPlan.dataStrings.length + 1, port: currentPlan.dataStrings.length + 1, kind: 'data', limit: 12, panels: [], color: palette[currentPlan.dataStrings.length % palette.length] };
    currentPlan.dataStrings.push(targetString);
  }
  const sameString = sourceString === targetString;
  if (!sameString && targetString.panels.length >= targetString.limit) {
    renderWarnings([`Data String ${targetString.id} is full (${targetString.limit}/${targetString.limit}).`]);
    return;
  }
  pushPanelUndo();
  if (sourceString) sourceString.panels = sourceString.panels.filter((item) => !sameSourcePanel(item, panel));
  const maxOrder = targetString.panels.length + 1;
  const order = Math.max(1, Math.min(Number(requestedOrder) || maxOrder, maxOrder));
  targetString.panels.splice(order - 1, 0, { col: panel.col, row: panel.row, ...(panel.addedLabel ? { addedLabel: panel.addedLabel } : {}) });
  refreshStringAssignments(currentPlan);
  renderMappedPlan();
}

function renderPanelEditor() {
  const panel = getSelectedPanel();
  panelEditorEmpty.hidden = Boolean(panel);
  panelEditorControls.hidden = !panel;
  if (!panel) return;
  const position = selectedPositionKey.split(':').map(Number);
  selectedPanelLabel.textContent = `Selected C${position[0] + 1}/R${currentPlan.layoutHeight - position[1]}`;
  selectedDataString.innerHTML = currentPlan.dataStrings.map((string) => `<option value="${string.id}">String ${string.id} (${string.panels.length}/${string.limit})</option>`).join('') + `<option value="new">＋ New string</option>`;
  selectedDataString.value = String(panel.dataStringId);
  selectedDataOrder.max = String(currentPlan.dataStrings.find((string) => string.id === panel.dataStringId)?.panels.length || 1);
  selectedDataOrder.value = String(panel.dataOrderInString || 1);
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
  applyBoardZoom();
}

function applyBoardZoom() {
  boardZoom = Math.max(0.5, Math.min(1.75, boardZoom));
  document.querySelectorAll('.board-scale-wrap').forEach((wrap) => { wrap.style.zoom = String(boardZoom); });
  zoomLevelEl.textContent = `${Math.round(boardZoom * 100)}%`;
}

function fitBoardToView() {
  const active = boardViewsEl.querySelector('.board-view.active');
  const shell = active?.querySelector('.board-shell');
  const board = active?.querySelector('.board');
  if (!shell || !board) return;
  boardZoom = Math.max(0.5, Math.min(1.75, (shell.clientWidth - 14) / Math.max(1, board.scrollWidth)));
  applyBoardZoom();
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
      card.dataset.kind = kind;
      card.dataset.stringId = String(string.id);
      card.innerHTML = `
        <div class="string-title">
          <h3><span class="swatch" style="background:${string.color}"></span>${title.slice(0, -1)} ${string.id}</h3>
          <div><strong>${kind === 'data' ? `Port ${string.id}` : `20A ${string.id}`}</strong><div class="string-capacity">${string.panels.length}/${string.limit} panels</div></div>
        </div>
        <div class="string-meta">
          <div><strong>Start position:</strong> Col ${first.col + 1}, Row ${plan.layoutHeight - first.row}</div>
          <div><strong>End position:</strong> Col ${last.col + 1}, Row ${plan.layoutHeight - last.row}</div>
          <div><strong>Panels on string:</strong> ${string.panels.length}</div>
          <div><strong>${kind === 'data' ? 'Jumpers' : 'Power jumpers'}:</strong> ${Math.max(0, string.panels.length - 1)}</div>
        </div>
        <p class="string-route codeish"><strong>Route:</strong> ${string.panels.map((panel) => { const position = getStringPanelPosition(plan, panel); return `C${position.col + 1}/R${plan.layoutHeight - position.row}`; }).join(' → ')}</p>`;
      if (kind === 'data') {
        card.addEventListener('dragover', (event) => {
          if (!activeDragPayload || activeDragPayload === 'NEW_PANEL') return;
          event.preventDefault();
          card.classList.add('string-drop-target');
        });
        card.addEventListener('dragleave', () => card.classList.remove('string-drop-target'));
        card.addEventListener('drop', (event) => {
          event.preventDefault();
          card.classList.remove('string-drop-target');
          const positionKey = event.dataTransfer.getData('text/plain') || activeDragPayload;
          if (positionKey && positionKey !== 'NEW_PANEL') movePanelToDataString(positionKey, string.id, string.panels.length + 1);
        });
      }
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
  selectedPositionKey = null;
  panelEditHistory.length = 0;
  undoPanelEditBtn.disabled = true;
  applyPrintSizing(plan);
  renderPrintMeta(plan);
  renderWarnings(plan.warnings);
  renderSummary(plan);
  renderPixelMap(plan);
  renderBoardViews(plan);
  renderStrings(plan);
  renderPanelEditor();
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
  applyBoardZoom();
});

selectedDataString.addEventListener('change', () => {
  if (!selectedPositionKey) return;
  const targetId = selectedDataString.value === 'new' ? currentPlan.dataStrings.length + 1 : Number(selectedDataString.value);
  movePanelToDataString(selectedPositionKey, targetId);
});

selectedDataOrder.addEventListener('change', () => {
  const panel = getSelectedPanel();
  if (panel) movePanelToDataString(selectedPositionKey, panel.dataStringId, Number(selectedDataOrder.value));
});

document.getElementById('move-panel-earlier').addEventListener('click', () => {
  const panel = getSelectedPanel();
  if (panel) movePanelToDataString(selectedPositionKey, panel.dataStringId, panel.dataOrderInString - 1);
});
document.getElementById('move-panel-later').addEventListener('click', () => {
  const panel = getSelectedPanel();
  if (panel) movePanelToDataString(selectedPositionKey, panel.dataStringId, panel.dataOrderInString + 1);
});
document.getElementById('remove-selected-panel').addEventListener('click', () => {
  if (selectedPositionKey) deletePanelAt(selectedPositionKey);
});
undoPanelEditBtn.addEventListener('click', () => {
  const snapshot = panelEditHistory.pop();
  if (snapshot) restorePlan(snapshot);
  undoPanelEditBtn.disabled = panelEditHistory.length === 0;
});
document.getElementById('zoom-out').addEventListener('click', () => { boardZoom -= 0.1; applyBoardZoom(); });
document.getElementById('zoom-in').addEventListener('click', () => { boardZoom += 0.1; applyBoardZoom(); });
document.getElementById('zoom-fit').addEventListener('click', fitBoardToView);

exportPdfBtn.addEventListener('click', () => {
  if (currentPlan) renderPrintMeta(currentPlan);
  window.print();
});

exportPixelMapBtn.addEventListener('click', () => {
  try { downloadPixelMap(); } catch (error) { renderWarnings([error.message]); }
});

exportProjectBtn.addEventListener('click', () => {
  try { exportProject(); } catch (error) { renderWarnings([error.message]); }
});

importProjectBtn.addEventListener('click', () => importProjectFile.click());
importProjectFile.addEventListener('change', async () => {
  try {
    await loadProjectFile(importProjectFile.files?.[0]);
  } catch (error) {
    renderWarnings([error instanceof SyntaxError ? 'The selected file is not valid JSON.' : error.message]);
  } finally {
    importProjectFile.value = '';
  }
});

exportNprjBtn.addEventListener('click', async () => {
  exportNprjBtn.disabled = true;
  setNprjStatus('Building VMP project…');
  try {
    await createNprj();
  } catch (error) {
    setNprjStatus(error.message, true);
  } finally {
    exportNprjBtn.disabled = false;
  }
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
