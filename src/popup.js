const XLSX = require('xlsx');

if (!window.location.search.includes('mode=tab')) {
  chrome.tabs.create({ url: 'src/popup.html?mode=tab' });
  window.close();
}

document.addEventListener('DOMContentLoaded', function() {
  initTabs();
  checkLicenseAccess();
  document.getElementById('confirmBtn').addEventListener('click', confirmData);
  document.getElementById('clearBtn').addEventListener('click', clearData);
  document.getElementById('activateBtn').addEventListener('click', activateLicense);
  document.getElementById('remapBtn').addEventListener('click', applyRemap);
  document.getElementById('copyMachineIDBtn').addEventListener('click', copyMachineID);
  loadMachineID();
  checkLicenseStatus();
});

const STATE = { parsedData: null, detectedCols: [], rawRows: null, rawCols: null };

function checkLicenseAccess() {
  chrome.runtime.sendMessage({ type: 'CHECK_LICENSE' }, res => {
    if (res?.valid) {
      document.getElementById('licenseBlock').classList.add('hidden');
      document.getElementById('appContent').classList.remove('hidden');
      document.getElementById('trialInfo').classList.add('hidden');
      initUpload();
    } else {
      chrome.runtime.sendMessage({ type: 'CHECK_TRIAL' }, trial => {
        const block = document.getElementById('licenseBlock');
        const content = document.getElementById('appContent');
        const trialEl = document.getElementById('trialInfo');
        if (trial.remaining > 0) {
          block.classList.add('hidden');
          content.classList.remove('hidden');
          trialEl.textContent = '🔍 Prueba gratis: te quedan ' + trial.remaining + ' de 50 estudiantes.';
          trialEl.classList.remove('hidden');
          initUpload();
        } else {
          block.classList.remove('hidden');
          content.classList.add('hidden');
        }
      });
    }
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
    document.getElementById('previewSection').classList.remove('hidden');
    showStatus(`${result.records.length} registros cargados desde Excel.`, 'success');
  } catch(err) {
    showStatus(`Error: ${err?.message || err || 'desconocido'}`, 'error');
  }
}

function renderPreview(records) {
  const tbody = document.getElementById('previewBody');
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
  document.getElementById('previewSection').classList.add('hidden');
  document.getElementById('previewBody').innerHTML = '';
  document.getElementById('fileInput').value = '';
  document.getElementById('statusMessage').classList.add('hidden');
  chrome.storage.session.remove(['pendingData', 'injectConfig', 'injectTask']);
}

function loadMachineID() {
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
    btn.textContent = '✓ Copiado';
    setTimeout(() => btn.textContent = orig, 2000);
  });
}

function checkLicenseStatus() {
  chrome.runtime.sendMessage({ type: 'CHECK_LICENSE' }, res => {
    if (res?.valid) {
      const expiryText = res.expiry ? ' (vence ' + res.expiry + ')' : '';
      setLicenseStatus('Licencia activada' + expiryText, 'active');
    } else if (res?.expired) {
      setLicenseStatus('Licencia vencida — solicitá una renovación', 'inactive');
    } else {
      setLicenseStatus('Inactiva — solicitá una licencia', 'inactive');
    }
  });
}

function activateLicense() {
  const token = document.getElementById('licenseInput').value.trim();
  if (!token) { setLicenseStatus('Ingresa el token de licencia', 'inactive'); return; }
  setLicenseStatus('Validando...', 'info');
  chrome.runtime.sendMessage({ type: 'VALIDATE_LICENSE', payload: { token } }, res => {
    if (res?.valid) {
      const expiryText = res.expiry ? ' (vence ' + res.expiry + ')' : '';
      setLicenseStatus('Licencia activada' + expiryText, 'active');
      document.getElementById('licenseInput').value = '';
      checkLicenseAccess();
      // Refresh trial display
    } else if (res?.expired) {
      setLicenseStatus('Token vencido', 'inactive');
    } else {
      setLicenseStatus('Token inválido', 'inactive');
    }
  });
}

function showStatus(msg, type) {
  const el = document.getElementById('statusMessage');
  el.textContent = msg;
  el.className = `status ${type}`;
  el.classList.remove('hidden');
}

function setLicenseStatus(msg, type) {
  const el = document.getElementById('licenseStatus');
  el.textContent = msg;
  el.className = `license-status ${type}`;
}
