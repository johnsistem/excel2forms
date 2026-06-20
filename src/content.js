// ───── GENERIC INJECTOR ─────
const GENERIC_INJECTOR = {
  task: null,
  index: 0,
  running: false,
  panel: null,
  resolveNext: null,
  savedRows: [],
  failedCount: 0,

  saveCheckpoint() {
    chrome.storage.local.set({
      genericFillState: {
        index: this.index + 1,
        total: this.task.rows.length,
        processed: this.savedRows.length,
        failed: this.failedCount,
        rows: this.task.rows,
        fields: this.task.fields,
        config: this.task.config,
        fileName: this.task.fileName || '',
        status: 'running',
        timestamp: Date.now()
      }
    });
  },

  clearCheckpoint() {
    chrome.storage.local.remove('genericFillState');
  },

  async start(taskData) {
    if (this.running) return;
    if (taskData) this.task = taskData;
    if (!this.task?.rows?.length) {
      this.notify('No hay datos genéricos.');
      return;
    }
    this.running = true;
    this.index = this.task.startIndex || 0;
    this.savedRows = [];
    this.failedCount = 0;
    this.results = [];
    try {
    this.createPanel();
    while (this.running && this.index < this.task.rows.length) {
      const row = this.task.rows[this.index];
      const pct = Math.round((this.index / this.task.rows.length) * 100);
      const rowLabel = `Registro ${this.index + 1}/${this.task.rows.length}`;
      this.updatePanel(rowLabel, pct);
      if (this.task.config?.mode === 'manual') {
        this.showStatus('Llenando...');
      }
      let rowOk = true;
      let rowError = '';
      try {
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
          const s = document.createElement('script');
          s.textContent = `(function(){var b=document.querySelector('${this.task.config.submitSelector}');if(b){b.disabled=false;b.click();}})();`;
          document.body.appendChild(s); s.remove();
          const gfTbody = document.querySelector('#gfGridBody, #gridBody');
          if (gfTbody) {
            const fields = this.task.fields || [];
            const table = gfTbody.closest('table');
            if (table) {
              const thead = table.querySelector('thead tr');
              if (thead) {
                thead.innerHTML = '<th>#</th>';
                fields.forEach(f => {
                  const th = document.createElement('th');
                  th.textContent = f.label || f.excelColumn;
                  thead.appendChild(th);
                });
              }
            }
            const tr = document.createElement('tr');
            tr.innerHTML = `<td style="padding:6px 8px;border-bottom:1px solid #e0e0e0">${this.index+1}</td>` +
              fields.map(f => `<td style="padding:6px 8px;border-bottom:1px solid #e0e0e0">${String(row[f.excelColumn] || '').slice(0,25)}</td>`).join('');
            gfTbody.appendChild(tr);
            const emptyMsg = document.querySelector('#gfEmptyGridMsg, #emptyMsg');
            if (emptyMsg) emptyMsg.style.display = 'none';
          }
          await this.sleep(600);
        }
      } catch (e) {
        rowOk = false;
        rowError = e?.message || String(e);
        this.failedCount++;
        this.log(`Error en fila ${this.index + 1}: ${rowError}`);
      }
      this.results.push({ data: row, status: rowOk ? 'ok' : 'error', error: rowError });
      this.saveCheckpoint();
      this.index++;
      if (this.index < this.task.rows.length && this.running) {
        if (this.task.config?.mode === 'manual') {
          this.showNext();
          await this.waitForClick();
        } else {
          this.showStatus('Esperando...');
          await this.sleep(800);
        }
      }
    }
    this.clearCheckpoint();
    if (this.running) {
      this.updatePanel('Completado ✓', 100);
      this.showStatus('Completado ✓');
      this.notify('Llenado genérico completado.');
      if (this.savedRows.length > 0 && this.task.config?.showSummary !== false) this.showSummaryModal();
    }
    this.running = false;
    } catch (e) {
      this.log(`Error general en start(): ${e?.message || e}`);
      this.notify('Error: ' + (e?.message || e));
      this.clearCheckpoint();
      this.running = false;
    }
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

  showNextButton(isError, retryFn) {
    this.ensurePanel();
    const actions = document.getElementById('dpg_actions');
    if (!actions) return;
    if (isError) {
      actions.innerHTML = `
        <span style="font-size:11px;color:#f87171;flex:1">✗ Error</span>
        <button class="dpg-btn" style="background:#4b5563;color:#fff" id="dpg_skip">Saltar</button>
        <button class="dpg-btn dpg-btn-primary" id="dpg_retry">Reintentar</button>
        <button class="dpg-btn dpg-btn-stop" id="dpg_stop4">Detener</button>
      `;
      document.getElementById('dpg_skip').onclick = () => { if (this.resolveNext) this.resolveNext(); };
      document.getElementById('dpg_retry').onclick = () => {
        this.index--;
        this.failedCount--;
        this.results.pop();
        if (this.resolveNext) this.resolveNext();
      };
      document.getElementById('dpg_stop4').onclick = () => this.stop();
    } else {
      actions.innerHTML = `
        <button class="dpg-btn dpg-btn-primary" id="dpg_next">Siguiente →</button>
        <button class="dpg-btn dpg-btn-stop" id="dpg_stop2">Detener</button>
      `;
      document.getElementById('dpg_next').onclick = () => { if (this.resolveNext) this.resolveNext(); };
      document.getElementById('dpg_stop2').onclick = () => this.stop();
    }
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

  showStatus(text) {
    this.ensurePanel();
    const actions = document.getElementById('dpg_actions');
    if (!actions) return;
    actions.innerHTML = `
      <span style="font-size:11px;opacity:.7;flex:1">${text}</span>
      <button class="dpg-btn dpg-btn-stop" id="dpg_status_stop">Detener</button>
    `;
    document.getElementById('dpg_status_stop')?.addEventListener('click', () => this.stop());
  },

  showNext() {
    this.ensurePanel();
    const actions = document.getElementById('dpg_actions');
    if (!actions) return;
    actions.innerHTML = `
      <button class="dpg-btn dpg-btn-primary" id="dpg_next">Siguiente →</button>
      <button class="dpg-btn dpg-btn-stop" id="dpg_next_stop">Detener</button>
    `;
    document.getElementById('dpg_next')?.addEventListener('click', () => { if (this.resolveNext) this.resolveNext(); });
    document.getElementById('dpg_next_stop')?.addEventListener('click', () => this.stop());
  },

  showSummaryModal() {
    const modal = document.createElement('div');
    modal.id = '__digitar_summary_modal';
    Object.assign(modal.style, {
      position: 'fixed', inset: '0', zIndex: '999999', background: 'rgba(0,0,0,.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });
    const cols = this.task.fields.map(f => f.excelColumn);
    const rows = this.results.filter(r => r.status === 'ok');
    const errors = this.results.filter(r => r.status === 'error');
    modal.innerHTML = `
      <div style="background:#1e293b;border-radius:8px;padding:16px;max-width:90vw;max-height:80vh;overflow:auto;color:#e2e8f0;font:13px sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5)">
        <h3 style="margin:0 0 8px;font-size:15px;color:#f59e0b">✓ Llenado completado</h3>
        <p style="font-size:13px;margin-bottom:12px;color:#94a3b8">
          Correctos: <strong style="color:#4ade80">${rows.length}</strong>
          ${errors.length ? ' | Errores: <strong style="color:#f87171">' + errors.length + '</strong>' : ''}
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead>
            <tr>${['#', ...cols, 'Estado'].map(c => `<th style="padding:5px 8px;text-align:left;border-bottom:2px solid #f59e0b;background:#334155;color:#f59e0b;white-space:nowrap">${c}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${this.results.map((r, idx) => `
              <tr>
                <td style="padding:4px 8px;border-bottom:1px solid #334155">${idx + 1}</td>
                ${cols.map(c => `<td style="padding:4px 8px;border-bottom:1px solid #334155;white-space:nowrap">${String(r.data[c] || '').slice(0, 30)}</td>`).join('')}
                <td style="padding:4px 8px;border-bottom:1px solid #334155;color:${r.status === 'ok' ? '#4ade80' : '#f87171'}">${r.status === 'ok' ? '✓ OK' : '✗ ' + r.error}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="text-align:center;margin-top:12px;display:flex;gap:8px;justify-content:center">
          <button id="__digitar_export_report" style="background:#3b82f6;color:#fff;border:none;border-radius:4px;padding:8px 24px;cursor:pointer;font-weight:600;font-size:13px">📥 Descargar Reporte</button>
          <button id="__digitar_close_summary" style="background:#f59e0b;color:#000;border:none;border-radius:4px;padding:8px 24px;cursor:pointer;font-weight:600;font-size:13px">Cerrar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('__digitar_close_summary').onclick = () => modal.remove();
    document.getElementById('__digitar_export_report').onclick = () => {
      const header = ['#', ...cols, 'Estado', 'MensajeError'];
      const body = this.results.map((r, idx) => {
        const vals = cols.map(c => String(r.data[c] || '').replace(/,/g, ';'));
        const status = r.status === 'ok' ? 'Éxito' : 'Error';
        return [idx + 1, ...vals, status, r.error || ''].join(',');
      });
      const csv = [header.join(','), ...body].join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'reporte-' + Date.now() + '.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    };
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
    this.clearCheckpoint();
    if (this.resolveNext) { this.resolveNext(); this.resolveNext = null; }
    if (this.panel && this.panel.parentNode) this.panel.remove();
    this.panel = null;
    chrome.runtime.sendMessage({ type: 'GENERIC_FILL_STOPPED' });
  },

  log(msg) {
    document.dispatchEvent(new CustomEvent('__digitar_log', { detail: '[GF] ' + msg }));
  },

  notify(msg) {
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
}
