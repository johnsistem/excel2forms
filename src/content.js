const INJECTOR = {
  task: null,
  index: 0,
  subjectIndex: 0,
  running: false,
  panel: null,
  resolveNext: null,
  systemSubjects: [],

  get data() { return this.task?.data || null; },
  get config() { return this.task?.config || null; },

  async init() {
    this.notify('Content script cargado en la página');
    if (window.__sandboxLog) window.__sandboxLog('info', '[CS] init()');
    // Solo leer de storage si no tenemos datos ya (ej: llegaron por mensaje)
    if (!this.task) {
      const result = await chrome.storage.session.get('injectTask');
      if (result.injectTask) {
        this.task = result.injectTask;
        this.notify('injectTask OK: ' + this.task.data.length + ' registros');
      } else {
        this.notify('Esperando injectTask vía mensaje...');
      }
    }
  },

  async start() {
    if (this.running) return;
    this.notify('start() ejecutándose');
    if (!this.task?.data?.length) {
      this.notify('No hay datos.');
      return;
    }
    // DEBUG: log data received
    this.log('***** DATA RECIBIDA EN CONTENT SCRIPT *****');
    this.task.data.forEach((r, idx) => {
      this.log('Estudiante #' + (idx+1) + ': ' + r.nombre + ' (' + r.codigo + ')');
      r.materias.forEach((m, mi) => {
        this.log('  [' + mi + '] ' + m.nombre + ' → cual=' + m.cualitativo + ' cuant=' + m.cuantitativo);
      });
    });
    this.log('***** FIN DATA *****');

    this.running = true;
    this.index = 0; // Asegurarnos de empezar desde 0
    this.subjectIndex = 0; // Asegurarnos de empezar desde 0
    this.systemSubjects = []; // Reiniciar la lista de materias del sistema
    this.createPanel();
    const cfg = this.task?.config || {};
    const mode = cfg.mode || 'semi';
    this.notify('Modo: ' + mode + ', ' + this.task.data.length + ' registros');
    const hdr = document.querySelector('#__digitar_panel .dp-hdr');
    if (hdr) hdr.textContent = `Digitar [${mode}]`;
    try {
      if (mode === 'semi') {
        await this.injectNextSemi();
      } else if (mode === 'per_student') {
        await this.injectPerStudent();
      } else {
        await this.injectAll();
      }
    } catch (e) {
      this.notify('ERROR: ' + (e?.message || e));
      console.error('[DigitarExtension]', e);
    }
    this.running = false;
  },

  createPanel() {
    if (this.panel) return;
    this.panel = document.createElement('div');
    this.panel.id = '__digitar_panel';
    this.panel.innerHTML = `
      <style>
        #__digitar_panel {
          position: fixed; bottom: 16px; right: 16px; z-index: 99999;
          background: #1f2937; color: #fff; padding: 12px 16px; border-radius: 8px;
          font: 13px sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,.3);
          min-width: 280px; max-width: 340px;
        }
        #__digitar_panel .dp-hdr { font-weight: 600; margin-bottom: 6px; font-size: 12px; opacity: .7; }
        #__digitar_panel .dp-name { margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; }
        #__digitar_panel .dp-bar { height: 4px; background: #374151; border-radius: 2px; margin-bottom: 8px; }
        #__digitar_panel .dp-fill { height: 100%; background: #3b82f6; border-radius: 2px; transition: width .3s; }
        #__digitar_panel .dp-actions { display: flex; gap: 6px; justify-content: flex-end; }
        #__digitar_panel .dp-btn {
          padding: 5px 12px; border: none; border-radius: 4px; cursor: pointer;
          font-size: 12px; font-weight: 500;
        }
        #__digitar_panel .dp-btn-primary { background: #3b82f6; color: #fff; }
        #__digitar_panel .dp-btn-primary:hover { background: #2563eb; }
        #__digitar_panel .dp-btn-secondary { background: #374151; color: #9ca3af; }
        #__digitar_panel .dp-btn-stop { background: #ef4444; color: #fff; }
      </style>
      <div class="dp-hdr">🐛 [DEBUG] DigitarExtension</div>
      <div class="dp-name" id="dp_name">Iniciando...</div>
      <div class="dp-bar"><div class="dp-fill" id="dp_fill" style="width:0%"></div></div>
      <div class="dp-actions" id="dp_actions">
        <button class="dp-btn dp-btn-stop" id="dp_stop">Detener</button>
      </div>
    `;
    document.body.appendChild(this.panel);
    document.getElementById('dp_stop').onclick = () => this.stop();
  },

  showNextButton() {
    this.ensurePanel();
    const actions = document.getElementById('dp_actions');
    if (!actions) { this.notify('ERROR: panel sin acciones'); return; }
    actions.innerHTML = `
      <button class="dp-btn dp-btn-primary" id="dp_next">Siguiente →</button>
      <button class="dp-btn dp-btn-stop" id="dp_stop2">Detener</button>
    `;
    document.getElementById('dp_next').onclick = () => {
      if (this.resolveNext) this.resolveNext();
    };
    document.getElementById('dp_stop2').onclick = () => this.stop();
  },

  showAutoStatus(hasNext) {
    this.ensurePanel();
    const actions = document.getElementById('dp_actions');
    if (!actions) return;
    actions.innerHTML = `
      <span style="font-size:11px;opacity:.7;flex:1">${hasNext ? 'Esperando...' : 'Completado ✓'}</span>
      <button class="dp-btn dp-btn-stop" id="dp_stop3">Detener</button>
    `;
    const btn = document.getElementById('dp_stop3');
    if (btn) btn.onclick = () => this.stop();
  },

  updatePanel(name, pct) {
    this.ensurePanel();
    const el = document.getElementById('dp_name');
    if (el) el.textContent = name;
    const fill = document.getElementById('dp_fill');
    if (fill) fill.style.width = pct + '%';
  },

  async injectNextSemi() {
    while (this.running && this.index < this.data.length) {
      const record = this.data[this.index];

      if (this.subjectIndex === 0) {
        this.log('=== ESTUDIANTE #' + (this.index + 1) + '/' + this.data.length + ': ' + record.nombre + ' ===');
        await this.searchStudent(record);
        if (!this.running) return;
        this.systemSubjects = this.getSystemSubjects();
        this.log('Materias del SISTEMA: ' + this.systemSubjects.join(' | '));
      }

      let filled = false;
      while (this.subjectIndex < this.systemSubjects.length && this.running) {
        const sysSubj = this.systemSubjects[this.subjectIndex];
        const mat = record.materias.find(m => this.norm(m.nombre) === this.norm(sysSubj));
        this.subjectIndex++;

        if (mat) {
          filled = true;
          this.log('✓ ' + sysSubj + ' — cual: ' + (mat.cualitativo || '—') + ' / cuant: ' + (mat.cuantitativo || '—'));
          const totalOps = this.data.reduce((a, d) => a + d.materias.length, 0);
          const opsDone = this.data.slice(0, this.index).reduce((a, d) => a + d.materias.length, 0) +
                          record.materias.findIndex(m => this.norm(m.nombre) === this.norm(sysSubj)) + 1;
          const pct = Math.round((opsDone / totalOps) * 100);
          this.updatePanel(`${record.nombre} — ${sysSubj}`, pct);
          await this.fillOneSubject(mat, sysSubj);
          if (!this.running) return;
          break;
        } else {
          this.log('⏭ ' + sysSubj + ' no está en el Excel, saltando');
        }
      }

      if (!this.running) return;

      if (filled) {
        this.showNextButton();
        await this.waitForClick();
        continue;
      }

      this.notify('✓ ' + record.nombre + ' completado');
      this.subjectIndex = 0;
      this.index++;

      if (this.index < this.data.length && this.running) {
        this.updatePanel('Siguiente estudiante →', 0);
        this.showNextButton();
        await this.waitForClick();
      }
    }

    if (this.running) {
      this.updatePanel('Completado ✓', 100);
      this.showAutoStatus(false);
      this.notify('Llenado completado.');
    }
  },

  waitForClick() {
    this.ensurePanel();
    return new Promise(resolve => { this.resolveNext = resolve; });
  },

  ensurePanel() {
    if (!document.getElementById('__digitar_panel')) {
      this.panel = null;
      this.createPanel();
    }
  },

  async injectPerStudent() {
    while (this.running && this.index < this.data.length) {
      const record = this.data[this.index];
      this.log('=== ESTUDIANTE #' + (this.index + 1) + '/' + this.data.length + ': ' + record.nombre + ' ===');
      await this.searchStudent(record);
      if (!this.running) return;
      const systemSubjects = this.getSystemSubjects();
      this.log('Materias del SISTEMA: ' + systemSubjects.join(' | '));
      let filledCount = 0;
      for (let s = 0; s < systemSubjects.length; s++) {
        if (!this.running) break;
        const sysSubj = systemSubjects[s];
        const mat = record.materias.find(m => this.norm(m.nombre) === this.norm(sysSubj));
        if (!mat) { this.log('⏭ ' + sysSubj + ' no está en el Excel, saltando'); continue; }
        filledCount++;
        this.log('✓ ' + sysSubj + ' → ' + mat.cualitativo + ' ' + (mat.cuantitativo||''));
        const pct = Math.round(((s + 1) / systemSubjects.length) * 100);
        this.updatePanel(`${record.nombre} — ${sysSubj}`, pct);
        await this.fillOneSubject(mat, sysSubj);
        if (!this.running) return;
        if (s < systemSubjects.length - 1) {
          await this.sleep((this.config?.speed || 8) * 1000);
        }
      }
      if (!filledCount) this.notify('⚠ ' + record.nombre + ' no tiene materias que coincidan');
      this.notify('✓ ' + record.nombre + ' completado');
      this.index++;
      if (this.index < this.data.length && this.running) {
        this.updatePanel('Siguiente estudiante →', 100);
        this.showNextButton();
        await this.waitForClick();
      }
    }
    if (this.running) {
      this.updatePanel('Completado ✓', 100);
      this.showAutoStatus(false);
      this.notify('Llenado completado.');
    }
  },

  async injectAll() {
    for (let i = 0; i < this.data.length; i++) {
      if (!this.running) break;
      const record = this.data[i];
      this.log('=== ESTUDIANTE #' + (i + 1) + ': ' + record.nombre + ' (código=' + record.codigo + ') ===');
      this.log(`[RAW DATA EXCEL] Materias recibidas: ${JSON.stringify(record.materias)}`);
      this.log('Materias del Excel:');
      record.materias.forEach(m => this.log('  ' + m.nombre + ' → cual=' + (m.cualitativo||'') + ' cuant=' + (m.cuantitativo!=null?m.cuantitativo:'') ));
      await this.searchStudent(record);
      const systemSubjects = this.getSystemSubjects();
      this.log('Materias del SISTEMA: ' + systemSubjects.join(' | '));
      let filledCount = 0;
      for (let s = 0; s < systemSubjects.length; s++) {
        if (!this.running) break;
        const sysSubj = systemSubjects[s];
        this.log('── Buscando "' + sysSubj + '" en Excel...');
        const mat = record.materias.find(m => this.norm(m.nombre) === this.norm(sysSubj));
        if (!mat) { this.log('⏭ No encontrada, saltando'); continue; }
        filledCount++;
        this.log('✓ MATCH: Excel "' + mat.nombre + '" = ' + mat.cualitativo + ' ' + (mat.cuantitativo||'') + ' → Sistema "' + sysSubj + '"');
        const totalOps = record.materias.length;
        const opsDone = filledCount;
        const pct = Math.round((opsDone / totalOps) * 100);
        this.updatePanel(`#${i + 1}/${this.data.length} ${record.nombre} — ${sysSubj}`, pct);
        this.showAutoStatus(true);
        await this.fillOneSubject(mat, sysSubj);
        // VERIFICAR: leer el select y los inputs JUSTO DESPUÉS de guardar
        const select = document.querySelector('#Id_Asignatable, select[name="Id_Asignatura"]');
        if (select) this.log('  🔍 DESPUÉS DE GUARDAR: select.value = "' + select.value + '"');
        const cuali = document.querySelector('#Calif_Cualitativa, input[name="Calif_Cualitativa"]');
        const cuanti = document.querySelector('#Calif_Cuantitativa, input[name="Calif_Cuantitativa"]');
        if (cuali) this.log('  🔍 cuali.value = "' + cuali.value + '"');
        if (cuanti) this.log('  🔍 cuanti.value = "' + cuanti.value + '"');
        if (s < systemSubjects.length - 1) {
          await this.sleep((this.config?.speed || 8) * 1000);
        }
      }
      if (!filledCount) this.notify('⚠ ' + record.nombre + ' no tiene materias que coincidan con el sistema');
    }
    this.updatePanel('Completado ✓', 100);
    this.showAutoStatus(false);
    this.notify('Llenado completado.');
  },

  getSystemSubjects() {
    const select = document.querySelector('select[name="Id_Asignatura"], #Id_Asignatable, #Id_Asignatura');
    if (select && select.tagName === 'SELECT') {
      return Array.from(select.options).map((o, i) => o.textContent.trim()).filter(Boolean)
        .filter((name, i, arr) => name !== '-- Seleccione --' && name !== '' && arr.indexOf(name) === i);
    }
    return [];
  },

  norm(s) {
    return s.replace(/\./g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  },

  async fillOneSubject(mat, sysSubj) {
    this.log('→ Llenando: "' + sysSubj + '" (Excel mat.nombre="' + mat.nombre + '", cual=' + (mat.cualitativo||'') + ', cuant=' + (mat.cuantitativo!=null?mat.cuantitativo:'') + ')');
    await this.selectSubject(sysSubj);
    await this.sleep(400);
    // VERIFICAR select.value DESPUÉS de seleccionar
    const select = document.querySelector('#Id_Asignatable, select[name="Id_Asignatura"]');
    if (select) this.log('  🔍 select.value AHORA = "' + select.value + '"');
    await this.fillGradeInputs(mat);
    await this.sleep(300);
    // VERIFICAR cuali/cuanti ANTES de guardar
    const cuali = document.querySelector('#Calif_Cualitativa, input[name="Calif_Cualitativa"]');
    const cuanti = document.querySelector('#Calif_Cuantitativa, input[name="Calif_Cuantitativa"]');
    this.log('  🔍 ANTES DE GUARDAR: cuali="' + (cuali?cuali.value:'?') + '" cuanti="' + (cuanti?cuanti.value:'?') + '"');
    await this.clickGuardar();
    await this.sleep(500);
    const saved = await this.waitForGradeSaved(sysSubj);
    if (saved) {
      this.notify('✓ Guardado: ' + sysSubj);
      const gridRows = document.querySelectorAll('#dgBody tr:not(.dxgvGroupRow), .MuiDataGrid-row, [role="row"]');
      this.log('  Grid rows:');
      gridRows.forEach((r, idx) => this.log('    [' + idx + '] ' + r.textContent.replace(/\s+/g, ' ').trim()));
    } else {
      this.notify('⚠ No se encontró ' + sysSubj + ' en el grid después de guardar');
    }
  },

  async searchStudent(record) {
    // Limpiar grid anterior para simular cambio de estudiante real
    const gridBody = document.getElementById('dgBody');
    if (gridBody) {
      gridBody.innerHTML = '';
      const emptyMsg = document.getElementById('emptyGridMsg');
      if (emptyMsg) emptyMsg.style.display = 'block';
    }
    await this.fillField('CodigoPersonaEstudiante', record.codigo);
    await this.sleep(300);
    const buscarBtn = this.findButton('Buscar');
    if (buscarBtn) { buscarBtn.click(); await this.sleep(500); }
    await this.waitForStudentLoad();
  },

  async fillField(id, value) {
    const el = document.getElementById(id) || document.querySelector(`input[name="${id}"], [name="${id}"]`);
    if (el) this.simulateInput(el, value);
  },

  async selectSubject(nombre) {
    const norm = s => s.replace(/\./g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const normalizedNombre = norm(nombre);
    const select = document.querySelector('select[name="Id_Asignatura"], #Id_Asignatable, #Id_Asignatura');
    if (select && select.tagName === 'SELECT') {
      const opt = Array.from(select.options).find(o => norm(o.textContent) === normalizedNombre);
      if (opt) {
        this.log('  select.value ANTES = "' + select.value + '"');
        select.value = opt.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        this.log('  select.value DESPUÉS = "' + select.value + '"');
        this.notify('✓ Select: "' + nombre + '" → opt.value="' + opt.value + '"');
        return true;
      } else {
        this.notify('⚠ No se encontró option para: "' + nombre + '"');
        this.notify('  Opciones: ' + Array.from(select.options).map(o => '["' + o.textContent + '"=' + o.value + ']').join(', '));
        return false;
      }
    }
    const autocompleteInput = document.querySelector('#Id_Asignatable input');
    if (autocompleteInput) {
      this.notify('Autocomplete: ' + nombre);
      autocompleteInput.focus();
      this.simulateInput(autocompleteInput, nombre);
      await this.sleep(800);
      const opt = Array.from(document.querySelectorAll('[role="option"], .MuiAutocomplete-option, li[role="option"]'))
        .find(el => norm(el.textContent) === normalizedNombre);
      if (opt) { opt.click(); await this.sleep(500); return true; }
      autocompleteInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await this.sleep(300);
      autocompleteInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await this.sleep(400);
      return true;
    }
    const combobox = document.getElementById('Id_Asignatable') || document.getElementById('Id_Asignatura');
    if (combobox && combobox.getAttribute('role') === 'combobox') {
      combobox.click();
      await this.sleep(500);
      const item = Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], .MuiMenuItem-root'))
        .find(el => norm(el.textContent) === normalizedNombre);
      if (item) { item.click(); await this.sleep(400); return true; }
      return false;
    }
    return false;
  },

  async fillGradeInputs(mat) {
    const cuali = document.querySelector('input[name="Calif_Cualitativa"], #Calif_Cualitativa');
    const cuanti = document.querySelector('input[name="Calif_Cuantitativa"], #Calif_Cuantitativa');
    if (cuali && mat.cualitativo) {
      this.log('  +++ SET cuali := "' + mat.cualitativo + '" (actual=' + cuali.value + ')');
      this.simulateInput(cuali, mat.cualitativo);
      this.log('  +++ cuali AHORA = "' + cuali.value + '"');
    } else {
      this.log('  --- NO SET cuali: input=' + (cuali?'found':'null') + ' mat.cualitativo=' + (mat.cualitativo||'empty'));
    }
    if (cuanti && mat.cuantitativo != null) {
      this.log('  +++ SET cuanti := "' + mat.cuantitativo + '" (actual=' + cuanti.value + ')');
      this.simulateInput(cuanti, String(mat.cuantitativo));
      this.log('  +++ cuanti AHORA = "' + cuanti.value + '"');
    } else {
      this.log('  --- NO SET cuanti: input=' + (cuanti?'found':'null') + ' mat.cuantitativo=' + (mat.cuantitativo!=null?mat.cuantitativo:'null'));
    }
  },

  async clickGuardar() {
    const btn = this.findButton('Guardar');
    if (btn) {
      this.log('  +++ Click Guardar (disabled=' + btn.disabled + ')');
      btn.disabled = false;
      btn.click();
      this.log('  +++ Guardar clicked');
    } else {
      this.log('  --- ¡NO ENCONTRÉ botón Guardar!');
    }
  },

  findButton(text) {
    return Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === text);
  },

  async waitForStudentLoad() {
    for (let i = 0; i < 40; i++) {
      const el = document.getElementById('NombreCompleto');
      if (el && el.value && el.value.trim()) return true;
      await this.sleep(300);
    }
    return false;
  },

  async waitForGradeSaved(subjectName) {
    for (let i = 0; i < 40; i++) {
      const rows = document.querySelectorAll('#dgBody tr, .MuiDataGrid-row, [role="row"]');
      const found = Array.from(rows).some(r => r.textContent.includes(subjectName));
      if (found) return true;
      await this.sleep(300);
    }
    return false;
  },

  simulateInput(element, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  },

  stop() {
    this.running = false;
    if (this.resolveNext) { this.resolveNext(); this.resolveNext = null; }
    if (this.panel && this.panel.parentNode) { this.panel.remove(); }
    this.panel = null;
    this.notify('Llenado detenido.');
  },

  log(msg) {
    console.log('[Digitar]', msg);
    document.dispatchEvent(new CustomEvent('__digitar_log', { detail: msg }));
  },

  notify(msg) {
    console.log('[DigitarExtension]', msg);
    document.dispatchEvent(new CustomEvent('__digitar_log', { detail: msg }));
    chrome.runtime.sendMessage({ type: 'INJECT_PROGRESS', payload: { message: msg } });
  },

  sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
};

