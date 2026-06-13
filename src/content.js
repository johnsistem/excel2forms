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
    await this.sleep(200);
    await this.fillGradeInputs(mat);
    await this.sleep(150);
    await this.clickGuardar();
    this.notify('Confirmando...');
    await this.confirmGuardar();
    this.notify('OK...');
    await this.dismissSuccess();
    const saved = await this.waitForGradeSaved(sysSubj);
    if (saved) {
      this.notify('✓ ' + sysSubj);
    } else {
      this.notify('⚠ No se encontró ' + sysSubj + ' en el grid');
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
    await this.sleep(200);
    const buscarBtn = this.findButton('Buscar');
    if (buscarBtn) { buscarBtn.click(); await this.sleep(300); }
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

  async confirmGuardar() {
    const confirmTexts = ['Sí, Guardar', 'Sí', 'Aceptar', 'Confirmar', 'Guardar'];
    for (let i = 0; i < 30; i++) {
      if (!this.running) return false;
      const modal = document.querySelector('[role="dialog"], .MuiDialog-root, .modal, .modal-content, .confirm-dialog');
      if (modal && (modal.offsetParent !== null || modal.style.display !== 'none')) {
        for (const txt of confirmTexts) {
          const exact = this.findButton(txt);
          if (exact) { this.log('  +++ Click confirmación: "' + txt + '"'); exact.click(); return true; }
          const partial = Array.from(modal.querySelectorAll('button')).find(b => b.textContent.trim().toLowerCase().includes(txt.toLowerCase()));
          if (partial) { this.log('  +++ Click confirmación (parcial): "' + txt + '"'); partial.click(); return true; }
        }
        this.log('  Modal visible pero sin botón de confirmación');
        return false;
      }
      await this.sleep(100);
    }
    this.log('  --- No apareció modal de confirmación, continuando');
    return false;
  },

  async dismissSuccess() {
    const okTexts = ['OK', 'Aceptar', 'Cerrar', 'Continuar'];
    for (let i = 0; i < 30; i++) {
      if (!this.running) return;
      const modal = document.querySelector('[role="dialog"], .MuiDialog-root, .modal, .modal-content');
      const scope = modal || document;
      for (const txt of okTexts) {
        const btn = this.findButton(txt);
        if (btn && (!modal || scope.contains(btn))) { btn.click(); return; }
      }
      await this.sleep(100);
    }
  },

  findButton(text) {
    return Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === text);
  },

  async waitForStudentLoad() {
    for (let i = 0; i < 40; i++) {
      const el = document.getElementById('NombreCompleto');
      if (el && el.value && el.value.trim()) return true;
      await this.sleep(150);
    }
    return false;
  },

  async waitForGradeSaved(subjectName) {
    for (let i = 0; i < 40; i++) {
      const rows = document.querySelectorAll('#dgBody tr, .MuiDataGrid-row, [role="row"]');
      const found = Array.from(rows).some(r => r.textContent.includes(subjectName));
      if (found) return true;
      await this.sleep(150);
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

// ───── GENERIC INJECTOR ─────
const GENERIC_INJECTOR = {
  task: null,
  index: 0,
  running: false,
  panel: null,
  resolveNext: null,
  savedRows: [],

  async start(taskData) {
    if (this.running) return;
    if (taskData) this.task = taskData;
    if (!this.task?.rows?.length) {
      this.notify('No hay datos genéricos.');
      return;
    }
    this.running = true;
    this.index = 0;
    this.savedRows = [];
    this.createPanel();
    try {
      while (this.running && this.index < this.task.rows.length) {
        const row = this.task.rows[this.index];
        const pct = Math.round((this.index / this.task.rows.length) * 100);
        const rowLabel = `Registro ${this.index + 1}/${this.task.rows.length}`;
        this.updatePanel(rowLabel, pct);
        for (const field of this.task.fields) {
          if (!this.running) break;
          const value = row[field.excelColumn];
          if (value === undefined || value === null || value === '') continue;
          const el = document.querySelector(field.selector);
          if (!el) {
            this.log(`Selector no encontrado: ${field.selector}`);
            continue;
          }
          this.fillField(el, String(value));
          this.log(`${field.excelColumn} → ${field.selector}: "${String(value).slice(0, 30)}"`);
          if (this.task.config?.delay) await this.sleep(this.task.config.delay);
        }
        if (this.running && this.task.config?.submitSelector) {
          this.log(`Ejecutando submit: ${this.task.config.submitSelector}`);
          this.savedRows.push({ row, index: this.index + 1 });
          // Inject script to click button (page world)
          const s = document.createElement('script');
          s.textContent = `(function(){var b=document.querySelector('${this.task.config.submitSelector}');if(b){b.disabled=false;b.click();}})();`;
          document.body.appendChild(s); s.remove();
          // Direct DOM append to sandbox grid
          const gfTbody = document.querySelector('#gfGridBody');
          if (gfTbody) {
            const tr = document.createElement('tr');
            const vals = this.task.fields.map(f => row[f.excelColumn] || '');
            tr.innerHTML = `<td style="padding:6px 8px;border-bottom:1px solid #e0e0e0">${this.index+1}</td>` +
              vals.map(v => `<td style="padding:6px 8px;border-bottom:1px solid #e0e0e0">${String(v).slice(0,25)}</td>`).join('');
            gfTbody.appendChild(tr);
            const emptyMsg = document.querySelector('#gfEmptyGridMsg');
            if (emptyMsg) emptyMsg.style.display = 'none';
          }
          await this.sleep(600);
        }
        this.index++;
        if (this.index < this.task.rows.length && this.running) {
          if (this.task.config?.mode === 'manual') {
            this.showNextButton();
            await this.waitForClick();
          } else {
            this.showAutoStatus(true);
            await this.sleep(800);
          }
        }
      }
    } catch (e) {
      this.notify('ERROR: ' + (e?.message || e));
    }
    if (this.running) {
      this.updatePanel('Completado ✓', 100);
      this.showAutoStatus(false);
      this.notify('Llenado genérico completado.');
      if (this.savedRows.length > 0 && this.task.config?.showSummary !== false) this.showSummaryModal();
    }
    this.running = false;
  },

  scanFields() {
    const fields = [];
    const elements = document.querySelectorAll('input, select, textarea');
    elements.forEach(el => {
      if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'file' || el.type === 'image' || el.type === 'reset') return;
      if (el.type === 'checkbox' || el.type === 'radio') return;
      const label = el.labels?.[0]?.textContent?.trim()
        || el.getAttribute('aria-label')?.trim()
        || el.placeholder?.trim()
        || el.name?.trim()
        || el.id?.trim()
        || '';
      const selector = el.id ? `#${el.id}` : (el.name ? `${el.tagName.toLowerCase()}[name="${el.name}"]` : '');
      if (!selector) return;
      fields.push({
        label: label || '(sin etiqueta)',
        id: el.id || '',
        name: el.name || '',
        selector,
        tag: el.tagName.toLowerCase(),
        type: el.type || '',
      });
    });
    const buttons = [];
    document.querySelectorAll('button, input[type="submit"], input[type="button"]').forEach(el => {
      if (el.offsetParent === null) return;
      const text = el.textContent?.trim() || el.value?.trim() || '';
      if (!text) return;
      const selector = el.id ? `#${el.id}` : '';
      if (!selector) return;
      buttons.push({ label: text, selector });
    });
    return { fields, buttons };
  },

  fillField(el, value) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'select') {
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (tag === 'textarea') {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        el.value = value;
      }
    } else {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        el.value = value;
      }
    }
  },

  createPanel() {
    if (this.panel) return;
    this.panel = document.createElement('div');
    this.panel.id = '__digitar_generic_panel';
    this.panel.innerHTML = `
      <style>
        #__digitar_generic_panel {
          position: fixed; bottom: 16px; left: 16px; z-index: 99999;
          background: #1e3a5f; color: #fff; padding: 12px 16px; border-radius: 8px;
          font: 13px sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,.3);
          min-width: 280px; max-width: 340px;
        }
        #__digitar_generic_panel .dpg-hdr { font-weight: 600; margin-bottom: 6px; font-size: 12px; opacity: .7; }
        #__digitar_generic_panel .dpg-name { margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; }
        #__digitar_generic_panel .dpg-bar { height: 4px; background: #374151; border-radius: 2px; margin-bottom: 8px; }
        #__digitar_generic_panel .dpg-fill { height: 100%; background: #f59e0b; border-radius: 2px; transition: width .3s; }
        #__digitar_generic_panel .dpg-actions { display: flex; gap: 6px; justify-content: flex-end; }
        #__digitar_generic_panel .dpg-btn {
          padding: 5px 12px; border: none; border-radius: 4px; cursor: pointer;
          font-size: 12px; font-weight: 500;
        }
        #__digitar_generic_panel .dpg-btn-primary { background: #f59e0b; color: #000; }
        #__digitar_generic_panel .dpg-btn-primary:hover { background: #d97706; }
        #__digitar_generic_panel .dpg-btn-stop { background: #ef4444; color: #fff; }
      </style>
      <div class="dpg-hdr">Formulario Genérico</div>
      <div class="dpg-name" id="dpg_name">Iniciando...</div>
      <div class="dpg-bar"><div class="dpg-fill" id="dpg_fill" style="width:0%"></div></div>
      <div class="dpg-actions" id="dpg_actions">
        <button class="dpg-btn dpg-btn-stop" id="dpg_stop">Detener</button>
      </div>
    `;
    document.body.appendChild(this.panel);
    document.getElementById('dpg_stop').onclick = () => this.stop();
  },

  showNextButton() {
    this.ensurePanel();
    const actions = document.getElementById('dpg_actions');
    if (!actions) return;
    actions.innerHTML = `
      <button class="dpg-btn dpg-btn-primary" id="dpg_next">Siguiente →</button>
      <button class="dpg-btn dpg-btn-stop" id="dpg_stop2">Detener</button>
    `;
    document.getElementById('dpg_next').onclick = () => { if (this.resolveNext) this.resolveNext(); };
    document.getElementById('dpg_stop2').onclick = () => this.stop();
  },

  showAutoStatus(hasNext) {
    this.ensurePanel();
    const actions = document.getElementById('dpg_actions');
    if (!actions) return;
    actions.innerHTML = `
      <span style="font-size:11px;opacity:.7;flex:1">${hasNext ? 'Esperando...' : 'Completado ✓'}</span>
      <button class="dpg-btn dpg-btn-stop" id="dpg_stop3">Detener</button>
    `;
    const btn = document.getElementById('dpg_stop3');
    if (btn) btn.onclick = () => this.stop();
  },

  updatePanel(name, pct) {
    this.ensurePanel();
    const el = document.getElementById('dpg_name');
    if (el) el.textContent = name;
    const fill = document.getElementById('dpg_fill');
    if (fill) fill.style.width = pct + '%';
  },

  showSummaryModal() {
    const modal = document.createElement('div');
    modal.id = '__digitar_summary_modal';
    Object.assign(modal.style, {
      position: 'fixed', inset: '0', zIndex: '999999', background: 'rgba(0,0,0,.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });
    const cols = this.task.fields.map(f => f.excelColumn);
    const rows = this.savedRows;
    modal.innerHTML = `
      <div style="background:#1e293b;border-radius:8px;padding:16px;max-width:90vw;max-height:80vh;overflow:auto;color:#e2e8f0;font:13px sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5)">
        <h3 style="margin:0 0 8px;font-size:15px;color:#f59e0b">✓ Llenado completado — ${rows.length} registros</h3>
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead>
            <tr>${['#', ...cols].map(c => `<th style="padding:5px 8px;text-align:left;border-bottom:2px solid #f59e0b;background:#334155;color:#f59e0b;white-space:nowrap">${c}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.map(r => `<tr>${['', ...cols].map((c, i) => `<td style="padding:4px 8px;border-bottom:1px solid #334155;white-space:nowrap">${i === 0 ? r.index : String(r.row[c] || '').slice(0, 30)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
        <div style="text-align:center;margin-top:12px">
          <button id="__digitar_close_summary" style="background:#f59e0b;color:#000;border:none;border-radius:4px;padding:8px 24px;cursor:pointer;font-weight:600;font-size:13px">Cerrar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('__digitar_close_summary').onclick = () => modal.remove();
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
  },

  ensurePanel() {
    if (!document.getElementById('__digitar_generic_panel')) {
      this.panel = null;
      this.createPanel();
    }
  },

  waitForClick() {
    this.ensurePanel();
    return new Promise(resolve => { this.resolveNext = resolve; });
  },

  stop() {
    this.running = false;
    if (this.resolveNext) { this.resolveNext(); this.resolveNext = null; }
    if (this.panel && this.panel.parentNode) this.panel.remove();
    this.panel = null;
  },

  log(msg) {
    console.log('[DigitarGeneric]', msg);
    document.dispatchEvent(new CustomEvent('__digitar_log', { detail: '[GF] ' + msg }));
  },

  notify(msg) {
    console.log('[DigitarGeneric]', msg);
    document.dispatchEvent(new CustomEvent('__digitar_log', { detail: '[GF] ' + msg }));
    chrome.runtime.sendMessage({ type: 'GENERIC_PROGRESS', payload: { message: msg } });
  },

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
};

// 🔒 GUARD: solo registrar listeners una vez (evita duplicados cuando content.js se inyecta múltiples veces)
if (!document.querySelector('meta[name="__digitar_cs_reg"]')) {
  const m = document.createElement('meta');
  m.name = '__digitar_cs_reg';
  document.head.appendChild(m);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'INJECT_START':
      if (message.payload) {
        INJECTOR.task = message.payload;
        INJECTOR.init().then(() => INJECTOR.start());
      } else {
        INJECTOR.init().then(() => INJECTOR.start());
      }
      sendResponse({ ok: true });
      return true;
    case 'DETECT_FIELDS': {
      const detected = GENERIC_INJECTOR.scanFields();
      sendResponse({ fields: detected.fields, buttons: detected.buttons });
      return true;
    }
    case 'GENERIC_FILL_START':
      GENERIC_INJECTOR.start(message.payload);
      sendResponse({ ok: true });
      return true;
    case 'GENERIC_FILL_STOP':
      GENERIC_INJECTOR.stop();
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
}
