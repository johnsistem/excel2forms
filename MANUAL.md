# Manual - Digitar Asistente

## Instalación
1. Abrí `chrome://extensions`
2. Activá "Modo desarrollador"
3. Click "Cargar descomprimida" → seleccioná la carpeta `dist-usb/`
4. La extensión aparece como "Digitar Asistente"

## Prueba gratuita (500 registros)
- Sin licencia, se pueden procesar hasta **500 registros en total**
- El contador descuenta al hacer click en **Ejecutar**
- Se muestra un mensaje con los registros restantes
- Al llegar a 0, se bloquea y pide licencia
- El contador se guarda en `chrome.storage.local` (perfil de Chrome)
- Al desinstalar la extensión, el contador se borra

## Licencias
### Generar licencia (solo el desarrollador)
```bash
# 1 año (default)
node tools/generar-licencia.js

# 6 meses
node tools/generar-licencia.js 6m

# 3 meses
node tools/generar-licencia.js 3m

# Fecha exacta
node tools/generar-licencia.js 2026-12-31
```

El token generado es **universal** (no está atado a un ID de máquina). Se envía al cliente para que lo pegue en la extensión → Configuración → Activar Licencia.

### Formato del token
```
YYYY-MM-DD:<hash_sha256>
```

## Seguridad
- **Token universal**: no requiere ID de máquina, cualquier PC puede usarlo
- **Desinstalación**: al desinstalar, Chrome borra `chrome.storage.local` (licencia, contador trial)

## Construir la extensión
```bash
# Desarrollo
npm run build:dev

# Producción (minificado)
npm run build

# USB (ofuscado + protegido) — recomendado para distribuir
npm run build:usb
```

La carpeta `dist-usb/` es la que se copia a la USB. El código está ofuscado con `javascript-obfuscator`:
- `self-defending: true` — se rompe si intentan formatearlo
- `string-array-encoding: rc4` — strings encriptados
- `disable-console-output: true` — sin pistas en consola
- `rename-globals: true` — variables renombradas

## Modos de llenado
| Modo | Comportamiento |
|------|---------------|
| Semi-automático | Llena 1 materia → se detiene → click Siguiente |
| Por Estudiante | Llena todas las materias de 1 estudiante → se detiene → click Siguiente estudiante |
| Automático | Llena todo de corrido sin detenerse |

## Confirmación modal
Después de click "Guardar" en el MINED, la extensión maneja automáticamente:
1. Modal "¿Estás seguro?" → click "Sí, Guardar"
2. Modal de éxito → click "OK"

## Archivos importantes
- `src/background.js` — service worker, licencias, contador trial, machine ID
- `src/popup.js` — UI del popup, carga de Excel, confirmación
- `src/popup.html` — estructura del popup
- `src/content.js` — inyección de datos en el formulario MINED
- `src/popup.css` — estilos
- `tools/generar-licencia.js` — script para generar licencias (solo el desarrollador)
- `sandbox.html` — simulador para pruebas locales

## Stack
- Chrome Extension Manifest V3
- Webpack + CopyPlugin + javascript-obfuscator
- SheetJS (XLSX) para leer Excel
- 100% offline, sin conexiones externas
