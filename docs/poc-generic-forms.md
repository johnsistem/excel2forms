# PoC: Formulario Genérico — Resumen

## Qué se probó

Se reutilizó el motor de automatización existente para llenar formularios web
genéricos sin escribir código específico para cada sitio.

## Flujo que funcionó

1. Abrir cualquier página con un formulario (input, select, textarea)
2. Cargar un archivo Excel (.xlsx) con columnas que coinciden con los campos
3. Click "Detectar Campos" → escanea la página y lista los campos encontrados
4. Mapear cada columna del Excel al campo correspondiente
5. Click "Ejecutar" → llena N registros automáticamente

## Validación (sandbox.html)

Se probó con un formulario de prueba local en `sandbox.html` con campos:
- nombre, cedula, correo, telefono, cargo

Se cargó un Excel con 3 filas de datos, se mapearon las columnas a los campos
y se ejecutó. Los 3 registros se llenaron completos y correctos.

## Qué NO se intentó

- Formularios con tablas dinámicas (MINED, datagrids)
- Páginas con modales que se abren después de clicks
- Selectores múltiples con el mismo name/id
- Páginas con iframes o shadow DOM

## Arquitectura

- `content.js` → `GENERIC_INJECTOR` (scanFields, fillField, createPanel, etc.)
- `background.js` → `findCurrentTab` + handlers (DETECT_FIELDS, GENERIC_FILL_START/STOP)
- `popup.js` → 3ra pestaña "Formulario Genérico" (subida Excel, detección, mapeo, ejecución)
- `popup.html` → UI de la 3ra pestaña
- `manifest.json` → permisos para `http://localhost:*/*` y `file:///*`

## Modos de avance

- **Automático**: llena todos los registros sin pausa
- **Manual**: muestra botón "Siguiente →" después de cada registro

## Límites conocidos

- El `<select>` se llena con `el.value = value`, no busca por texto de option
- No detecta botones (`<button>`), solo input/select/textarea
- No hay sistema de pasos (click, espera)
- No agrupa campos por contenedor (tabla, fieldset)

## Para escalar (producción)

### Corto plazo (formularios planos funcionales)
- **Manejo de `<select>`**: buscar por texto del option además de value, con
  normalización (tildes, espacios, mayúsculas)
- **Detección de botones**: incluir `<button>` y `a[role="button"]` en
  `scanFields` para que aparezcan en el mapeo
- **Sistema de pasos**: permitir agregar clicks y esperas después del llenado
  (ej: click "Guardar", esperar "Éxito")
- **Filtro de datagrids**: excluir campos dentro de tablas de datos para no
  ensuciar la detección
- **Selector único**: cuando hay múltiples elementos con el mismo `name`,
  generar selectores tipo `:nth-of-type` o incluir el contexto del padre

### Mediano plazo (formularios complejos)
- **Agrupación por contenedor**: detectar que campos están dentro de un mismo
  `<tr>`, `<fieldset>` o `<div>` y presentarlos como grupo
- **Campos dinámicos**: escanear nuevamente después de clicks (modales, tabs)
- **Iframes**: soporte para formularios dentro de iframes
- **Previsualización en vivo**: mostrar en la página qué campo se va a llenar
  al pasar el mouse sobre el mapeo

### Largo plazo (producto)
- **Grabación de macros**: el usuario hace clic en "Grabar", interactúa con la
  página, y la extensión registra los pasos automáticamente
- **Reconocimiento de patrones**: detectar automáticamente tablas de datos,
  formularios de búsqueda + resultado, y sugerir el mapeo
- **Múltiples páginas por flujo**: un solo Excel puede llenar 2 o 3 páginas
  distintas en secuencia
- **Exportar/importar configs**: compartir mapeos entre usuarios

## Conclusión de la PoC

Sí, el motor actual puede convertirse en una herramienta genérica para
automatizar captura de datos en formularios web. La extensión sigue haciendo
exactamente lo mismo para MINED. El modo "Formulario Genérico" es una pestaña
nueva que convive al lado. Cero riesgos.

## Plan de trabajo (checklist)

- [x] Definir alcance “básico” (formularios planos + pasos mínimos)
- [x] Agregar UI para “Pasos (JSON)” en la pestaña Formulario Genérico
- [x] Implementar motor de pasos en `content.js` (fill/click/wait/dialog por fila)
- [x] Mejorar llenado genérico:
  - [x] `<select>` por texto (normalización: tildes/espacios/case) y fallback a value
  - [x] Soporte básico para combobox/autocomplete (role=combobox / role=option)
- [x] Mejorar detección genérica (`scanFields`):
  - [x] Incluir botones (`button`, `a[role="button"]`)
  - [x] Selector único (fallback con ruta + `:nth-of-type`)
  - [x] Filtro básico para datagrids/tablas de datos
- [ ] Verificación rápida en `sandbox.html` y validación con un flujo tipo MINED (confirmación doble + OK)
