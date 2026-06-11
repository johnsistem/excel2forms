# Tareas - Digitar Asistente

## Completado ✓
- [x] Estructura Manifest V3 + webpack + obfuscator
- [x] Popup con pestañas Cargar Acta / Configuración
- [x] Loader de Excel con SheetJS (parseo + preview)
- [x] Sandbox local para pruebas (sandbox.html)
- [x] Content script: búsqueda de estudiante + selección de materia
- [x] Inyección materia por materia: llena cuali/cuanti y Guarda
- [x] Manejo de modal de confirmación "¿Estás seguro?" + OK
- [x] 3 modos: Semi / Por Estudiante / Automático
- [x] Panel flotante con progreso en la página del MINED
- [x] Machine Locking: ID único de máquina (SHA-256)
- [x] Sistema de licencias con vencimiento (token: fecha:hash)
- [x] Script generar-licencia.js (1y, 6m, 3m, fecha exacta)
- [x] Prueba gratuita: 50 estudiantes en total
- [x] Bloqueo de funcionalidad si no hay licencia
- [x] Eliminado OCR/Tesseract (solo Excel)
- [x] MANUAL.md creado

## Pendientes
- [ ] Limpiar debug logging excesivo (opcional)

## Escalar (futuro)
- [ ] Asistente de detección de campos: escanea inputs, selects y botones de cualquier página
- [ ] Modo semi-automático: el digitador señala los campos una vez y se guarda el perfil
- [ ] Sistema de perfiles por cliente (MINED, INSS, etc.)
- [ ] Detectar campos por placeholder, aria-label, texto del botón (no requiere IDs fijos)
- [ ] Hacerlo 100% configurable sin tocar código
