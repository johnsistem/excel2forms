const XLSX = require('xlsx');

// ───── i18n ─────
let I18N = {};

function t(key, ...args) {
  let s = I18N[key] || key;
  if (args.length) args.forEach((a, i) => { s = s.replace('{' + i + '}', a); });
  return s;
}

async function loadTranslations(locale) {
  try {
    const resp = await fetch(chrome.runtime.getURL('_locales/' + locale + '/messages.json'));
    const msgs = await resp.json();
    const flat = {};
    for (const [k, v] of Object.entries(msgs)) flat[k] = v.message;
    I18N = flat;
  } catch (e) {
    I18N = {};
  }
}

function applyTranslations(root) {
  if (!root) root = document;
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.placeholder = val;
    } else if (el.tagName === 'OPTION') {
      el.textContent = val;
    } else {
      el.textContent = val;
    }
  });
}

if (!window.location.search.includes('mode=tab')) {
  chrome.tabs.create({ url: 'src/popup.html?mode=tab' });
  window.close();
}

document.addEventListener('DOMContentLoaded', async function() {
  const stored = await new Promise(r => chrome.storage.local.get('locale', res => r(res.locale || 'es')));
  await loadTranslations(stored);
  applyTranslations();
  initTabs();
  checkLicenseAccess();
  document.getElementById('confirmBtn')?.addEventListener('click', confirmData);
  document.getElementById('clearBtn')?.addEventListener('click', clearData);
  document.getElementById('activateBtn')?.addEventListener('click', activateLicense);
  document.getElementById('remapBtn')?.addEventListener('click', applyRemap);
  document.getElementById('copyMachineIDBtn')?.addEventListener('click', copyMachineID);
  loadMachineID();
  checkLicenseStatus();
  initGenericTab();
  checkGenericResume();

  // Language selector
  const langSelect = document.getElementById('langSelect');
  if (langSelect) {
    const stored = await new Promise(r => chrome.storage.local.get('locale', res => r(res.locale || 'es')));
    langSelect.value = stored;
    langSelect.addEventListener('change', async function() {
      await new Promise(r => chrome.storage.local.set({ locale: this.value }, r));
      await loadTranslations(this.value);
      applyTranslations();
      checkLicenseStatus();
    });
  }
});

const STATE = { parsedData: null, detectedCols: [], rawRows: null, rawCols: null };

function checkLicenseAccess() {
  chrome.runtime.sendMessage({ type: 'CHECK_LICENSE' }, res => {
    if (!document.getElementById('appContent')) return;
    document.getElementById('licenseBlock')?.classList.add('hidden');
    document.getElementById('appContent')?.classList.remove('hidden');
    document.getElementById('trialInfo')?.classList.add('hidden');
    initUpload();
  });
}

function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

function initUpload() {
  const zone = document.getElementById('uploadZone');
  if (!zone) return;
  const input = document.getElementById('fileInput');
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  });
  input.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) processFile(file);
  });
}

const SUBJECT_MAP = {
  'EEFF': 'Educación Física y Práctica Deportiva',
  'EF': 'Educación Física y Práctica Deportiva',
  'Ed Fisica': 'Educación Física y Práctica Deportiva',
  'Educacion Fisica': 'Educación Física y Práctica Deportiva',
  'Leng': 'Lengua y Literatura',
  'Lengua': 'Lengua y Literatura',
  'Leng y Lit': 'Lengua y Literatura',
  'Lengua y Lit': 'Lengua y Literatura',
  'Ingles': 'Lengua Extranjera (Inglés)',
  'Inglés': 'Lengua Extranjera (Inglés)',
  'EAEP': 'Educación para Aprender, Emprender, Prosperar',
  'AEP': 'Educación para Aprender, Emprender, Prosperar',
  'EAPEP': 'Educación para Aprender, Emprender, Prosperar',
  'CCNN': 'Ciencias Naturales',
  'C Naturales': 'Ciencias Naturales',
  'CCSS': 'Ciencias Sociales',
  'C Sociales': 'Ciencias Sociales',
  'Cs Sociales': 'Ciencias Sociales',
  'TAC': 'Talleres de Arte y Cultura',
  'CV': 'Creciendo en Valores',
  'DDM': 'Derechos y Dignidad de las Mujeres',
  'VADP': 'VADP',
  'Mat': 'Matemática',
  'Mate': 'Matemática',
  'Bio': 'Biología',
  'Fis': 'Física',
  'Fisica': 'Física',
};

