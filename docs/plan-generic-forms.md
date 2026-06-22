# Plan de Implementación — Formulario Genérico

## Rama

```
feature-generic-forms
```

Sin tocar nada de Excel2Forms. Todo el código nuevo convive en paralelo.

## Archivos a modificar / crear

| Archivo | Cambio |
|---|---|
| `popup.html` | Nueva 3ª pestaña "Formulario Genérico" con su contenido + campo selector botón |
| `src/popup.js` | Nuevo estado, UI de detección, mapeo, persistencia y ejecución genérica + submitSelector |
| `src/content.js` | Nuevo `GENERIC_INJECTOR` — detección de campos + llenado genérico + click a botón |
| `src/background.js` | Nuevos tipos de mensaje (`DETECT_FIELDS`, `GENERIC_FILL_START`, `GENERIC_FILL_STOP`) |
| `sandbox.html` | Nuevo formulario de prueba simple (Nombre, Cédula, Correo, Teléfono, Cargo) + botón Guardar |
| `docs/generic-forms-spec.md` | Especificación de referencia |
| `docs/plan-generic-forms.md` | Este plan |

Sin cambios en: `parseExcel()`, `renderPreview()`, `simulateInput()`, ni ningún flujo Excel2Forms.

## Arquitectura de mensajes

```
[Popup]                          [Background]                  [Content]
   │                                  │                           │
   ├─ DETECT_FIELDS ─────────────────→┤                           │
   │                                  ├─ DETECT_FIELDS ──────────→│
   │                                  │                           ├─ scanDOM()
   │                                  │                           │  → [{ label, id, name, selector, type }]
   │                                  │←─────── fields[] ────────┤
   │←─────── fields[] ───────────────┤                           │
   │                                  │                           │
   ├─ GENERIC_FILL_START ───────────→┤                           │
   │  (task in session storage)      ├─ GENERIC_FILL_START ─────→│
   │                                  │                           ├─ GENERIC_INJECTOR.start()
   │                                  │                           │  → por cada fila:
   │                                  │                           │     por cada field mapping:
   │                                  │                           │       querySelector()
   │                                  │                           │       fillField()
   │                                  │                           │       sleep(delay)
   │                                  │                           │     click(submitSelector) ← NUEVO
   │                                  │                           │     sleep(500)
   │                                  │←─── GENERIC_PROGRESS ────┤
```

## Componentes en detalle

### 1. UI — Nueva pestaña en popup.html

```
Tab 1: "Cargar Data"     (Excel2Forms, existente)
Tab 2: "Configuración"   (Excel2Forms, existente)
Tab 3: "Formulario Genérico"  ← NUEVA
```

Dentro de la pestaña genérica:
- Upload zone para Excel
- Vista previa
- Botón "Detectar Campos"
- Lista de campos detectados
- Mapeo: Columna Excel → Campo en página
- Selector del botón Guardar (input text opcional)
- Guardar/Cargar configuración
- Modo de avance (auto/manual)
- Delay entre campos
- Ejecutar / Detener

### 2. Detección de campos (content.js — GENERIC_INJECTOR.scanFields())

- Escanea: `input`, `select`, `textarea`
- Filtra: hidden, submit, button, file, image, reset, checkbox, radio
- Para cada elemento: label (de label asociado, aria-label, placeholder, name, id)
- Construye selector CSS: `#id` o `tag[name="name"]`
- Retorna: `[{label, id, name, selector, tag, type}]`

### 3. Carga de Excel (popup.js)

- `parseExcelGeneric(buf)`: función nueva que parsea Excel a array plano de objetos
  - Reusa `XLSX.read()`, mismo patrón que `parseExcel()`
  - Salida: `{rows: [{col1: val1, ...}], cols: ['col1', 'col2', ...]}`
- `renderGenericPreview()`: tabla simple con columnas dinámicas

### 4. Mapeo (popup.js)

- Select por cada columna del Excel
- Opciones = campos detectados
- Valor guardado = selector CSS del campo

### 5. Botón Guardar

