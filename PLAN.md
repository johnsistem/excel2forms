# Plan de Implementación - DigitarExtension

## Visión General
Extensión Chrome Manifest V3 para digitalizar actas de notas MINED (Nicaragua) offline-first, operando completamente desde una memoria USB sin dejar rastro.

## Arquitectura

### Componentes

1. **Core de Extensión** (Manifest V3)
   - Popup camuflado como "Asistente de Accesibilidad"
   - Offscreen Document para OCR (evita sleep del Service Worker)
   - Content Script para inyección en serviciosenlinea.mined.gob.ni

2. **Módulo OCR Local**
   - **Primario: Tesseract.js** empaquetado en la USB. Las actas impresas se leen perfecto con OCR clásico, sin depender del navegador.
   - Futuro opcional: `window.ai` / Gemini Nano (solo si el Chrome de la oficina lo soporta, algo poco probable en PCs bloqueadas).

3. **Motor de Inyección Fantasma**
   - Simula eventos humanos (`input`, `change`, `keydown`)
   - Retrasos aleatorios **5-15s por alumno** para que sea rápido pero仍 parezca natural
   - Corre en background: el digitador puede navegar a otra pestaña mientras se llena
   - Dispara `__doPostBack()` nativo de ASP.NET después de cada alumno para actualizar `__VIEWSTATE` y evitar `validation of viewstate MAC failed`

4. **Sistema de Licencias**
   - Firma asimétrica: token firmado con llave privada (tuya), verificado con llave pública embebida en el código
   - El token se guarda en un **archivo dentro de la USB** (no en `chrome.storage.local` para no dejar rastro en la PC)
   - Solo en memoria volátil durante la sesión
   - Bloqueo automático al expirar

5. **Camuflaje**
   - JavaScript-Obfuscator en build (ofusca, no protege criptográficamente)
   - Sin conexiones de red ni logs

### Flujo de Datos

```
USB → chrome://extensions (load unpacked)
    → Escaneo OCR local (Tesseract.js: imagen → JSON)
    → Validación visual (preview tabla)
    → Inyección en formulario MINED (5-15s por alumno, background)
    → Guardado manual por usuario
```

## Plan de Implementación por Fases

### Fase 1: Esqueleto y Camuflaje
- Crear estructura Manifest V3
- UI del popup con diseño camuflado
- Offscreen document para OCR (evita límite de 30s del Service Worker)
- Build script con obfuscator

### Fase 2: OCR Local
- Integrar Tesseract.js (desde popup + Offscreen Document, no desde Service Worker)
- Procesar imagen → JSON estructurado
- Preview de validación

### Fase 3: Inyección Fantasma
- Investigar si el formulario MINED usa `__doPostBack()` o `ValidateRequest`
- Content script para detectar inputs
- Disparar postbacks nativos de ASP.NET
- Retrasos 5-15s por alumno
- Sandbox de pruebas: HTML local que simula el formulario MINED

### Fase 4: Licencias
- Generador de tokens con firma asimétrica (Node.js)
- Token almacenado en archivo USB, no en chrome.storage
- Validación local al inicio
- UI de bloqueo

### Fase 5: Pruebas y Distribución
- Sandbox local para probar sin conexión al sitio real
- Prueba con actas reales
- Script de build para USB
- Documentación de uso