function normalizeName(s) {
  return s.replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

function mapSubjectName(name, mapOverride) {
  const t = name.trim();
  const normal = normalizeName(t);
  const map = mapOverride || SUBJECT_MAP;
  const mapped = map[t] || map[normal] || t;
  if (mapped !== t) console.log('[Digitar] Mapeada materia: "' + t + '" → "' + mapped + '"');
  return mapped;
}

function parseCell(v) {
  const s = String(v).trim();
  const m = s.match(/^(AA|AS|AF|AI|A|B|C|D|F)\s*(\d+(?:[.,]\d+)?)?$/i);
  if (m) return { cualitativo: m[1].toUpperCase(), cuantitativo: m[2] ? parseFloat(m[2].replace(',', '.')) : null };
  const n = parseFloat(s.replace(',', '.'));
  if (!isNaN(n)) return { cualitativo: null, cuantitativo: n };
  return { cualitativo: s || null, cuantitativo: null };
}

function parseExcel(buf) {
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const nonEmpty = rows.filter(r => r.some(c => c !== ''));
  if (nonEmpty.length < 2) return null;

  const nameKw = /nombre|alumno|estudiante|apellido|name|alumnos/i;
  const codeKw = /c[óo]digo|cod|code|matr[ií]cula|identificaci[oó]n/i;
  const promKw = /promedio|total/i;
  const skipKw = /n[°º]|no\.?|#|ord/i;

  let hdr = 0;
  for (let i = 0; i < Math.min(nonEmpty.length, 5); i++) {
    if (nonEmpty[i].some(c => nameKw.test(String(c)))) { hdr = i; break; }
  }
  const cols = nonEmpty[hdr].map(h => String(h).trim());
  console.log('[Digitar] Columnas detectadas:', JSON.stringify(cols));
  console.log('[Digitar] Total columnas:', cols.length);
  const data = rows.slice(hdr + 1).filter(r => r.some(c => String(c).trim() !== ''));

  let nameCol = -1, codeCol = -1, promCol = -1;
  const subjCols = [];
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (nameKw.test(c) && !codeKw.test(c)) { nameCol = i; continue; }
    if (codeKw.test(c)) { codeCol = i; continue; }
    if (promKw.test(c)) { promCol = i; continue; }
    if (skipKw.test(c)) continue;
    subjCols.push(i);
  }
  if (nameCol < 0) nameCol = 0;
  console.log('[Digitar] nameCol=' + nameCol + ' codeCol=' + codeCol + ' promCol=' + promCol + ' subjCols=' + JSON.stringify(subjCols));

  const records = [];
  for (const r of data) {
    const nombre = String(r[nameCol] || '').trim();
    if (!nombre) continue;
    
    // DEBUG: Imprimir la fila cruda leída por XLSX
    console.log(`[Digitar] Fila cruda de ${nombre}:`, JSON.stringify(r));
    console.log(`[Digitar] Largo cols=${cols.length}, largo row=${r.length}`);
    
    const codigo = codeCol >= 0 ? String(r[codeCol] || '').trim() : '';
    const materias = subjCols.filter(i => i !== promCol && cols[i]).map(i => {
      // Las celdas en XLSX `sheet_to_json` con `header: 1` a veces no tienen el mismo índice
      // Si la fila `r` tiene menos elementos que la cabecera `cols`, o si hay desfases por columnas combinadas.
      // Pero si usamos `r[i]` DEBE mapear con `cols[i]` porque `header: 1` devuelve un array puro por índice.
      const rawCell = r[i];
      const cellData = parseCell(rawCell !== undefined ? rawCell : '');
      return {
        nombre: mapSubjectName(cols[i]),
        ...cellData,
      };
    }).filter(m => m.cualitativo || m.cuantitativo !== null); // IMPORTANTE: FILTRO RECUPERADO
    const promedio = promCol >= 0 ? parseCell(r[promCol] !== undefined ? r[promCol] : '') : null;
    records.push({ nombre, codigo, materias, promedio });
  }
  const detectedCols = subjCols.filter(i => i !== promCol && cols[i]).map(i => ({
    original: cols[i],
    mapped: mapSubjectName(cols[i]),
  }));
  return records.length ? { records, detectedCols, rawRows: data, rawCols: cols } : null;
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsArrayBuffer(file);
  });
}

