# Feature: Formulario Genérico

## Objetivo de esta rama

Rama: `feature-generic-forms`

NO modificar la funcionalidad actual del MINED.
La rama actual del MINED debe seguir funcionando exactamente igual.

## Objetivo principal

Demostrar que el motor de automatización existente puede reutilizarse para llenar formularios web genéricos sin escribir código específico para cada sitio.

## NO quiero

- Marketplace
- IA
- Biblioteca de plantillas
- Compartir plantillas
- Multiempresa
- SaaS

NO CONSTRUIR NADA DE ESO.

SOLO QUIERO VALIDAR UNA IDEA.

## Hipótesis

Actualmente la extensión funciona para MINED porque conoce los selectores y el flujo.
Quiero comprobar si la misma extensión puede funcionar en cualquier página web mediante un sistema simple de mapeo.

## Funcionalidad a construir

### 1. Nuevo modo experimental

Agregar una pestaña o modo llamado: "Formulario Genérico"

### 2. Detección de campos

Cuando el usuario pulse "Detectar Campos", la extensión debe analizar la página actual y encontrar: input, select, textarea.
Mostrar una lista con: Nombre visible, ID, Name, Selector sugerido.

### 3. Carga de Excel

Reutilizar el sistema actual de carga de Excel. No reescribirlo.

### 4. Mapeo

Permitir asociar: Columna Excel → Campo detectado.
Ejemplo: NOMBRE → #nombre, CEDULA → #cedula, SALARIO → #salario

### 5. Guardar configuración

Guardar el mapeo en JSON localmente. Ejemplo:

```json
{
  "name": "Prueba Formulario",
  "fields": [
    { "excelColumn": "NOMBRE", "selector": "#nombre" },
    { "excelColumn": "CEDULA", "selector": "#cedula" }
  ]
}
```

No almacenar en servidor. Guardar localmente.

### 6. Ejecución

Agregar botón "Ejecutar". El motor debe:
- Leer cada fila del Excel
- Buscar los selectores configurados
- Llenar los campos
- Disparar eventos input/change
- Avanzar fila por fila

NO HACER CLICK EN BOTONES TODAVÍA.
NO HACER FLUJOS COMPLEJOS.
PRIMERA META: Llenar formularios simples.

### 7. Reutilizar código existente

Reutilizar al máximo: parseExcel(), renderPreview(), createPanel(), simulateInput(), sistema de progreso, almacenamiento local.

### 8. Prueba

Crear un formulario de prueba dentro del sandbox: Nombre, Cédula, Correo, Teléfono, Cargo.
Subir Excel. Mapear columnas. Ejecutar.
Si el formulario se llena correctamente sin escribir lógica específica, la hipótesis queda validada.

## Objetivo final

Responder esta pregunta:
¿El motor actual puede convertirse en una herramienta genérica para automatizar captura de datos en formularios web?

NO BUSCO ESCALABILIDAD.
NO BUSCO PRODUCTO FINAL.
NO BUSCO NUEVAS FUNCIONES.
SOLO QUIERO UNA PRUEBA FUNCIONAL DE CONCEPTO.
