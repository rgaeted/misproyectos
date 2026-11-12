# Reloj de tiempo e informe para clientes: diseño

Fecha: 2026-11-12

## Para qué

Ricardo quiere saber cuánto tiempo le dedica a cada proyecto y en qué tareas, para poder mandarle a cada cliente un **informe en PDF** con las horas trabajadas y las tareas realizadas. Nunca ha enviado un informe de este tipo, así que no hay un formato anterior que respetar.

El tiempo se registra **desde la plataforma**: Ricardo echa a andar un reloj en el proyecto, y ese tiempo queda asociado a los próximos pasos del proyecto, que hacen de tareas.

## Objetivos

1. **Un reloj por proyecto.** Cada proyecto tiene su propio reloj, y pueden correr varios a la vez en proyectos distintos. Dentro de un proyecto corre como máximo uno.
2. **Iniciar sin trámites.** Al apretar "Iniciar", el tiempo empieza a contar en ese mismo momento. Mientras corre, Ricardo elige la tarea:
   - uno de los próximos pasos del proyecto (los que no están "Completado"), o
   - una tarea nueva escrita en el momento, que queda creada como paso "Por trabajar" del proyecto.
3. **Cambiar de tarea sin detener el reloj.** El tiempo anterior queda en la tarea anterior y, desde el momento del cambio, cuenta para la nueva.
4. **Detener.** Al detener el reloj, el tiempo queda guardado.
5. **El reloj sobrevive al navegador.** Se guarda la hora de inicio en la base de datos, así que sigue corriendo aunque Ricardo cierre la pestaña o cambie de computador.
6. **Relojes visibles en el tablero.** En el tablero general se ve qué proyectos tienen el reloj corriendo y cuánto llevan, para no olvidar uno encendido. **[mi decisión, no lo objetó]**
7. **Corregir el registro.** En el proyecto se puede ver el tiempo registrado, editar la tarea y el inicio y fin de un tramo, borrar un tramo y agregar uno a mano (por ejemplo, si olvidó detener el reloj o trabajó sin la app). **[mi decisión, no lo objetó]**
8. **Informe en PDF.** Desde el proyecto, Ricardo elige la fecha de inicio y la de término y descarga un PDF con:
   - **Encabezado:** nombre del proyecto, período informado ("1-10-2026 al 31-10-2026") y nombre de Ricardo (el nombre de la cuenta).
   - **Resumen por tarea:** una tabla con cada tarea y sus horas en el período, más el total al final.
   - **Desglose por día:** fecha, tarea y horas, ordenado por fecha (y por tarea dentro del día).

## Fuera de alcance

- Montos, tarifas por hora o cruce con los pagos. El informe muestra solo horas.
- Un campo de "cliente" en el proyecto. El PDF usa el nombre del proyecto.
- Enviar el informe por correo desde la app. Ricardo descarga el PDF y lo envía él.
- Mostrar en el informe el estado de los pasos (completado o pendiente).
- Historial de informes generados. El PDF se genera cada vez desde los datos.

## Lo que lo haría un fracaso

- Perder tiempo registrado: que el reloj se detenga o se reinicie por recargar la página, cerrar el navegador o tener la app abierta en dos lugares.
- Que el informe muestre horas que no cuadran: la suma del desglose por día distinta del total, o distinta de la suma por tarea.
- Que iniciar el reloj obligue a llenar un formulario antes de que empiece a contar.

## Decisiones de comportamiento