async function processFile(file) {
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    showStatus('Formato no soportado. Usá Excel (.xlsx, .xls).', 'error');
    return;
  }
  try {
    showStatus('Leyendo Excel...', 'info');
    const buf = await readFileAsArrayBuffer(file);
    const result = parseExcel(new Uint8Array(buf));
    if (!result || !result.records || result.records.length === 0) {
      showStatus('No se encontraron datos en el archivo.', 'error');
      return;
    }
    STATE.parsedData = result.records;
    STATE.detectedCols = result.detectedCols || [];
    STATE.rawRows = result.rawRows || null;
    STATE.rawCols = result.rawCols || null;
    renderPreview(result.records);
    renderMapping(result.detectedCols || []);
    document.getElementById('previewSection')?.classList.remove('hidden');
    showStatus(`${result.records.length} registros cargados desde Excel.`, 'success');
  } catch(err) {
    showStatus(`Error: ${err?.message || err || 'desconocido'}`, 'error');
  }
}

function renderPreview(records) {
  const tbody = document.getElementById('previewBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  records.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (r.materias) {
      const items = r.materias.map(m => `${m.nombre}: ${m.cualitativo || ''}${m.cuantitativo != null ? ' ' + m.cuantitativo : ''}`.trim());
      tr.innerHTML = `<td>${i + 1}</td><td>${escHtml(r.nombre || '---')}</td><td>${escHtml(r.codigo || '')}</td><td style="font-size:11px;line-height:1.6">${items.map(escHtml).join('<br>')}</td>`;
    } else {
      tr.innerHTML = `<td>${i + 1}</td><td>${escHtml(r.nombre || '---')}</td><td></td><td>${escHtml((r.notas || '---').slice(0, 60))}</td>`;
    }
    tbody.appendChild(tr);
  });
}

function renderMapping(cols) {
  const section = document.getElementById('mappingSection');
  const list = document.getElementById('mappingList');
  if (!section || !list) return;
  if (!cols.length) { section.classList.add('hidden'); return; }
  list.innerHTML = '';
  cols.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'mapping-row';
    row.innerHTML = `<span class="orig">${escHtml(c.original)}</span><span class="arrow">→</span><input type="text" class="map-input" data-idx="${i}" value="${escHtml(c.mapped)}">`;
    list.appendChild(row);
  });
  section.classList.remove('hidden');
}

function applyRemap() {
  const inputs = document.querySelectorAll('#mappingList .map-input');
  if (!inputs.length) return;
  const userMap = {};
  inputs.forEach(inp => {
    const idx = parseInt(inp.dataset.idx, 10);
    const orig = STATE.detectedCols[idx]?.original;
    if (orig) userMap[orig] = inp.value.trim();
  });
  // Rebuild records from raw data with user mapping
  if (STATE.rawRows && STATE.rawCols) {
    const rebuilt = rebuildWithMapping(STATE.rawRows, STATE.rawCols, userMap);
    STATE.parsedData = rebuilt;
    renderPreview(rebuilt);
    showStatus('Mapeo re-aplicado. Revisá la tabla.', 'info');
  }
}

