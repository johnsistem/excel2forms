# Tareas de Implementación

## [ ] Fase 1: Estructura y Camuflaje
- [ ] 1.1 Crear `manifest.json` (Manifest V3, permisos, icons)
- [ ] 1.2 Crear `popup.html` con diseño de "Asistente de Accesibilidad"
- [ ] 1.3 Crear `popup.js` - estructura base del popup
- [ ] 1.4 Crear `popup.css` - estilos camuflados
- [ ] 1.5 Crear `background.js` (service worker, solo paso de mensajes)
- [ ] 1.6 Crear `offscreen.html` + `offscreen.js` para correr OCR (evita sleep del SW)
- [ ] 1.7 Crear `content.js` (content script placeholder)
- [ ] 1.8 Configurar `package.json` con dependencias
- [ ] 1.9 Configurar webpack/obfuscator en build script
- [ ] 1.10 Probar carga en chrome://extensions

## [ ] Fase 2: OCR Local
- [ ] 2.1 Integrar Tesseract.js (librería en Offscreen Document, no en Service Worker)
- [ ] 2.2 Implementar subida de imagen (drag & drop / file input en popup)
- [ ] 2.3 Enviar imagen al Offscreen Document para procesar OCR
- [ ] 2.4 Parsear raw text a JSON estructurado (nombre, notas, etc.)
- [ ] 2.5 Mostrar preview en tabla para validación visual
- [ ] 2.6 Agregar botón "Confirmar y Poblar" que guarda datos en chrome.storage.session (volátil)
- [ ] 2.7 Manejo de errores (imagen borrosa, sin texto, etc.)

## [ ] Fase 3: Inyección Fantasma
- [ ] 3.1 **Investigar** formulario MINED: ¿usa `__doPostBack()`, `WebForm_DoCallback`, o `ValidateRequest`?
- [ ] 3.2 Crear **sandbox local** (HTML que simula el formulario MINED) para pruebas sin conexión real
- [ ] 3.3 Content script: detectar inputs de notas en el DOM
- [ ] 3.4 Mapear campos del formulario MINED a columnas del JSON
- [ ] 3.5 Implementar simulación de eventos (input, change, keydown)
- [ ] 3.6 Implementar retraso aleatorio (5-15s por alumno)
- [ ] 3.7 Disparar `__doPostBack()` nativo después de cada alumno para actualizar __VIEWSTATE
- [ ] 3.8 Botón "Iniciar Llenado" en popup → mensaje a content script
- [ ] 3.9 Barra de progreso en popup durante inyección (puede correr en background)
- [ ] 3.10 Probar contra sandbox local antes de tocar el sitio real

## [ ] Fase 4: Licencias
- [ ] 4.1 Generar par de llaves RSA (privada para firmar, pública para verificar)
- [ ] 4.2 Implementar generador de tokens firmados en script Node.js aparte
- [ ] 4.3 Implementar validador con llave pública en la extensión
- [ ] 4.4 Token se almacena en **archivo dentro de la USB** (no en chrome.storage.local)
- [ ] 4.5 UI de ingreso de token (leer archivo o escribir token manualmente)
- [ ] 4.6 UI de bloqueo si token vencido o inválido
- [ ] 4.7 Cargar token a memoria volátil al iniciar, nunca persistir en la PC

## [ ] Fase 5: Pulido y Distribución
- [ ] 5.1 Build script que genera carpeta para USB (con obfuscation)
- [ ] 5.2 Probar flujo completo con sandbox local
- [ ] 5.3 Probar flujo completo con acta real contra sandbox
- [ ] 5.4 Manejo de edge cases (varios alumnos, materias, imágenes múltiples, etc.)
- [ ] 5.5 Escribir instrucciones de uso (README)
- [ ] 5.6 Prueba en PC limpia desde USB
