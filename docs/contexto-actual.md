# Excel2Forms - Contexto Actual

## ¿Qué es?
Extensión de Chrome que automatiza el llenado de formularios web desde archivos Excel. El usuario carga un Excel plano (una fila = un registro, primera fila = nombres de columna), detecta los campos del formulario en la página activa, mapea columnas a campos, y ejecuta el llenado automático.

## Estado: Solo Genérico (MINED removido)
- MINED fue removido del HTML y guardado con `?.` en JS. No hay rastro visible de MINED en el popup.
- El código MINED en `background.js` y `content.js` sigue intacto pero inactivo (nunca recibe mensajes).
- `checkLicenseAccess()`, `checkLicenseStatus()`, `loadMachineID()` tienen early returns si los elementos no existen.

## Estructura de Archivos

### `manifest.json`
- Chrome Extension MV3
- `default_locale: es` con `__MSG_` para name/description
- Permisos: storage, activeTab, scripting
- Content script corre en: `serviciosenlinea.mined.gob.ni`, localhost, archivos locales
- Content security policy: permite wasm-unsafe-eval (necesario para xlsx.js)

### `src/popup.html` (148 líneas)
- Header con logo 64x64 + "Excel2Forms"
- 2 tabs: **Formulario Genérico** + **Configuración**
- Generic tab: upload zone, preview, detect fields, mapping UI, config save/load, execute/stop
- Settings tab: selector de idioma (Español/Inglés), versión
- Todos los textos con `data-i18n` para traducción

### `src/popup.js` (~815 líneas)
- **i18n**: `t(key, ...args)`, `loadTranslations(locale)`, `applyTranslations()`
- **Generic flow** (GF):
  - `initGenericTab()` — upload zone, file handling
  - `processFileGeneric()` — lee Excel con xlsx.js, parsea, renderiza preview
  - `detectGenericFields()` — envía `DETECT_FIELDS` al content script
  - `renderDetectedFields()`, `renderDetectedButtons()` — UI de campos/botones
  - `renderMappingUI()` — selects columna → campo
  - `saveGenericConfig()`, `loadGenericConfigs()`, `applyGenericConfig()`, `deleteGenericConfig()`
  - `executeGenericFill()` — envía `GENERIC_FILL_START` con rows + mapping
  - `stopGenericFill()` — envía `GENERIC_FILL_STOP`
- **MINED legacy** (guardado): `checkLicenseAccess()`, `confirmData()`, `clearData()`, etc.
- Todos los status messages usan `t()` para traducción

### `sandbox.html` (170 líneas)
- Formulario de prueba en inglés (Name, ID Number, Email, Phone, Position)
- Tabla de "Saved Records" con log en tiempo real
- Botón "Save" deshabilitado hasta que se llenen campos
- Listo para video demo

### `_locales/`
- `es/messages.json` — ~90+ claves en español
- `en/messages.json` — ~90+ claves en inglés
- Incluye: tabs, labels, placeholders, status errors, licencia, config

### `icons/`
- Generado por ChatGPT: icon16, icon32, icon48, icon128
- Azul con diseño de tabla Excel + formulario

### `background.js`
- Service worker principal
- Maneja `DETECT_FIELDS`, `GENERIC_FILL_START`, `GENERIC_FILL_STOP`
- Inyección `<script>` en página para `btn.click()` cross-world
- Código MINED legacy intacto (`FILL_START`, `FILL_STOP`, `VALIDATE_LICENSE`, etc.)

### `content.js`
- Se inyecta en MINED y localhost
- `scanFields()`: devuelve `{fields, buttons}` detectados
- Meta guard para evitar duplicación de listeners
- Código MINED legacy (`INJECTOR`, `SCRIPT_FILL`, etc.) intacto

## Cómo Usar (para video demo)
1. Abrir `sandbox.html` en Chrome (localhost o archivo local)
2. Abrir la extensión → pestaña "Formulario Genérico"
3. Cargar `tabla plana generica.xlsx` (500 registros)
4. Click "Detectar Campos" → detecta 5 campos + 1 botón
5. Click en el botón "Save" de la lista → llena el selector
6. Elegir Avance (Automático/Manual) y Velocidad
7. Click "Ejecutar" → llena los 500 registros uno por uno
8. Al final muestra resumen (si está marcado "Mostrar resumen al final")

## Próximos Pasos
- Subir a Chrome Web Store como Excel2Forms
- Empaquetar portable para USB (MINED)
- Mejorar UI para la store (screenshots, descripción)