function rebuildWithMapping(rows, cols, userMap) {
  function mapName(n) {
    const t = n.trim();
    // User mapping has priority
    if (userMap[t]) return userMap[t];
    // Then auto-map
    const normal = normalizeName(t);
    return SUBJECT_MAP[t] || SUBJECT_MAP[normal] || t;
  }
  const nameKw = /nombre|alumno|estudiante|apellido|name|alumnos/i;
  const codeKw = /c[óo]digo|cod|code|matr[ií]cula|identificaci[oó]n/i;
  const promKw = /promedio|total/i;
  const skipKw = /n[°º]|no\.?|#|ord/i;
  let nameCol = -1, codeCol = -1, promCol = -1;
  const subjCols = [];
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (nameKw.test(c) && !codeKw.test(c)) { nameCol = i; continue; }
    if (codeKw.test(c)) { codeCol = i; continue; }
    if (promKw.test(c)) { promCol = i; continue; }
    if (skipKw.test(c)) continue;
    subjCols.push(i);
  }
  if (nameCol < 0) nameCol = 0;
  const records = [];
  for (const r of rows) {
    const nombre = String(r[nameCol] || '').trim();
    if (!nombre) continue;
    const codigo = codeCol >= 0 ? String(r[codeCol] || '').trim() : '';
    const materias = subjCols.filter(i => i !== promCol && cols[i]).map(i => {
      const rawCell = r[i];
      const cellData = parseCell(rawCell !== undefined ? rawCell : '');
      return {
        nombre: mapName(cols[i]),
        ...cellData,
      };
    }).filter(m => m.cualitativo || m.cuantitativo !== null); // IMPORTANTE: FILTRO RECUPERADO
    const promedio = promCol >= 0 ? parseCell(r[promCol] !== undefined ? r[promCol] : '') : null;
    records.push({ nombre, codigo, materias, promedio });
  }
  return records;
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function confirmData() {
  if (!document.getElementById('confirmBtn')) return;
  if (!STATE.parsedData || STATE.parsedData.length === 0) {
    showStatus('No hay datos.', 'error');
    return;
  }
  const count = STATE.parsedData.length;
  chrome.runtime.sendMessage({ type: 'CHECK_LICENSE' }, res => {
    if (res?.valid) {
      doInject(count);
    } else {
      chrome.runtime.sendMessage({ type: 'CHECK_TRIAL' }, trial => {
        if (trial.remaining >= count) {
          chrome.runtime.sendMessage({ type: 'USE_TRIAL', payload: { count } }, useResult => {
            if (useResult.allowed) {
              doInject(count);
            } else {
              showStatus('Solo te quedan ' + useResult.remaining + ' estudiantes de prueba.', 'error');
            }
          });
        } else {
          if (trial.remaining <= 0) {
            showStatus('Límite de prueba alcanzado (50 estudiantes). Activá una licencia en Configuración.', 'error');
          } else {
            showStatus('Solo te quedan ' + trial.remaining + ' estudiantes de prueba. Cargá un archivo más pequeño.', 'error');
          }
        }
      });
    }
  });
}

function doInject(count) {
  if (!document.getElementById('confirmBtn')) return;
  console.log('[Digitar] ***** DATOS A ENVIAR *****');
  STATE.parsedData.forEach((r, idx) => {
    console.log('[Digitar] Estudiante #' + (idx+1) + ': ' + r.nombre + ' (' + r.codigo + ')');
    r.materias.forEach((m, mi) => {
      console.log('[Digitar]   [' + mi + '] ' + m.nombre + ' → cual=' + m.cualitativo + ' cuant=' + m.cuantitativo);
    });
  });
  console.log('[Digitar] ***** FIN DATOS *****');
  const mode = document.getElementById('modeSelect').value;
  const speed = parseInt(document.getElementById('speedRange').value, 10);
  chrome.storage.session.set({
    injectTask: {
      data: STATE.parsedData,
      config: { mode, speed },
      index: 0
    }
  }, () => {
    showStatus('Datos listos (' + count + ' registros, modo ' + mode + '). Enviando...', 'info');
    chrome.runtime.sendMessage({
      type: 'INJECT_START',
      payload: { mode, speed }
    }, (res) => {
      if (res?.ok) showStatus('Inyectando ' + count + ' registros (' + mode + ')...', 'success');
      else if (res?.error) showStatus(res.error, 'error');
    });
  });
}

function clearData() {
  STATE.parsedData = null;
  hide('previewSection');
  empty('previewBody');
  clearVal('fileInput');
  hide('statusMessage');
  chrome.storage.session.remove(['pendingData', 'injectConfig', 'injectTask']);
}
function hide(id) { const el = document.getElementById(id); if (el) el.classList.add('hidden'); }
function empty(id) { const el = document.getElementById(id); if (el) el.innerHTML = ''; }
function clearVal(id) { const el = document.getElementById(id); if (el) el.value = ''; }