- Input de texto para selector CSS del botón
- Se guarda en la configuración como `submitSelector`
- Durante ejecución, después de llenar todos los campos de una fila:
  - Si `submitSelector` está definido → `document.querySelector(submitSelector).click()`
  - Espera 500ms
  - Avanza a la siguiente fila

### 6. Persistencia (popup.js + chrome.storage.local)

```json
{
  "genericConfigs": [
    {
      "id": "abc123",
      "name": "Planilla Empleados",
      "url": "https://ejemplo.com/form",
      "fields": [
        { "excelColumn": "NOMBRE", "selector": "#nombre" },
        { "excelColumn": "CEDULA", "selector": "#cedula" }
      ],
      "submitSelector": "#btnGuardar",
      "mode": "auto",
      "delay": 500
    }
  ]
}
```

### 7. Motor de ejecución (content.js — GENERIC_INJECTOR)

```javascript
async start() {
  // Lee genericTask de chrome.storage.session
  // Por cada fila:
  //   Por cada field mapping:
  //     querySelector(selector)
  //     fillField(el, value)  // maneja input/select/textarea
  //     sleep(delay)
  //   Si submitSelector:
  //     click en el botón
  //     sleep(500)
  //   Avanza fila (auto o manual)
  // Panel de progreso
}
```

### 8. Formulario de prueba (sandbox.html)

Card con:
- input#nombre (text)
- input#cedula (text)
- input#correo (email)
- input#telefono (tel)
- select#cargo (option: docente, director, administrativo, tecnico)
- button#btnGuardarGeneric → botón Guardar

## Lo que se reutiliza SIN CAMBIOS

| Código | Archivo | Uso |
|---|---|---|
| `readFileAsArrayBuffer()` | popup.js | Leer archivo Excel |
| `XLSX.read()` (vía parseExcelGeneric) | popup.js | Parsear Excel |
| `escHtml()` | popup.js | Sanitizar HTML |
| `simulateInput()` | content.js | Llenar inputs (replicado lógica en fillField) |
| Panel pattern (createPanel/updatePanel) | content.js | Progreso visual |
| `sleep()` | content.js | Delays |
| `chrome.storage.session/local` | background.js | Almacenamiento |
| Drag-drop + upload CSS | popup.css | UI de carga |
| Sistema de pestañas | popup.js | Navegación entre tabs |
| `findCurrentTab()` (nueva) | background.js | Encontrar pestaña activa |

## Orden de implementación (PoC original)

| Paso | Qué | Archivos |
|---|---|---|
| 1 | Guardar spec y plan como referencia | `docs/*` |
| 2 | Formulario de prueba en sandbox | `sandbox.html` |
| 3 | Detector de campos + motor genérico | `src/content.js` |
| 4 | Nuevos mensajes en background | `src/background.js` |
| 5 | UI: 3ª pestaña (HTML) | `popup.html` |
| 6 | UI: Lógica de detección, mapeo, ejecución | `src/popup.js` |
| 7 | **Botón Guardar** (post-PoC) | `sandbox.html`, `popup.html`, `popup.js`, `content.js` |
| 8 | Prueba end-to-end con sandbox | manual |

## Prueba de validación

1. Abrir `sandbox.html` en el navegador
2. Abrir popup → pestaña "Formulario Genérico"
3. Cargar Excel con columnas: NOMBRE, CEDULA, CORREO, TELEFONO, CARGO
4. Pulsar "Detectar Campos" → ver lista con `#nombre`, `#cedula`, `#correo`, `#telefono`, `#cargo`
5. Mapear cada columna a su campo
6. Escribir `#btnGuardarGeneric` en "Selector del botón"
7. Guardar configuración
8. Pulsar "Ejecutar"
9. Verificar que el formulario se llena fila por fila y el botón Guardar se clickea

**Criterio de éxito:** El formulario se llena y se guarda completamente sin escribir una sola línea de lógica específica para ese formulario.

## Lo que NO se construye

- Marketplace
- IA / OCR
- Biblioteca de plantillas
- Compartir configuraciones
- Multiempresa
- SaaS / servidor
- Flujos complejos (multi-paso, condicionales)
- Soporte para iframes, shadow DOM
- Manejo de modales/diálogos después del click (por ahora)
