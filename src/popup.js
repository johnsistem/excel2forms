const Tesseract = require('tesseract.js');
const XLSX = require('xlsx');
const BASE = '../';

if (!window.location.search.includes('mode=tab')) {
  chrome.tabs.create({ url: 'src/popup.html?mode=tab' });
  window.close();
}

document.addEventListener('DOMContentLoaded', function() {
  initTabs();
  initUpload();
  document.getElementById('confirmBtn').addEventListener('click', confirmData);
  document.getElementById('clearBtn').addEventListener('click', clearData);
  document.getElementById('activateBtn').addEventListener('click', activateLicense);
  document.getElementById('remapBtn').addEventListener('click', applyRemap);
});

const STATE = { parsedData: null, detectedCols: [], rawRows: null, rawCols: null };

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

  const records = [];
  for (const r of data) {
    const nombre = String(r[nameCol] || '').trim();
    if (!nombre) continue;
    const codigo = codeCol >= 0 ? String(r[codeCol] || '').trim() : '';
    const materias = subjCols.filter(i => i !== promCol && cols[i]).map(i => ({
      nombre: mapSubjectName(cols[i]),
      ...parseCell(r[i]),
    })).filter(m => m.cualitativo || m.cuantitativo !== null);
    const promedio = promCol >= 0 ? parseCell(r[promCol]) : null;
    records.push({ nombre, codigo, materias, promedio });
  }
  const detectedCols = subjCols.filter(i => i !== promCol && cols[i]).map(i => ({
    original: cols[i],
    mapped: mapSubjectName(cols[i]),
  }));
  return records.length ? { records, detectedCols, rawRows: data, rawCols: cols } : null;
}

function preprocessForAI(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let w = img.width, h = img.height;
      const maxDim = 2048;
      if (w > maxDim || h > maxDim) {
        const s = maxDim / Math.max(w, h);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error('Error al cargar imagen'));
    img.src = dataUrl;
  });
}

async function recognizeWithAI(canvas) {
  if (typeof LanguageModel === 'undefined') return null;
  try {
    const avail = await LanguageModel.availability({
      expectedInputs: [{ type: 'text' }, { type: 'image' }],
      expectedOutputs: [{ type: 'text' }],
    });
    if (avail !== 'readily') return null;
    const session = await LanguageModel.create({
      systemPrompt: 'Eres un asistente experto en leer actas de calificaciones de MINED Nicaragua. Extrae CADA ESTUDIANTE con su nombre completo y notas.',
      temperature: 0.1,
      expectedInputs: [{ type: 'text' }, { type: 'image' }],
      expectedOutputs: [{ type: 'text' }],
    });
    const result = await session.prompt([
      {
        role: 'user',
        content: [
          { type: 'text', value: 'Extrae todos los estudiantes y sus notas de esta acta. Devuelve SOLO un arreglo JSON válido: [{ "nombre": "...", "notas": "..." }]. Sin explicaciones, solo JSON.' },
          { type: 'image', value: canvas },
        ],
      },
    ]);
    session.destroy();
    return result;
  } catch (e) {
    console.warn('window.ai error:', e);
    return null;
  }
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
  const isExcel = /\.(xlsx|xls)$/i.test(file.name);
  const isImage = file.type.startsWith('image/');

  if (!isExcel && !isImage) {
    showStatus('Formato no soportado. Usa Excel (.xlsx, .xls) o imagen.', 'error');
    return;
  }

  try {
    if (isExcel) {
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
      return;
    }

    showStatus('Procesando imagen...', 'info');
    const dataUrl = await readFileAsDataURL(file);
    const canvas = await preprocessForAI(dataUrl);

    let text;
    let source = 'ai';

    showStatus('Analizando con AI...', 'info');
    text = await recognizeWithAI(canvas);

    if (!text) {
      showStatus('AI no disponible, usando Tesseract...', 'info');
      source = 'tesseract';

      const worker = await Promise.race([
        Tesseract.createWorker('spa', 0, {
          workerPath: `${BASE}tesseract/worker-bundle.js`,
          corePath: `${BASE}tesseract/`,
          langPath: `${BASE}tessdata`,
          workerBlobURL: false,
          gzip: false,
          logger: (m) => {
            showStatus(`Tesseract: ${m.status}${m.progress ? ' ' + Math.round(m.progress * 100) + '%' : ''}`, 'info');
          }
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout (2 min)')), 120000)
        )
      ]);

      showStatus('Reconociendo...', 'info');
      const { data: tessData } = await worker.recognize(canvas, { tessedit_pageseg_mode: '6' });
      await worker.terminate();
      text = tessData.text;
    }

    let parsed;
    if (source === 'ai' && text) {
      try {
        const jsonStart = text.indexOf('[');
        const jsonEnd = text.lastIndexOf(']') + 1;
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          parsed = JSON.parse(text.slice(jsonStart, jsonEnd));
        } else {
          parsed = parseGrades(text);
        }
      } catch (_) {
        parsed = parseGrades(text);
      }
    } else {
      parsed = parseGrades(text);
    }

    if (!parsed || parsed.length === 0) {
      showStatus('No se detectaron registros.', 'error');
      return;
    }

    STATE.parsedData = parsed;
    STATE.detectedCols = [];
    renderPreview(parsed);
    document.getElementById('mappingSection')?.classList.add('hidden');
    document.getElementById('previewSection').classList.remove('hidden');
    showStatus(`Se detectaron ${parsed.length} registros.`, 'success');
  } catch(err) {
    showStatus(`Error: ${err?.message || err || 'desconocido'}`, 'error');
  }
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsDataURL(file);
  });
}