- **Un tramo** es un período continuo dedicado a una tarea dentro de un proyecto: inicio, fin (vacío si está corriendo) y la tarea. No existe una entidad "sesión" aparte: una sesión con cambios de tarea es una seguidilla de tramos. **[mi decisión]**
- **Reloj corriendo** = el proyecto tiene un tramo sin fin. Como máximo uno por proyecto, garantizado por la base de datos.
- **Iniciar** cuando el reloj ya está corriendo (por ejemplo, desde otra pestaña) no hace nada y muestra el reloj actual. No crea un segundo tramo.
- **Cambiar de tarea:** cierra el tramo actual en el instante del cambio y abre uno nuevo con la nueva tarea en ese mismo instante. Si el tramo actual todavía no tiene tarea, se le asigna la tarea en vez de cortarlo. **[mi decisión: así, elegir la tarea en los primeros segundos no deja un tramo "sin tarea" de pocos segundos]**
- **Tiempo sin tarea:** un tramo que terminó sin tarea queda como "Sin tarea asignada". Se puede asignar después al editarlo. En el informe aparece como una fila propia, para que Ricardo lo vea antes de mandarlo.
- **Tramos muy cortos:** al detener o cambiar de tarea, un tramo de menos de 1 minuto se descarta. **[mi decisión, para que los clics de prueba no ensucien el informe]**
- **Nombre de la tarea en el informe:** el texto actual del paso. Cada tramo guarda además una copia del texto al asignarlo. Si después se borra el paso, el tramo conserva esa copia y el tiempo no se pierde (FK `on delete set null`), igual que los ítems de la lista "Hoy".
- **Días:** se cuentan en `America/Santiago`. Un tramo que cruza la medianoche se reparte entre los dos días en el desglose.
- **Período del informe:** incluye los días desde la fecha de inicio hasta la de término, ambos incluidos, en hora de Chile. Un tramo que solo en parte cae dentro del período cuenta solo esa parte. Un tramo que sigue corriendo se cuenta hasta el momento de generar el informe.
- **Formato de horas:** "2 h 15 min" en las filas. El total muestra además las horas en decimal con coma ("Total: 12 h 30 min (12,5 h)"). Para que las sumas cuadren, todo se calcula en minutos enteros por día y tarea (redondeando cada fila de día-tarea al minuto), y el resumen por tarea y el total se suman a partir de esas filas. **[mi decisión]**
- **Edición:** el fin debe ser posterior al inicio, y un tramo no puede quedar en el futuro. Se permiten tramos que se solapan con otros del mismo proyecto. **[mi decisión: no vale la pena bloquearlos; Ricardo los ve en la lista y los corrige]**
- **Archivar un proyecto con el reloj corriendo** detiene el reloj. **[mi decisión]**
- **Selector de tarea:** muestra todos los pasos que no están "Completado", incluidos los "En espera". **[mi decisión]**
- **Cambiar de tarea en un tramo de menos de 1 minuto que ya tenía tarea:** se descarta ese tramo y la nueva tarea empieza en el momento del cambio, igual que al detener. **[mi decisión]**
- **Agrupación en el informe:** por `step_id`, usando el texto actual del paso. Los tramos de pasos borrados (`step_id` nulo con copia) se agrupan por la copia del texto. Los que no tienen tarea van a "Sin tarea asignada". Las filas que redondean a 0 min no aparecen. **[mi decisión]**
- **Horas en decimal:** hasta 2 decimales con coma, sin ceros sobrantes ("12,5 h", "3,25 h"). **[mi decisión]**
- **"Esta semana"** en el panel: de lunes a domingo, en hora de Chile. **[mi decisión]**
- **Caracteres que el PDF no puede imprimir** (por ejemplo, emojis en el texto de una tarea): se quitan o se reemplazan, para que el PDF se genere igual. Helvetica de `pdf-lib` lanza un error con ellos. **[mi decisión]**
- **Período sin tiempo registrado:** el PDF igual se genera, con el encabezado y el texto "No hay tiempo registrado en este período." **[mi decisión]**

## Cómo se construye (lo que ya existe y lo que decidí)

La feature sigue los patrones de la app (Next.js 15, Drizzle, RLS por usuario, `mutate({ op })`, `getBoard` con caché y tag), igual que pagos y cerrar el día.

**Datos** (migración nueva):

- `time_entries`:
  - Columnas: `id` (uuid), `project_id` (`text`, igual que `projects.id`; FK a `projects`, cascade), `step_id` (uuid, FK a `project_steps` on delete set null, nulo), `task_text` (texto, copia, `''` si no hay tarea), `started_at` (`timestamptz`), `ended_at` (`timestamptz`, nulo = corriendo), `created_at`.
  - Índice único parcial sobre `project_id` donde `ended_at is null`, para que haya un solo reloj por proyecto.
  - Índice sobre `(project_id, started_at)`.
  - Política RLS como las de `project_steps`: el proyecto debe ser del usuario actual.