function loadMachineID() {
  if (!document.getElementById('machineIDDisplay')) return;
  chrome.runtime.sendMessage({ type: 'GET_MACHINE_ID' }, res => {
    const el = document.getElementById('machineIDDisplay');
    if (res?.id) {
      el.textContent = res.id;
      el.dataset.id = res.id;
    } else {
      el.textContent = 'Error al obtener ID';
    }
  });
}

function copyMachineID() {
  const id = document.getElementById('machineIDDisplay')?.dataset.id;
  if (!id) return;
  navigator.clipboard.writeText(id).then(() => {
    const btn = document.getElementById('copyMachineIDBtn');
    const orig = btn.textContent;
    btn.textContent = t('copied');
    setTimeout(() => btn.textContent = orig, 2000);
  });
}

function checkLicenseStatus() {
  chrome.runtime.sendMessage({ type: 'CHECK_LICENSE' }, res => {
    const section = document.getElementById('licenseActivationSection');
    if (res?.valid) {
      const expiryText = res.expiry ? t('licenseExpiry', res.expiry) : '';
      setLicenseStatus(t('licenseActive') + expiryText, 'active');
      if (section) section.classList.add('hidden');
    } else if (res?.expired) {
      setLicenseStatus(t('licenseExpired'), 'inactive');
      if (section) section.classList.remove('hidden');
    } else {
      setLicenseStatus(t('licenseInactive'), 'inactive');
      if (section) section.classList.remove('hidden');
    }
  });
}

function activateLicense() {
  const token = document.getElementById('licenseInput').value.trim();
  if (!token) { setLicenseStatus(t('licenseEnterToken'), 'inactive'); return; }
  setLicenseStatus(t('licenseValidating'), 'info');
  chrome.runtime.sendMessage({ type: 'VALIDATE_LICENSE', payload: { token } }, res => {
    if (res?.valid) {
      const expiryText = res.expiry ? t('licenseExpiry', res.expiry) : '';
      setLicenseStatus(t('licenseActive') + expiryText, 'active');
      document.getElementById('licenseInput').value = '';
      const section = document.getElementById('licenseActivationSection');
      if (section) section.classList.add('hidden');
      checkLicenseAccess();
    } else if (res?.expired) {
      setLicenseStatus(t('licenseTokenExpired'), 'inactive');
    } else {
      setLicenseStatus(t('licenseTokenInvalid'), 'inactive');
    }
  });
}

function showStatus(msg, type) {
  const el = document.getElementById('statusMessage');
  if (!el) return;
  el.textContent = msg;
  el.className = `status ${type}`;
  el.classList.remove('hidden');
}

function setLicenseStatus(msg, type) {
  const el = document.getElementById('licenseStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = `license-status ${type}`;
}

// ───── Formulario Genérico ─────
const GF = {
  excelData: null,
  excelCols: [],
  detectedFields: [],
  detectedButtons: [],
  fileName: '',
};

function gfShowStatus(msg, type) {
  const el = document.getElementById('gfStatusMessage');
  if (!el) return;
  el.textContent = msg;
  el.className = `status ${type}`;
  el.classList.remove('hidden');
}

function initGenericTab() {
  const zone = document.getElementById('gfUploadZone');
  const input = document.getElementById('gfFileInput');
  if (!zone) return;
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processFileGeneric(file);
  });
  input.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) processFileGeneric(file);
  });
  document.getElementById('gfDetectBtn').addEventListener('click', detectFields);
  document.getElementById('gfExecuteBtn').addEventListener('click', executeGenericFill);
  document.getElementById('gfStopBtn').addEventListener('click', stopGenericFill);
  document.getElementById('gfSaveConfigBtn').addEventListener('click', saveGenericConfig);
  document.getElementById('gfLoadConfigBtn').addEventListener('click', loadGenericConfigs);
}