function parseGrades(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const records = [];
  let current = {};
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const scoreMatch = t.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*$/);
    const name = scoreMatch ? t.slice(0, t.lastIndexOf(scoreMatch[1])).trim() : t;
    if (scoreMatch && name.length > 2) {
      if (current.nombre) records.push(current);
      current = { nombre: name, notas: scoreMatch[1] };
    } else if (current.nombre) {
      current.notas += ' ' + t;
    }
  }
  if (current.nombre) records.push(current);
  return records.length > 0 ? records : text.split('\n').filter(l => l.trim()).map((l, i) => ({ nombre: `Registro ${i + 1}`, notas: l.slice(0, 60) }));
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
    const normal = t.replace(/\./g, '').replace(/\s+/g, ' ').trim();
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
    const materias = subjCols.filter(i => i !== promCol && cols[i]).map(i => ({
      nombre: mapName(cols[i]),
      ...parseCell(r[i]),
    })).filter(m => m.cualitativo || m.cuantitativo !== null);
    const promedio = promCol >= 0 ? parseCell(r[promCol]) : null;
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
  if (STATE.parsedData && STATE.parsedData.length > 0) {
    const mode = document.getElementById('modeSelect').value;
    const speed = parseInt(document.getElementById('speedRange').value, 10);
    chrome.storage.session.set({
      injectTask: {
        data: STATE.parsedData,
        config: { mode, speed },
        index: 0
      }
    }, () => {
      showStatus(`Datos listos (${STATE.parsedData.length} registros, modo ${mode}). Enviando...`, 'info');
      chrome.runtime.sendMessage({
        type: 'INJECT_START',
        payload: { mode, speed }
      }, (res) => {
        if (res?.ok) showStatus(`Inyectando ${STATE.parsedData.length} registros (${mode})...`, 'success');
        else if (res?.error) showStatus(res.error, 'error');
      });
    });
  } else {
    showStatus('No hay datos.', 'error');
  }
}

function clearData() {
  STATE.parsedData = null;
  document.getElementById('previewSection').classList.add('hidden');
  document.getElementById('previewBody').innerHTML = '';
  document.getElementById('fileInput').value = '';
  document.getElementById('statusMessage').classList.add('hidden');
  chrome.storage.session.remove(['pendingData', 'injectConfig', 'injectTask']);
}

function activateLicense() {
  const token = document.getElementById('licenseInput').value.trim();
  if (!token) { setLicenseStatus('Ingresa un token', 'inactive'); return; }
  chrome.runtime.sendMessage({ type: 'VALIDATE_LICENSE', payload: { token } }, res => {
    if (res.valid) {
      setLicenseStatus('Licencia activada', 'active');
      chrome.storage.session.set({ licenseToken: token });
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
