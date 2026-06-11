# Plan de Implementación — Formulario Genérico

## Rama

```
feature-generic-forms
```

Sin tocar nada de MINED. Todo el código nuevo convive en paralelo.

## Archivos a modificar / crear

| Archivo | Cambio |
|---|---|
| `popup.html` | Nueva 3ª pestaña "Formulario Genérico" con su contenido |
| `src/popup.js` | Nuevo estado, UI de detección, mapeo, persistencia y ejecución genérica |
| `src/content.js` | Nuevo `GENERIC_INJECTOR` — detección de campos + llenado genérico |
| `src/background.js` | Nuevos tipos de mensaje (`DETECT_FIELDS`, `GENERIC_FILL_START`, `GENERIC_FILL_STOP`) |
| `sandbox.html` | Nuevo formulario de prueba simple (Nombre, Cédula, Correo, Teléfono, Cargo) |
| `docs/generic-forms-spec.md` | Especificación de referencia |
| `docs/plan-generic-forms.md` | Este plan |

Sin cambios en: `parseExcel()`, `renderPreview()`, `simulateInput()`, ni ningún flujo MINED.

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
   │                                  │                           │     sleep() / waitForClick()
   │                                  │←─── GENERIC_PROGRESS ────┤
```

## Componentes en detalle

### 1. UI — Nueva pestaña en popup.html

```
Tab 1: "Cargar Acta"     (MINED, existente)
Tab 2: "Configuración"   (MINED, existente)
Tab 3: "Formulario Genérico"  ← NUEVA
```

### 2. Detección de campos (content.js — GENERIC_INJECTOR.scanFields())

- Escanea: `input`, `select`, `textarea`
- Filtra: hidden, submit, button, file, image, reset
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

### 5. Persistencia (popup.js + chrome.storage.local)

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
      "mode": "auto",
      "delay": 500
    }
  ]
}
```

### 6. Motor de ejecución (content.js — GENERIC_INJECTOR)

```javascript
async start() {
  // Lee genericTask de chrome.storage.session
  // Por cada fila:
  //   Por cada field mapping:
  //     querySelector(selector)
  //     fillField(el, value)  // maneja input/select/textarea
  //     sleep(delay)
  //   Avanza fila (auto o manual)
  // Panel de progreso
}
```

### 7. Formulario de prueba (sandbox.html)

Card con:
- input#nombre (text)
- input#cedula (text)
- input#correo (email)
- input#telefono (tel)
- select#cargo (option: docente, director, administrativo, tecnico)

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

## Orden de implementación

| Paso | Qué | Archivos |
|---|---|---|
| 1 | Guardar spec y plan como referencia | `docs/*` |
| 2 | Formulario de prueba en sandbox | `sandbox.html` |
| 3 | Detector de campos + motor genérico | `src/content.js` |
| 4 | Nuevos mensajes en background | `src/background.js` |
| 5 | UI: 3ª pestaña (HTML) | `popup.html` |
| 6 | UI: Lógica de detección, mapeo, ejecución | `src/popup.js` |
| 7 | Prueba end-to-end con sandbox | manual |

## Prueba de validación

1. Abrir `sandbox.html` en el navegador
2. Abrir popup → pestaña "Formulario Genérico"
3. Cargar Excel con columnas: NOMBRE, CEDULA, CORREO, TELEFONO, CARGO
4. Pulsar "Detectar Campos" → ver lista con `#nombre`, `#cedula`, `#correo`, `#telefono`, `#cargo`
5. Mapear cada columna a su campo
6. Guardar configuración
7. Pulsar "Ejecutar"
8. Verificar que el formulario se llena fila por fila correctamente

**Criterio de éxito:** El formulario se llena completamente sin escribir una sola línea de lógica específica para ese formulario.

## Lo que NO se construye

- Marketplace
- IA / OCR
- Biblioteca de plantillas
- Compartir configuraciones
- Multiempresa
- SaaS / servidor
- Click en botones del formulario destino
- Flujos complejos (multi-paso, condicionales)
- Soporte para iframes, shadow DOM