// Badge visible para confirmar que el content script se inyectó
(function showInjectBadge() {
  const badge = document.createElement('div');
  badge.id = '__digitar_badge';
  badge.textContent = 'Digitar CS: ✓';
  Object.assign(badge.style, {
    position: 'fixed', top: '8px', right: '8px', zIndex: '999999',
    background: '#22c55e', color: '#fff', padding: '3px 8px',
    borderRadius: '4px', font: '11px sans-serif',
    boxShadow: '0 2px 6px rgba(0,0,0,.2)',
    opacity: '.9', cursor: 'pointer',
  });
  badge.onclick = () => badge.remove();
  document.body.appendChild(badge);
  document.dispatchEvent(new CustomEvent('__digitar_log', { detail: '✅ Badge verde visible — content script inyectado' }));
  setTimeout(() => { badge.style.opacity = '.4'; }, 5000);
})();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'INJECT_START') {
    if (message.payload) {
      INJECTOR.task = message.payload;
      INJECTOR.init().then(() => INJECTOR.start());
    } else {
      INJECTOR.init().then(() => INJECTOR.start());
    }
    sendResponse({ ok: true });
    return true;
  }
});

// Escuchar eventos del sandbox (demo buttons) para inyectar via content script
document.addEventListener('__digitar_inject_demo', function(e) {
  const payload = e.detail;
  if (!payload || !payload.data || !payload.data.length) return;
  INJECTOR.task = {
    data: payload.data,
    config: { mode: payload.mode || 'auto', speed: payload.speed || 3 },
    index: 0
  };
  INJECTOR.index = 0;
  INJECTOR.subjectIndex = 0;
  INJECTOR.systemSubjects = [];
  INJECTOR.notify('🎬 Demo data recibida: ' + payload.data.length + ' estudiantes, modo=' + (payload.mode || 'auto'));
  INJECTOR.start();
});