async function processFileGeneric(file) {
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    gfShowStatus(t('genericFormatError'), 'error');
    return;
  }
  try {
    gfShowStatus(t('genericReading'), 'info');
    const buf = await readFileAsArrayBuffer(file);
    const result = parseExcelGeneric(new Uint8Array(buf));
    if (!result || !result.rows || result.rows.length === 0) {
      gfShowStatus(t('genericNoData'), 'error');
      return;
    }
    GF.excelData = result.rows;
    GF.excelCols = result.cols;
    GF.fileName = file.name;
    renderGenericPreview(result.rows, result.cols);
    document.getElementById('gfPreviewSection').classList.remove('hidden');
    // Re-render mapping if fields already detected
    if (GF.detectedFields.length > 0) renderMappingUI();
    gfShowStatus(t('recordsLoaded', result.rows.length), 'success');
  } catch(err) {
    gfShowStatus(t('genericError', err?.message || err || t('unknown')), 'error');
  }
}

function parseExcelGeneric(buf) {
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const nonEmpty = rows.filter(r => r.some(c => c !== ''));
  if (nonEmpty.length < 2) return null;
  const cols = nonEmpty[0].map(h => String(h).trim()).filter(Boolean);
  const dataRows = nonEmpty.slice(1).filter(r => r.some(c => String(c).trim() !== ''));
  const result = dataRows.map(r => {
    const obj = {};
    cols.forEach((col, i) => { obj[col] = r[i] !== undefined ? String(r[i]).trim() : ''; });
    return obj;
  });
  return { rows: result, cols };
}

function renderGenericPreview(rows, cols) {
  const tbody = document.getElementById('gfPreviewBody');
  tbody.innerHTML = '';
  const summary = cols.join(', ');
  rows.slice(0, 15).forEach((r, i) => {
    const tr = document.createElement('tr');
    const vals = cols.map(c => (r[c] || '').slice(0, 25)).join(' | ');
    tr.innerHTML = `<td style="padding:4px 8px;border-bottom:1px solid #374151;color:#9ca3af;font-size:11px">${i + 1}</td><td style="padding:4px 8px;border-bottom:1px solid #374151;color:#d1d5db;font-size:11px">${escHtml(vals)}</td>`;
    tbody.appendChild(tr);
  });
}

function detectFields() {
  const btn = document.getElementById('gfDetectBtn');
  btn.disabled = true;
  btn.textContent = t('detecting');
  chrome.runtime.sendMessage({ type: 'DETECT_FIELDS' }, res => {
    btn.disabled = false;
    btn.textContent = '🔍 Detectar Campos en la Página';
    if (res?.fields) {
      GF.detectedFields = res.fields;
      GF.detectedButtons = res.buttons || [];
      renderDetectedFields(res.fields);
      renderDetectedButtons(GF.detectedButtons);
      renderMappingUI();
      gfShowStatus(t('fieldsDetected', res.fields.length, GF.detectedButtons.length), 'success');
    } else if (res?.error) {
      gfShowStatus(res.error, 'error');
    } else {
      gfShowStatus(t('genericNoFields'), 'error');
    }
  });
}

function renderDetectedFields(fields) {
  const list = document.getElementById('gfFieldsList');
  list.innerHTML = '';
  fields.forEach(f => {
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 6px;margin-bottom:3px;background:#1f2937;border-radius:4px;font-size:11px';
    div.innerHTML = `<code style="color:#f59e0b;font-size:11px">${escHtml(f.selector)}</code> <span style="color:#d1d5db;flex:1">${escHtml(f.label)}</span> <span style="color:#6b7280;font-size:10px">${f.tag}${f.type ? `[${f.type}]` : ''}</span>`;
    list.appendChild(div);
  });
  document.getElementById('gfFieldsSection').classList.remove('hidden');
}

function renderDetectedButtons(buttons) {
  const list = document.getElementById('gfButtonsList');
  if (!list) return;
  list.innerHTML = '';
  buttons.forEach(b => {
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 6px;margin-bottom:3px;background:#1f2937;border-radius:4px;font-size:11px';
    div.innerHTML = `<code style="color:#34d399;font-size:11px">${b.selector}</code> <span style="color:#d1d5db;flex:1">${escHtml(b.label)}</span>`;
    div.onclick = () => {
      document.getElementById('gfSubmitSelector').value = b.selector;
      gfShowStatus(t('genericButtonSelected', b.label), 'info');
    };
    list.appendChild(div);
  });
  document.getElementById('gfButtonsSection').classList.toggle('hidden', buttons.length === 0);
}