**Operaciones nuevas en `mutate`** (todas validan que el proyecto o el tramo sean del usuario):

- `startTimer { projectId }`: crea un tramo con `started_at = now()` si no hay uno corriendo.
- `setTimerTask { projectId, stepId } | { projectId, text }`: con `text`, primero crea el paso "Por trabajar" al final de la lista. Luego asigna la tarea o corta y abre un tramo, según las reglas de arriba.
- `stopTimer { projectId }`: cierra el tramo corriendo con `ended_at = now()` (o lo descarta si dura menos de 1 minuto).
- `editTimeEntry { id, startedAt?, endedAt?, stepId? }`: corrige un tramo terminado.
- `addTimeEntry { projectId, startedAt, endedAt, stepId? }`: agrega un tramo a mano.
- `removeTimeEntry { id }`.
- No existe una operación `archiveProject`: se archiva con `update` y `patch: { archived: true }` (desde `ProjectPanel.tsx`). En ese camino, además, se detiene el reloj del proyecto.

Las horas de inicio y término usan siempre la hora del servidor (`now()`), no la del navegador.

**Carga:**

- `getBoard` agrega a cada `Project` el tramo corriendo, si existe: `runningTimer: { id, startedAt, stepId, taskText } | null`. El navegador calcula el tiempo transcurrido a partir de `startedAt`.
- Los tramos terminados de un proyecto se cargan aparte, en la página del proyecto, ya que pueden ser muchos. Basta con los últimos 30 días en la vista del proyecto. **[mi decisión]**

**Lógica pura** (`lib/time.ts`, con tests):

- `splitByChileDay(entries, from, to, now)`: corta los tramos por día de Chile y por el período, y devuelve los minutos por día y tarea.
- `reportRows(...)`: arma el resumen por tarea, el desglose por día y el total, con las reglas de redondeo de arriba.
- `formatDuration(minutes)` → "2 h 15 min", y `formatHoursDecimal(minutes)` → "12,5 h".

**Informe PDF:** una ruta `app/p/[id]/informe/route.ts` que recibe `?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`, comprueba la sesión y que el proyecto sea del usuario, y responde con el PDF como descarga (`informe-<proyecto>-<desde>-<hasta>.pdf`). Se genera en el servidor con **`pdf-lib`** y sus fuentes estándar (Helvetica, que admite tildes y ñ). **[mi decisión: es una dependencia en JavaScript puro, sin archivos de fuentes ni binarios, y funciona en Vercel]** La tabla debe pasar a una página nueva cuando no cabe.

**Interfaz:**

- **En el panel del proyecto** (`components/ProjectPanel.tsx`), una sección "Tiempo" nueva (componente `components/TimeTracker.tsx`):
  - Botón "Iniciar", que pasa a "Detener" mientras corre, con el contador en vivo (hh:mm:ss).
  - Mientras corre, un selector de tarea con los pasos pendientes del proyecto y la opción de escribir una nueva.
  - El total de hoy y de esta semana en el proyecto.
  - La lista de tramos recientes, editables, con el botón para agregar uno a mano.
  - Fechas "desde" y "hasta" (por defecto el mes en curso) y el botón "Descargar informe PDF".
- **En el tablero** (`components/Workspace.tsx`), las tarjetas de los proyectos con el reloj corriendo muestran un indicador con el tiempo transcurrido.

## Lo que queda a criterio de quien lo construya

- El diseño visual. Debe seguir `globals.css` (tokens, `panel-section`, filas tipo `step-row`) y funcionar a ancho de teléfono. El PDF debe verse sobrio y legible, con el color `--lago` como único acento.
- La forma exacta del selector de tarea y del formulario para editar tramos.
- Dónde exactamente va el indicador en las tarjetas del tablero.
- Cada cuánto se refresca el contador en pantalla.
