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

### 5. Botón Guardar

Permitir especificar un selector CSS opcional para el botón que guarda/envía el formulario.
Al final de cada fila, después de llenar todos los campos, el motor hará click en ese botón.

### 6. Guardar configuración

Guardar el mapeo en JSON localmente. Ejemplo:

```json
{
  "name": "Prueba Formulario",
  "fields": [
    { "excelColumn": "NOMBRE", "selector": "#nombre" },
    { "excelColumn": "CEDULA", "selector": "#cedula" }
  ],
  "submitSelector": "#btnGuardarGeneric"
}
```

No almacenar en servidor. Guardar localmente.

### 7. Ejecución

Agregar botón "Ejecutar". El motor debe:
- Leer cada fila del Excel
- Buscar los selectores configurados
- Llenar los campos
- Disparar eventos input/change
- Si hay `submitSelector`, hacer click en ese botón + esperar 500ms
- Avanzar fila por fila

### 8. Reutilizar código existente

Reutilizar al máximo: parseExcel(), readFileAsArrayBuffer(), createPanel(), simulateInput(), sistema de progreso, almacenamiento local.

### 9. Prueba

Crear un formulario de prueba dentro del sandbox: Nombre, Cédula, Correo, Teléfono, Cargo + botón Guardar.
Subir Excel. Mapear columnas. Especificar selector del botón. Ejecutar.
Si el formulario se llena y el botón se clickea correctamente sin escribir lógica específica, la hipótesis queda validada.

## Objetivo final

Responder esta pregunta:
¿El motor actual puede convertirse en una herramienta genérica para automatizar captura de datos en formularios web, incluyendo el guardado?

NO BUSCO ESCALABILIDAD.
NO BUSCO PRODUCTO FINAL.
NO BUSCO NUEVAS FUNCIONES.
SOLO QUIERO UNA PRUEBA FUNCIONAL DE CONCEPTO.