function renderMappingUI() {
  const container = document.getElementById('gfMappingContainer');
  container.innerHTML = '';
  document.getElementById('gfMappingSection').classList.remove('hidden');
  if (GF.excelCols.length === 0) {
    container.innerHTML = '<p style="color:#9ca3af;font-size:12px">Cargá un Excel primero para ver las columnas disponibles.</p>';
    return;
  }
  if (GF.detectedFields.length === 0) {
    container.innerHTML = '<p style="color:#9ca3af;font-size:12px">Primero detectá los campos de la página.</p>';
    return;
  }
  GF.excelCols.forEach(col => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px';
    const label = document.createElement('span');
    label.style.cssText = 'min-width:80px;font-weight:600;color:#d1d5db;background:#374151;padding:2px 6px;border-radius:3px;text-align:center;font-size:11px';
    label.textContent = col;
    const arrow = document.createElement('span');
    arrow.style.cssText = 'color:#6b7280;font-size:11px';
    arrow.textContent = '→';
    const select = document.createElement('select');
    select.style.cssText = 'flex:1;padding:3px 6px;border:1px solid #4b5563;border-radius:4px;font-size:11px;background:#111827;color:#e5e7eb';
    select.innerHTML = '<option value="">— Sin mapear —</option>';
    GF.detectedFields.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.selector;
      opt.textContent = `${f.label} (${f.selector})`;
      select.appendChild(opt);
    });
    row.appendChild(label);
    row.appendChild(arrow);
    row.appendChild(select);
    container.appendChild(row);
  });
}

function buildMapping() {
  const selects = document.querySelectorAll('#gfMappingContainer select');
  const mapping = [];
  selects.forEach((sel, i) => {
    if (sel.value && GF.excelCols[i]) {
      mapping.push({ excelColumn: GF.excelCols[i], selector: sel.value });
    }
  });
  return mapping;
}

function saveGenericConfig() {
  const name = prompt('Nombre para esta configuración:', GF.fileName || 'Config');
  if (!name) return;
  const mapping = buildMapping();
  if (mapping.length === 0) {
    gfShowStatus(t('genericNoMapping'), 'error');
    return;
  }
  const mode = document.getElementById('gfModeSelect').value;
  const delay = parseInt(document.getElementById('gfSpeedRange').value, 10);
  const submitSelector = document.getElementById('gfSubmitSelector').value.trim() || '';
  const showSummary = document.getElementById('gfShowSummary').checked;
  const config = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name,
    fields: mapping,
    mode,
    delay,
    submitSelector,
    showSummary,
  };
  chrome.storage.local.get('genericConfigs', result => {
    const configs = result.genericConfigs || [];
    configs.push(config);
    chrome.storage.local.set({ genericConfigs: configs }, () => {
      gfShowStatus(t('genericConfigSaved', name), 'success');
    });
  });
}

function loadGenericConfigs() {
  chrome.storage.local.get('genericConfigs', result => {
    const configs = result.genericConfigs || [];
    const container = document.getElementById('gfConfigList');
    container.innerHTML = '';
    if (configs.length === 0) {
      container.innerHTML = '<p style="color:#9ca3af;font-size:12px">No hay configuraciones guardadas.</p>';
    } else {
      configs.forEach((cfg, i) => {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 6px;margin-bottom:3px;background:#1f2937;border-radius:4px';
        div.innerHTML = `<span style="flex:1;color:#d1d5db;font-size:11px">${escHtml(cfg.name)} (${cfg.fields.length} campos)</span>
          <button style="background:#3b82f6;color:#fff;border:none;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:10px" data-idx="${i}">Cargar</button>
          <button style="background:#ef4444;color:#fff;border:none;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:10px" data-idx="${i}">Eliminar</button>`;
        div.querySelectorAll('button')[0].onclick = () => applyGenericConfig(cfg);
        div.querySelectorAll('button')[1].onclick = () => deleteGenericConfig(i);
        container.appendChild(div);
      });
    }
    document.getElementById('gfConfigSection').classList.remove('hidden');
  });
}

