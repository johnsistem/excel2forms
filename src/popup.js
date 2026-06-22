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

function initTheme() {
  const saved = localStorage.getItem('excel2forms-theme') || 'dark';
  applyTheme(saved);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = theme === 'light' ? '☀️' : '🌙';
  localStorage.setItem('excel2forms-theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

document.addEventListener('DOMContentLoaded', async function() {
  const stored = await new Promise(r => chrome.storage.local.get('locale', res => r(res.locale || 'es')));
  await loadTranslations(stored);
  applyTranslations();
  initTheme();
  initTabs();
  checkLicenseAccess();
  document.getElementById('activateBtn')?.addEventListener('click', activateLicense);
  const licInput = document.getElementById('licenseInput');
  if (licInput) {
    licInput.addEventListener('input', () => {
      document.getElementById('activateBtn').disabled = !licInput.value.trim();
    });
  }
  document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
  checkLicenseStatus();
  initGenericTab();
  checkGenericResume();

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'GENERIC_FILL_STOPPED') setGenericRunning(false);
  });

  const link = document.getElementById('licenseInfoLink');
  if (link) link.href = 'https://nocodeapps.carrd.co/';

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

function checkLicenseAccess() {
  chrome.runtime.sendMessage({ type: 'CHECK_LICENSE' }, res => {
    if (res?.valid) {
      document.getElementById('licenseBlock')?.classList.add('hidden');
      document.getElementById('trialInfo')?.classList.add('hidden');
      document.getElementById('tab-generic')?.classList.remove('hidden');
    } else {
      chrome.runtime.sendMessage({ type: 'CHECK_TRIAL' }, trial => {
        if (trial.remaining > 0) {
          document.getElementById('licenseBlock')?.classList.add('hidden');
          document.getElementById('tab-generic')?.classList.remove('hidden');
          const trialInfo = document.getElementById('trialInfo');
          if (trialInfo) {
            trialInfo.classList.remove('hidden');
            trialInfo.textContent = t('trialRemaining', trial.remaining);
          }
        } else {
          document.getElementById('licenseBlock')?.classList.remove('hidden');
          document.getElementById('tab-generic')?.classList.add('hidden');
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

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsArrayBuffer(file);
  });
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function checkLicenseStatus() {
  chrome.runtime.sendMessage({ type: 'CHECK_LICENSE' }, res => {
    const section = document.getElementById('licenseInputSection');
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
  if (!token) return;
  setLicenseStatus(t('licenseValidating'), 'info');
  chrome.runtime.sendMessage({ type: 'VALIDATE_LICENSE', payload: { token } }, res => {
    if (res?.valid) {
      const expiryText = res.expiry ? t('licenseExpiry', res.expiry) : '';
      setLicenseStatus(t('licenseActive') + expiryText, 'active');
      document.getElementById('licenseInput').value = '';
      document.getElementById('activateBtn').disabled = true;
      document.getElementById('licenseInputSection')?.classList.add('hidden');
      checkLicenseAccess();
    } else if (res?.expired) {
      setLicenseStatus(t('licenseTokenExpired'), 'inactive');
    } else {
      setLicenseStatus(t('licenseTokenInvalid'), 'inactive');
    }
  });
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
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    gfShowStatus(t('genericFormatError'), 'error');
    return;
  }
  try {
    gfShowStatus(t('genericReading'), 'info');
    let result;
    if (/\.csv$/i.test(file.name)) {
      const text = await file.text();
      result = parseCsvGeneric(text);
    } else {
      const buf = await readFileAsArrayBuffer(file);
      result = parseExcelGeneric(new Uint8Array(buf));
    }
    if (!result || !result.rows || result.rows.length === 0) {
      gfShowStatus(t('genericNoData'), 'error');
      return;
    }
    GF.excelData = result.rows;
    GF.excelCols = result.cols;
    GF.fileName = file.name;
    renderGenericPreview(result.rows, result.cols);
    document.getElementById('gfPreviewSection').classList.remove('hidden');
    if (GF.detectedFields.length > 0) renderMappingUI();
    gfShowStatus(t('recordsLoaded', result.rows.length), 'success');
  } catch(err) {
    gfShowStatus(t('genericError', err?.message || err || t('unknown')), 'error');
  }
}

function parseCsvGeneric(csvText) {
  const lines = csvText.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return null;
  const cols = parseCsvLine(lines[0]);
  const dataRows = lines.slice(1).filter(l => l.trim());
  const rows = dataRows.map(line => {
    const vals = parseCsvLine(line);
    const obj = {};
    cols.forEach((c, i) => { obj[c] = i < vals.length ? vals[i].trim() : ''; });
    return obj;
  });
  return { rows, cols };
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current);
  return result;
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
    tr.innerHTML = `<td style="padding:4px 8px;border-bottom:1px solid var(--border);color:var(--text-secondary);font-size:11px">${i + 1}</td><td style="padding:4px 8px;border-bottom:1px solid var(--border);color:var(--text-light);font-size:11px">${escHtml(vals)}</td>`;
    tbody.appendChild(tr);
  });
}

function detectFields() {
  const btn = document.getElementById('gfDetectBtn');
  btn.disabled = true;
  btn.textContent = t('detecting');
  chrome.runtime.sendMessage({ type: 'DETECT_FIELDS' }, res => {
    btn.disabled = false;
    btn.textContent = t('detectFields');
    if (res?.fields) {
      GF.detectedFields = res.fields;
      GF.detectedButtons = res.buttons || [];
      renderDetectedFields(res.fields);
      renderDetectedButtons(GF.detectedButtons);
      renderMappingUI();
      // Auto-assign detected buttons to slots
      if (res.autoGuardar) document.getElementById('gfSubmitSelector').value = res.autoGuardar;
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
    div.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 6px;margin-bottom:3px;background:var(--surface);border-radius:4px;font-size:11px';
    div.innerHTML = `<code style="color:var(--warning);font-size:11px">${escHtml(f.selector)}</code> <span style="color:var(--text-light);flex:1">${escHtml(f.label)}</span> <span style="color:var(--text-muted);font-size:10px">${f.tag}${f.type ? `[${f.type}]` : ''}</span>`;
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
    div.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 6px;margin-bottom:3px;background:var(--surface);border-radius:4px;font-size:11px';
    div.innerHTML = `<code style="color:var(--success);font-size:11px">${b.selector}</code> <span style="color:var(--text-light);flex:1">${escHtml(b.label)}</span>`;
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
    container.innerHTML = '<p style="color:var(--text-secondary);font-size:12px">Load an Excel first to see available columns.</p>';
    return;
  }
  if (GF.detectedFields.length === 0) {
    container.innerHTML = `<p style="color:var(--text-secondary);font-size:12px">${t('noFields')}</p>`;
    return;
  }
  GF.excelCols.forEach(col => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px';
    const label = document.createElement('span');
    label.style.cssText = 'min-width:80px;font-weight:600;color:var(--text-light);background:var(--border);padding:2px 6px;border-radius:3px;text-align:center;font-size:11px';
    label.textContent = col;
    const arrow = document.createElement('span');
    arrow.style.cssText = 'color:var(--text-muted);font-size:11px';
    arrow.textContent = '→';
    const select = document.createElement('select');
    select.style.cssText = 'flex:1;padding:3px 6px;border:1px solid var(--border-2);border-radius:4px;font-size:11px;background:var(--input-bg);color:var(--input-text)';
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
      const opt = sel.options[sel.selectedIndex];
      const label = opt.textContent.split(' (')[0];
      mapping.push({ excelColumn: GF.excelCols[i], selector: sel.value, label });
    }
  });
  return mapping;
}

function saveGenericConfig() {
  const mapping = buildMapping();
  if (mapping.length === 0) {
    gfShowStatus(t('genericNoMapping'), 'error');
    return;
  }
  showPromptModal('Name for this configuration:', GF.fileName || 'Config', name => {
    if (!name) return;
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
  });
}

function loadGenericConfigs() {
  chrome.storage.local.get('genericConfigs', result => {
    const configs = result.genericConfigs || [];
    const container = document.getElementById('gfConfigList');
    container.innerHTML = '';
    if (configs.length === 0) {
      container.innerHTML = '<p style="color:var(--text-secondary);font-size:12px">No saved configurations.</p>';
    } else {
      configs.forEach((cfg, i) => {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 6px;margin-bottom:3px;background:var(--surface);border-radius:4px';
        div.innerHTML = `<span style="flex:1;color:var(--text-light);font-size:11px">${escHtml(cfg.name)} (${cfg.fields.length} fields)</span>
          <button style="background:var(--primary);color:#fff;border:none;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:10px" data-idx="${i}">Load</button>
          <button style="background:var(--error);color:#fff;border:none;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:10px" data-idx="${i}">Delete</button>`;
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

function showPromptModal(label, defaultValue, callback) {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const bg = isDark ? '#1e293b' : '#ffffff';
  const textColor = isDark ? '#e2e8f0' : '#1f2937';
  const inputBg = isDark ? '#0f172a' : '#f9fafb';
  const borderColor = isDark ? '#475569' : '#d1d5db';
  const btnBg = isDark ? '#475569' : '#e5e7eb';
  const btnText = isDark ? '#e2e8f0' : '#374151';
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position:'fixed',inset:'0',zIndex:'999999',background:'rgba(0,0,0,.6)',
    display:'flex',alignItems:'center',justifyContent:'center',
  });
  overlay.innerHTML = `
    <div style="background:${bg};border-radius:10px;padding:24px;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,.4)">
      <p style="color:${textColor};font-size:14px;margin:0 0 12px;font-weight:500">${label}</p>
      <input id="__prompt_input" type="text" value="${escHtml(defaultValue)}"
        style="width:100%;padding:8px 10px;border:1px solid ${borderColor};border-radius:6px;background:${inputBg};color:${textColor};font-size:14px">
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button id="__prompt_cancel" style="padding:6px 18px;border:none;border-radius:5px;cursor:pointer;font-size:13px;background:${btnBg};color:${btnText}">Cancel</button>
        <button id="__prompt_ok" style="padding:6px 18px;border:none;border-radius:5px;cursor:pointer;font-size:13px;background:#f59e0b;color:#000">OK</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const input = document.getElementById('__prompt_input');
  input.focus();
  input.select();
  function close(val) { overlay.remove(); callback(val); }
  document.getElementById('__prompt_ok').onclick = () => close(input.value.trim());
  document.getElementById('__prompt_cancel').onclick = () => close('');
  input.addEventListener('keydown', e => { if (e.key === 'Enter') close(input.value.trim()); if (e.key === 'Escape') close(''); });
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

  const doFill = () => {
    setGenericRunning(true);
    const mode = document.getElementById('gfModeSelect').value;
    const delay = parseInt(document.getElementById('gfSpeedRange').value, 10);
    const submitSelector = document.getElementById('gfSubmitSelector').value.trim() || '';
    const showSummary = document.getElementById('gfShowSummary').checked;
    const baseConfig = { mode, delay, submitSelector, showSummary };
    const checkpoint = {
      index: startIndex,
      total: GF.excelData.length,
      processed: startIndex > 0 ? startIndex : 0,
      failed: 0,
      rows: GF.excelData,
      fields: mapping,
      config: baseConfig,
      fileName: GF.fileName,
      status: 'running',
      timestamp: Date.now()
    };
    chrome.storage.local.set({ genericFillState: checkpoint });
    gfShowStatus(startIndex > 0 ? t('resumeStarting', startIndex + 1) : t('executingRecords', GF.excelData.length), 'info');
    chrome.runtime.sendMessage({
      type: 'GENERIC_FILL_START',
      payload: { rows: GF.excelData, fields: mapping, config: baseConfig, startIndex, fileName: GF.fileName }
    }, res => {
      if (res?.ok) {
        if (startIndex === 0) gfShowStatus(t('genericInjecting', GF.excelData.length), 'success');
      }
      else if (res?.error) gfShowStatus(res.error, 'error');
    });
  };

  // Si es reanudación (startIndex > 0), ya se descontó al iniciar — no descuenta de nuevo
  if (startIndex > 0) {
    doFill();
    return;
  }

  chrome.runtime.sendMessage({ type: 'CHECK_LICENSE' }, res => {
    if (res?.valid) {
      doFill();
    } else {
      const count = GF.excelData.length;
      chrome.runtime.sendMessage({ type: 'CHECK_TRIAL' }, trial => {
        if (trial.remaining >= count) {
          chrome.runtime.sendMessage({ type: 'USE_TRIAL', payload: { count } }, useResult => {
            if (useResult.allowed) {
              doFill();
            } else {
              gfShowStatus(t('trialInsufficient', useResult.remaining, count), 'error');
            }
          });
        } else {
          if (trial.remaining <= 0) {
            gfShowStatus(t('trialExhausted'), 'error');
          } else {
            gfShowStatus(t('trialInsufficient', trial.remaining, count), 'error');
          }
        }
      });
    }
  });
}

function setGenericRunning(running) {
  const btn = document.getElementById('gfExecuteBtn');
  const stop = document.getElementById('gfStopBtn');
  const detect = document.getElementById('gfDetectBtn');
  const zone = document.getElementById('gfUploadZone');
  if (btn) btn.disabled = running;
  if (stop) stop.disabled = !running;
  if (detect) detect.disabled = running;
  if (zone) zone.style.pointerEvents = running ? 'none' : '';
}

function stopGenericFill() {
  setGenericRunning(false);
  chrome.runtime.sendMessage({ type: 'GENERIC_FILL_STOP' });
  chrome.storage.local.remove('genericFillState');
  gfShowStatus(t('genericStopped'), 'info');
}

function checkGenericResume() {
  chrome.storage.local.get('genericFillState', res => {
    const state = res.genericFillState;
    if (!state || state.status !== 'running' || state.index >= state.total) {
      setGenericRunning(false);
      return;
    }
    setGenericRunning(true);
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
      setGenericRunning(false);
    };
  });
}
