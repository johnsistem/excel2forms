# Excel2Forms - Explicación completa

## ¿Qué hace?
Extensión de Chrome que **llena formularios web automáticamente** usando datos de un archivo Excel. Cargás el Excel, mapeás las columnas a los campos del formulario, y la extensión completa los datos por vos.

---

## Flujo de uso

### 1. Abrir extensión
Hacés clic en el ícono → se abre en una pestaña grande.

### 2. Cargar Excel
Arrastrás un archivo `.xlsx` o `.xls` o hacés clic para seleccionarlo.

### 3. Detectar Campos
La extensión escanea la página con el formulario y detecta todos los inputs, selects y textareas disponibles.

### 4. Mapear Columnas
Ves las columnas de tu Excel y los campos detectados. Elegís qué columna va a qué campo del formulario.

### 5. Ejecutar
La extensión llena cada registro del Excel en el formulario, uno por uno.

---

## Funcionalidades

### Modos de Avance
- **Automático**: llena todos los registros sin intervención
- **Manual (fila por fila)**: avanza registro por registro con un clic

### Velocidad
- Rápida (200ms), Normal (500ms), Lenta (1000ms) entre campos

### Botón Guardar
Configurás qué botón se presiona después de llenar cada registro.

### Configuraciones Guardadas
Podés guardar el mapeo de columnas → campos para reusarlo después.

### Reanudar Ejecución
Si cerrás la extensión mientras está llenando, al abrirla de nuevo te pregunta si querés reanudar.

### Resumen Final
Muestra un resumen de registros correctos y errores, y permite descargar un reporte CSV.

### Tema Oscuro/Claro
Botón en la esquina superior derecha para cambiar entre tema oscuro (por defecto) y claro.

### Español / Inglés
Selector de idioma en Configuración.

---

## Sistema de Licencia

- **Prueba gratuita**: 50 registros sin licencia
- **Licencia paga**: token con formato `YYYY-MM-DD:<hash>`
- El token se valida localmente con SHA-256
- Al activar la licencia, se elimina el límite de prueba

### Cómo generar un token
```
Fecha: 2027-12-31
Clave secreta: Digitar2024!MachineLock
Hash: SHA-256("2027-12-31:Digitar2024!MachineLock")
Token: 2027-12-31:<hash>
```

---

## Arquitectura

### manifest.json
- Permisos: `storage`, `activeTab`, `scripting`
- No usa content_scripts fijos ni host_permissions
- Inyecta el content script solo cuando el usuario ejecuta acciones

### popup.js (Interfaz)
- Maneja toda la UI: tabs, uploads, mapeo, ejecución
- Se comunica con background.js por mensajes
- Guarda configuraciones y checkpoints en chrome.storage

### background.js (Service Worker)
- Gestiona licencias (validación, trial, activación)
- Busca la pestaña activa con `findCurrentTab()`
- Inyecta content.js en la página del formulario
- Maneja mensajes: DETECT_FIELDS, GENERIC_FILL_START, GENERIC_FILL_STOP

### content.js (Inyectado en la página)
- `GENERIC_INJECTOR`: llena los campos del formulario
- Tiene un panel flotante con progreso
- Maneja inputs, selects y textareas
- Dispara eventos input/change para que el formulario reaccione
- Guarda checkpoint para reanudar si se interrumpe

---

## Flujo técnico detallado

```
Usuario: Carga Excel
  → popup.js lee el archivo con XLSX
  → parsea filas como objetos { columna: valor }
  → muestra preview en la UI

Usuario: Detecta Campos
  → popup.js envía DETECT_FIELDS a background.js
  → background.js inyecta content.js en la pestaña activa
  → content.js escanea inputs/selects/textarea
  → devuelve lista de campos encontrados

Usuario: Mapea columnas → campos
  → popup.js muestra selects para cada columna
  → usuario elige qué campo del formulario corresponde

Usuario: Ejecuta
  → popup.js envía GENERIC_FILL_START con datos + mapeo
  → background.js inyecta content.js (si no está)
  → content.js recorre filas del Excel
  → por cada fila: llena campos usando querySelector + dispatchea eventos
  → si hay submitSelector: hace clic en el botón
  → guarda checkpoint en storage.local
  → muestra progreso en panel flotante
  → al terminar: muestra resumen
```

---

## Diferencia con File Form Filler (competencia)

| Característica | Excel2Forms | File Form Filler |
|---|---|---|
| Mapeo manual columna → campo | ✅ | ❌ (solo automático) |
| Guardar configuraciones | ✅ | ❌ |
| Modo manual fila por fila | ✅ | ❌ |
| Reanudar ejecución | ✅ | ❌ |
| Tema oscuro/claro | ✅ | ❌ |
| Español + Inglés | ✅ | ❌ (solo inglés) |
| Generar plantilla desde la página | ❌ | ✅ |
| Pegar datos como texto | ❌ | ✅ |
| Modelo | Prueba 50 + licencia paga | 15 usos/mes gratis + pago |