function applyGenericConfig(cfg) {
  const selects = document.querySelectorAll('#gfMappingContainer select');
  selects.forEach(sel => {
    const row = sel.closest('div');
    const colLabel = row?.querySelector('span')?.textContent;
    const match = cfg.fields.find(f => f.excelColumn === colLabel);
    if (match) sel.value = match.selector;
  });
  document.getElementById('gfModeSelect').value = cfg.mode || 'auto';
  document.getElementById('gfSpeedRange').value = cfg.delay || 500;
  document.getElementById('gfSubmitSelector').value = cfg.submitSelector || '';
  document.getElementById('gfShowSummary').checked = cfg.showSummary !== false;
  gfShowStatus(t('genericConfigLoaded', cfg.name), 'success');
}

function deleteGenericConfig(idx) {
  chrome.storage.local.get('genericConfigs', result => {
    const configs = result.genericConfigs || [];
    configs.splice(idx, 1);
    chrome.storage.local.set({ genericConfigs: configs }, () => {
      loadGenericConfigs();
      gfShowStatus(t('genericConfigDeleted'), 'info');
    });
  });
}

function executeGenericFill(startIndex, savedFields) {
  if (typeof startIndex !== 'number' || startIndex < 0) startIndex = 0;
  if (!GF.excelData || GF.excelData.length === 0) {
    gfShowStatus(t('noExcelData'), 'error');
    return;
  }
  let mapping;
  if (startIndex > 0 && savedFields && savedFields.length > 0) {
    mapping = savedFields;
  } else {
    mapping = buildMapping();
    if (mapping.length === 0) {
      gfShowStatus(t('noMappingAssigned'), 'error');
      return;
    }
  }
  const mode = document.getElementById('gfModeSelect').value;
  const delay = parseInt(document.getElementById('gfSpeedRange').value, 10);
  const submitSelector = document.getElementById('gfSubmitSelector').value.trim() || '';
  const showSummary = document.getElementById('gfShowSummary').checked;
  const checkpoint = {
    index: startIndex,
    total: GF.excelData.length,
    processed: startIndex > 0 ? startIndex : 0,
    failed: 0,
    rows: GF.excelData,
    fields: mapping,
    config: { mode, delay, submitSelector, showSummary },
    fileName: GF.fileName,
    status: 'running',
    timestamp: Date.now()
  };
  chrome.storage.local.set({ genericFillState: checkpoint });
  gfShowStatus(startIndex > 0 ? t('resumeStarting', startIndex + 1) : t('executingRecords', GF.excelData.length), 'info');
  chrome.runtime.sendMessage({
    type: 'GENERIC_FILL_START',
    payload: { rows: GF.excelData, fields: mapping, config: { mode, delay, submitSelector, showSummary }, startIndex }
  }, res => {
    if (res?.ok) {
      if (startIndex === 0) gfShowStatus(t('genericInjecting', GF.excelData.length), 'success');
    }
    else if (res?.error) gfShowStatus(res.error, 'error');
  });
}

function stopGenericFill() {
  chrome.runtime.sendMessage({ type: 'GENERIC_FILL_STOP' });
  chrome.storage.local.remove('genericFillState');
  gfShowStatus(t('genericStopped'), 'info');
}

function checkGenericResume() {
  chrome.storage.local.get('genericFillState', res => {
    const state = res.genericFillState;
    if (!state || state.status !== 'running' || state.index >= state.total) return;
    document.getElementById('gfResumeBanner').classList.remove('hidden');
    document.getElementById('gfResumeText').textContent = t('resumeText', state.index, state.total);
    document.getElementById('gfResumeBtn').onclick = () => {
      document.getElementById('gfResumeBanner').classList.add('hidden');
      GF.excelData = state.rows;
      GF.fileName = state.fileName || '';
      document.getElementById('gfModeSelect').value = state.config.mode;
      document.getElementById('gfSpeedRange').value = state.config.delay;
      document.getElementById('gfSubmitSelector').value = state.config.submitSelector || '';
      document.getElementById('gfShowSummary').checked = state.config.showSummary !== false;
      executeGenericFill(state.index, state.fields);
    };
    document.getElementById('gfRestartBtn').onclick = () => {
      document.getElementById('gfResumeBanner').classList.add('hidden');
      chrome.storage.local.remove('genericFillState');
      chrome.runtime.sendMessage({ type: 'GENERIC_FILL_STOP' });
    };
  });
}
