# Excel2Forms - Plan Pre-Lanzamiento

## Objetivo
Resolver los principales riesgos que un usuario percibe al procesar cientos de registros desde Excel hacia formularios web. Aumentar la confianza en la automatización antes de agregar funciones avanzadas.

---

## Prioridad 1 - Persistencia y Reanudación (CRÍTICO)

**Problema:** Si el navegador se cierra, la página se recarga o ocurre un error durante una ejecución larga, el usuario pierde el progreso.

**Requerimiento:** Guardar automáticamente en `chrome.storage.local`:
- `currentRowIndex`
- `processedRows`
- `failedRows`
- `mappingConfig`
- `executionStatus`
- nombre del archivo cargado

**Comportamiento esperado:**
Al abrir nuevamente la extensión, si existe una ejecución incompleta:
> "Se encontró una ejecución pausada en la fila 327. ¿Desea reanudar?"
> Opciones: Reanudar | Reiniciar

---

## Prioridad 2 - Manejo de Errores por Fila (CRÍTICO)

**Problema:** Actualmente un error puede detener toda la ejecución.

**Requerimiento:**
- Procesar cada fila dentro de `try/catch` independiente
- Si ocurre un error: registrar fila, registrar mensaje, marcar como fallido
- Opciones: Reintentar | Saltar fila | Pausar ejecución

**Resultado:** Una fila defectuosa no debe destruir una ejecución completa.

---

## Prioridad 3 - Reporte Final Exportable (CRÍTICO)

**Requerimiento:**
Generar un nuevo Excel con:
- Columnas originales + Estado (Éxito / Error / Saltada) + MensajeError
- Resumen visual: Procesadas correctamente, Con errores, Saltadas
