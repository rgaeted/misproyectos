# Reloj de tiempo e informe PDF: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada proyecto tiene un reloj que Ricardo echa a andar desde la app y asocia a los próximos pasos. Con eso descarga un informe PDF de horas por tarea y por día para el período que elija.

**Architecture:**
- El tiempo se guarda en una tabla `time_entries`. Cada fila es un tramo: inicio, fin (nulo mientras corre) y la tarea, que es un paso con copia de su texto. Un índice único parcial asegura un solo tramo corriendo por proyecto.
- Toda la aritmética de tiempo (cortes por día de Chile, período, redondeo, formatos) es lógica pura en `lib/time.ts`, con tests. Las operaciones nuevas van por `mutate({ op })`.
- El panel del proyecto recibe los tramos recientes desde `app/p/[id]/page.tsx`. El tablero lee el tramo corriendo desde `getBoard`. El PDF lo genera `pdf-lib` en una ruta GET.

**Tech Stack:** Next.js 15, React 19, Drizzle 0.44 + Postgres con RLS, zod 4, vitest, `pdf-lib` (dependencia nueva).

**Spec:** `docs/superpowers/specs/2026-11-12-reloj-tiempo-design.md`

## Global Constraints

- Los días se cuentan en `America/Santiago`. Para pasar de timestamp a fecha se usa `chileDate(iso)` de `lib/day.ts`, y para sumar días a una fecha `YYYY-MM-DD`, `addDays` de `lib/day.ts`.
- Las horas de inicio y fin que fija un botón (iniciar, cambiar tarea, detener) se toman de `new Date()` en el servidor, nunca del navegador.
- `MIN_ENTRY_MS = 60_000`: al detener o al cambiar de tarea, un tramo con tarea de menos de 1 minuto se descarta.
- Formatos:
  - duración: `"2 h 15 min"`, `"45 min"`, `"2 h"`, `"0 min"`;
  - decimal: hasta 2 decimales con coma, sin ceros sobrantes: `"12,5 h"`, `"3,25 h"`, `"2 h"`;
  - contador en vivo: `"hh:mm:ss"`, por ejemplo `"01:05:09"`.
- Copy fijo:
  - sección "Tiempo";
  - botones "Iniciar", "Detener" y "Descargar informe PDF";
  - fila "Sin tarea asignada";
  - período vacío: "No hay tiempo registrado en este período.";
  - total del PDF: "Total: {duración} ({decimal})".
- La tabla nueva lleva una política RLS como la de `project_steps` (el proyecto es del usuario actual) y `FORCE ROW LEVEL SECURITY`, igual que `drizzle/0006_day_close.sql`.
- `pnpm` no está en el PATH: usa `npx vitest run`, `npx tsc --noEmit`, `npx eslint .`, `npx drizzle-kit` y `npx next build`. El proyecto usa `pnpm-lock.yaml`: agrega la dependencia con `npx pnpm add pdf-lib`, no con `npm install`.
- No ejecutes `db:migrate`: la migración se aplica a la base real y la corre Ricardo.

## Review Focus

1. **Tramo que cruza la medianoche, incluido el día del cambio de hora** (Chile adelanta el reloj a las 24:00 el primer domingo de septiembre): las horas se reparten entre los dos días y la suma no cambia. (Task 2)
2. **Tramo que cae solo en parte dentro del período, o que sigue corriendo:** cuenta solo la parte dentro del período, y el que corre cuenta hasta `now`. (Task 2)
3. **Paso borrado después de registrar tiempo:** el tiempo sigue en el informe con la copia del texto y no se suma a "Sin tarea asignada". (Task 2)
4. **Editar un tramo con fin antes del inicio o en el futuro:** se rechaza sin modificar nada. (Task 3)
5. **Apretar "Iniciar" en dos pestañas a la vez:** queda un solo tramo corriendo. El índice único parcial lo garantiza, e `insert … onConflictDoNothing()` evita el error. No hay arnés de base de datos: se revisa leyendo el código en la revisión final. (Task 3)

---

### Task 1: Tabla `time_entries`, migración y carga del tramo corriendo

**Files:**
- Modify: `lib/db/schema.ts`, `lib/data.ts`
- Create: `lib/time.ts` (en este task solo el tipo `TimeEntry`)
- Create: `drizzle/0007_time_entries.sql` + snapshot y journal (generados)
- Test: `tests/data.test.ts`; actualiza el helper `project()` de `tests/day.test.ts` con `runningTimer: null`

**Interfaces:**
- Produces:
```ts
// lib/db/schema.ts
timeEntries = table("time_entries", {
  id: uuid pk defaultRandom,
  projectId: text("project_id") notNull → projects.id onDelete cascade,
  stepId: uuid("step_id") → projectSteps.id onDelete "set null" (nulo),
  taskText: text("task_text") notNull default "",
  startedAt: timestamptz("started_at") notNull,
  endedAt: timestamptz("ended_at") (nulo = corriendo),
  createdAt: timestamptz defaultNow notNull,
})
// índices: uniqueIndex("time_entries_one_running").on(projectId).where(sql`ended_at is null`)
//          index("time_entries_project_started_idx").on(projectId, startedAt)
// política "time_entries_private": misma expresión exists(...) que project_steps_private
// lib/time.ts
export type TimeEntry = { id: string; projectId: string; stepId: string | null; taskText: string; startedAt: string; endedAt: string | null };
// lib/data.ts
Project.runningTimer: import("./time").TimeEntry | null
```

- [ ] **Step 1: Write the failing test** en `tests/data.test.ts`: `"incluye el tramo corriendo de cada proyecto"`. El mock devuelve un proyecto `p1` y, para la consulta de `time_entries`, un tramo con `endedAt: null`. Se espera que `board.projects[0].runningTimer` sea ese tramo con `startedAt` como string ISO, y que un proyecto sin tramo tenga `runningTimer: null`. Sigue el estilo de mocks del test "incluye planes y pagos en cada proyecto".
- [ ] **Step 2: Run** `npx vitest run tests/data.test.ts`. Expected: FAIL (`runningTimer` undefined).
- [ ] **Step 3: Implement.**
  - Agrega `timeEntries` a `schema.ts`.
  - En `readBoard`, agrega una consulta de tramos con `ended_at is null`, unidos a `projects` del usuario, y asigna `runningTimer` a cada proyecto. Sube la clave de caché a `"misproyectos-board-v6"`.
  - Crea `lib/time.ts` con el tipo.
- [ ] **Step 4: Generate the migration.** Run `npx drizzle-kit generate --name time_entries`. Al final del SQL generado agrega `--> statement-breakpoint` y `ALTER TABLE "time_entries" FORCE ROW LEVEL SECURITY;`. Revisa que el SQL tenga el índice único con `WHERE "time_entries"."ended_at" is null`.
- [ ] **Step 5: Run** `npx vitest run` y `npx tsc --noEmit`. Expected: todo pasa. El helper de `tests/day.test.ts` y cualquier otro constructor de `Project` incluyen `runningTimer: null`.
- [ ] **Step 6: Commit** `feat: tabla de tramos de tiempo y reloj corriendo en el tablero`.

### Task 2: Lógica de tiempo e informe (`lib/time.ts`)

**Files:**
- Modify: `lib/time.ts`
- Test: `tests/time.test.ts` (nuevo)

**Interfaces:**
- Consumes: `TimeEntry` (Task 1), y `chileDate` y `addDays` de `lib/day.ts`.
- Produces:
```ts
export const MIN_ENTRY_MS = 60_000;
export function startOfChileDay(date: string): Date;            // primer instante UTC cuyo chileDate === date
export function chileLocalToIso(local: string): string;         // "2026-11-12T09:30" (hora de Chile) → ISO UTC
export function isoToChileLocal(iso: string): string;           // inverso, formato de <input type="datetime-local">
export function weekStart(date: string): string;                // lunes de esa semana
export function taskChangeFor(running: Pick<TimeEntry, "startedAt" | "stepId" | "taskText">, now: Date): "assign" | "replace" | "split";
export function stopActionFor(running: Pick<TimeEntry, "startedAt" | "stepId" | "taskText">, now: Date): "close" | "discard";
export function validEntryRange(startedAt: Date, endedAt: Date, now: Date): boolean;  // start < end && end <= now
export type ReportTaskRow = { taskKey: string; task: string; minutes: number };
export type ReportDayRow = ReportTaskRow & { date: string };
export type Report = { byTask: ReportTaskRow[]; byDay: ReportDayRow[]; totalMinutes: number };
export function buildReport(entries: TimeEntry[], steps: { id: string; text: string }[], from: string, to: string, now: Date): Report;
export function formatDuration(minutes: number): string;
export function formatHoursDecimal(minutes: number): string;
export function formatClock(ms: number): string;
```

Reglas:
- **`startOfChileDay`:** los cambios de día en Chile siempre caen en una hora UTC exacta (offset −3 o −4). Busca entre las horas UTC exactas desde `date T00:00Z` hasta `date T06:00Z` la primera cuyo `chileDate` sea `date`.
- **`chileLocalToIso`:** prueba los offsets −03:00 y −04:00 y devuelve el que, al volver con `isoToChileLocal`, da el mismo texto. Si ambos sirven (la hora repetida de abril), usa −03:00.
- **`taskChangeFor`:** devuelve `"assign"` si el tramo no tiene tarea (`stepId === null && taskText === ""`), `"replace"` si tiene tarea y duró menos de `MIN_ENTRY_MS`, y `"split"` en el resto de los casos.
- **`stopActionFor`:** devuelve `"discard"` si duró menos de `MIN_ENTRY_MS`, con o sin tarea, y `"close"` en el resto de los casos.
- **`buildReport`:**
  1. El período va desde `startOfChileDay(from)` hasta `startOfChileDay(addDays(to, 1))`. Recorta cada tramo a ese período; un tramo sin fin se cuenta hasta `now`.
  2. Corta cada tramo en los límites de día de Chile, con `startOfChileDay` del día siguiente.
  3. Calcula la tarea:
     - si hay `stepId` y el paso existe en `steps`: `taskKey = "step:<id>"` y el texto actual del paso;
     - si no, y `taskText !== ""`: `taskKey = "text:<taskText>"` y ese texto;
     - si no: `taskKey = "none"` y "Sin tarea asignada".
  4. Suma los milisegundos por (fecha, taskKey). Cada celda se convierte con `Math.round(ms / 60000)` y las de 0 minutos se descartan.
  5. `byTask` y `totalMinutes` se suman desde esas celdas.
  6. Orden:
     - `byDay`: por fecha y, dentro del día, por `task` con `localeCompare(…, "es")`;
     - `byTask`: por minutos de mayor a menor, con `"none"` siempre al final.
- **Duraciones negativas o tramos fuera del período** no aportan nada.

- [ ] **Step 1: Write the failing tests** en `tests/time.test.ts`:
  - `startOfChileDay("2026-11-12")` → `"2026-11-12T03:00:00.000Z"` (verano, −3). `startOfChileDay("2026-07-01")` → `"2026-07-01T04:00:00.000Z"` (invierno, −4). `startOfChileDay("2026-09-06")` → `"2026-09-06T04:00:00.000Z"` (día del cambio de hora).
  - `chileLocalToIso("2026-11-12T09:30")` → `"2026-11-12T12:30:00.000Z"`, y `isoToChileLocal` lo devuelve a `"2026-11-12T09:30"`.
  - `weekStart("2026-11-12")` → `"2026-11-09"` y `weekStart("2026-11-15")` → `"2026-11-09"`.
  - `taskChangeFor`:
    - sin tarea, a los 5 s → `"assign"`;
    - con `stepId`, a los 30 s → `"replace"`;
    - con `stepId`, a los 5 min → `"split"`;
    - con `taskText` y sin `stepId`, a los 5 min → `"split"`.
  - `stopActionFor`: a los 59 s → `"discard"`; a los 61 s → `"close"`.
  - `validEntryRange`: rechaza fin igual al inicio, fin antes del inicio y fin después de `now`.
  - **Cruce de medianoche:** un tramo de 23:00 a 01:30 en Chile (2026-11-12T02:00Z → 04:30Z) da `byDay` con `2026-11-11` → 60 y `2026-11-12` → 90. `totalMinutes` es 150.
  - **Cruce el día del cambio de hora:** un tramo de `2026-09-06T03:00Z` a `2026-09-06T05:00Z` da 60 minutos el `2026-09-05` y 60 el `2026-09-06`.
  - **Período parcial y tramo corriendo:** con `from = to = "2026-11-12"`, un tramo que empezó el 11 a las 23:00 de Chile y terminó el 12 a la 01:00 cuenta 60. Un tramo sin fin que empezó a las 10:00 de Chile, con `now` a las 11:15, cuenta 75.
  - **Paso borrado:** un tramo con `stepId: null` y `taskText: "Diseño login"` aparece como `"Diseño login"` y no como "Sin tarea asignada". Uno con `stepId` existente usa el texto actual del paso, no la copia.
  - **Redondeo cuadra:** tres tramos de 20 min 20 s de la misma tarea el mismo día suman en una sola celda de 61 minutos, y `byTask[0].minutes === totalMinutes`. Una celda de 25 s no aparece.
  - **Orden:** "Sin tarea asignada" queda al final de `byTask` aunque tenga más minutos.
  - **Formatos:**
    - `formatDuration`: 135 → `"2 h 15 min"`, 45 → `"45 min"`, 120 → `"2 h"`, 0 → `"0 min"`;
    - `formatHoursDecimal`: 750 → `"12,5 h"`, 195 → `"3,25 h"`, 20 → `"0,33 h"`, 120 → `"2 h"`;
    - `formatClock(3_909_000)` → `"01:05:09"`.
- [ ] **Step 2: Run** `npx vitest run tests/time.test.ts`. Expected: FAIL (funciones no exportadas).
- [ ] **Step 3: Implement** las funciones en `lib/time.ts` con las reglas de arriba.
- [ ] **Step 4: Run** `npx vitest run tests/time.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: cálculo de horas por día y tarea`.

### Task 3: Operaciones del reloj en `mutate`

**Files:**
- Modify: `lib/validation.ts`, `lib/actions.ts`
- Test: `tests/time.test.ts` (validación)

**Interfaces:**
- Consumes: `timeEntries` (Task 1), y `taskChangeFor`, `stopActionFor`, `validEntryRange` y `MIN_ENTRY_MS` (Task 2).
- Produces (comandos nuevos en `command`; `projectId` como los demás: `z.string().min(1).max(160)`; los instantes son `z.iso.datetime()`):
```ts
{ op: "startTimer", projectId }
{ op: "setTimerTask", projectId, stepId: uuid } | { op: "setTimerTask", projectId, text: content }
{ op: "stopTimer", projectId }
{ op: "addTimeEntry", projectId, startedAt, endedAt, stepId?: uuid | null }
{ op: "editTimeEntry", id: uuid, startedAt?, endedAt?, stepId?: uuid | null }   // al menos un campo
{ op: "removeTimeEntry", id: uuid }
```
`setTimerTask` es un solo `z.object` con `stepId` y `text` opcionales y un `.refine`: exactamente uno de los dos, con el mensaje "Elige un paso o escribe una tarea.".

Comportamiento en el servidor, dentro de la transacción. Todas las operaciones parten con `ownedProject` (que bloquea la fila del proyecto y así serializa los clics simultáneos):
- **`startTimer`:** inserta `{ projectId, startedAt: now }` con `.onConflictDoNothing()`.
- **`setTimerTask`:**
  - Con `text`, crea el paso "Por trabajar" al final, con la misma lógica de `addStep`. Extrae esa lógica a un helper local `insertStep(projectId, text, state, waitingOn)` que devuelve el id, y úsalo en ambos lugares.
  - Con `stepId`, el paso debe ser del mismo proyecto; si no, lanza `missing_step`.
  - Si no hay tramo corriendo, falla con `not_running` (la UI ofrece "Iniciar"); en un proyecto archivado falla con `archived`.
  - Si hay uno, según `taskChangeFor`:
    - `assign` actualiza el tramo;
    - `replace` borra el tramo e inserta uno nuevo desde `now`;
    - `split` cierra el tramo en `now` e inserta uno nuevo desde ese mismo `now`.
  - `taskText` siempre es el texto del paso en ese momento.
- **`stopTimer`:** según `stopActionFor`, cierra el tramo (`endedAt = now`) o lo borra. Si no hay tramo corriendo, no hace nada.
- **`addTimeEntry` y `editTimeEntry`:**
  - Exigen `validEntryRange(start, end, now)`; si falla, lanzan `invalid_range`.
  - `editTimeEntry` solo sirve para tramos terminados; con uno corriendo lanza `running_entry`.
  - El `stepId`, si viene, debe ser del mismo proyecto. Con un paso se copia su texto en `taskText`; con `null`, `taskText` queda en `""`.
- **`removeTimeEntry`:** comprueba que el tramo pertenezca al usuario, como `ownedPlan`.
- **`update` con `patch.archived === true`:** además aplica a ese proyecto la misma lógica de `stopTimer`.
- Todas las operaciones llaman a `touch(projectId)`.

- [ ] **Step 1: Write the failing tests** en `tests/time.test.ts`, bloque `"comandos del reloj"`:
  - `command.safeParse({ op: "setTimerTask", projectId: "p", stepId: <uuid>, text: "x" })` falla con "Elige un paso o escribe una tarea.";
  - sin ninguno de los dos, falla con el mismo mensaje;
  - `editTimeEntry` sin campos falla;
  - `addTimeEntry` con `startedAt: "ayer"` falla;
  - `startTimer` válido pasa.
- [ ] **Step 2: Run** `npx vitest run tests/time.test.ts`. Expected: FAIL en los casos nuevos.
- [ ] **Step 3: Implement** los comandos en `lib/validation.ts` y los `case` en `lib/actions.ts`.
- [ ] **Step 4: Run** `npx vitest run`, `npx tsc --noEmit` y `npx eslint .`. Expected: todo pasa.
- [ ] **Step 5: Commit** `feat: iniciar, cambiar tarea y detener el reloj`.

### Task 4: Sección "Tiempo" en el panel del proyecto

**Files:**
- Create: `lib/time-data.ts` (server-only), `components/TimeTracker.tsx`, `components/RunningClock.tsx`
- Modify: `app/p/[id]/page.tsx`, `components/Workspace.tsx` (pasa la prop), `components/ProjectPanel.tsx`, `app/globals.css`

**Interfaces:**
- Consumes: `Project.runningTimer` (Task 1), funciones de Task 2 y comandos de Task 3.
- Produces:
```ts
// lib/time-data.ts
export async function getTimeEntries(userId: string, projectId: string, from: Date, to: Date): Promise<TimeEntry[]>;
// tramos que se solapan con [from, to): started_at < to y (ended_at is null o ended_at > from),
// unidos a projects del usuario, orden started_at desc. Timestamps como ISO string.
// components/RunningClock.tsx
export function RunningClock({ startedAt }: { startedAt: string }): JSX.Element;  // formatClock(now - startedAt), se refresca cada 1 s
// components/TimeTracker.tsx
export function TimeTracker({ project, entries, run, pending }: { project: Project; entries: TimeEntry[]; run: Run; pending: boolean }): JSX.Element;
```
- `app/p/[id]/page.tsx` carga `getTimeEntries(user.id, id, startOfChileDay(addDays(todayInChile(), -29)), new Date(Date.now() + 1))` en el mismo `Promise.all`. Lo pasa a `Workspace` como `timeEntries`, y `Workspace` lo pasa a `ProjectPanel`. `ProjectPanel` renderiza `<TimeTracker>` justo después de `<NextSteps>`.
- Contenido de `TimeTracker` (todo dentro de `<section className="panel-section">` con título "Tiempo"):
  1. **Reloj:**
     - si no hay `runningTimer`: botón "Iniciar" → `startTimer`;
     - si hay: `<RunningClock>`, botón "Detener" → `stopTimer`, y un selector de tarea con los pasos de `project.steps` que no están `done` → `setTimerTask { stepId }`, más un campo "Nueva tarea" con botón → `setTimerTask { text }`.
     - El selector muestra la tarea actual del tramo, o "Sin tarea asignada".
  2. **Totales:** "Hoy: {formatDuration}" y "Esta semana: {formatDuration}", calculados con `buildReport(entries, project.steps, …).totalMinutes` (hoy = `todayInChile()`; semana = `weekStart(hoy)` a hoy) y sumando el tramo corriendo.
  3. **Tramos recientes:** `entries` terminados, cada uno con fecha, inicio y fin (`isoToChileLocal`), tarea, duración, y botones "Editar" y "Borrar".
     - Editar muestra dos `<input type="datetime-local">` y el selector de tarea (con la opción "Sin tarea asignada" = `null`) → `editTimeEntry`, convirtiendo con `chileLocalToIso`.
     - "Agregar tiempo a mano" usa el mismo formulario → `addTimeEntry`.
     - Si `run` devuelve error, se muestra en la fila.
  4. **Informe:** dos `<input type="date">` "Desde" y "Hasta", por defecto el primer día del mes en curso y hoy. Debajo, un enlace "Descargar informe PDF" con `href={`/p/${project.id}/informe?desde=${desde}&hasta=${hasta}`}`, deshabilitado si `desde > hasta`.

- [ ] **Step 1: Implement** `getTimeEntries`, `RunningClock`, `TimeTracker` y el cableado, siguiendo los estilos de `NextSteps` (`step-row`, `section-title`, `count`) y los tokens de `globals.css`. Debe funcionar a 360 px de ancho.
- [ ] **Step 2: Run** `npx tsc --noEmit`, `npx eslint .` y `npx vitest run`. Expected: todo pasa.
- [ ] **Step 3: Run** `npx next build`. Expected: compila sin errores.
- [ ] **Step 4: Commit** `feat: sección de tiempo en el proyecto`.

### Task 5: Indicador de reloj en las tarjetas del tablero

**Files:**
- Modify: `components/Workspace.tsx` (tarjeta del proyecto, cerca de `card-top`), `app/globals.css`

**Interfaces:**
- Consumes: `Project.runningTimer` (Task 1) y `RunningClock` (Task 4).

- [ ] **Step 1: Implement:** si `p.runningTimer` existe, la tarjeta muestra un indicador con un punto de color `--lago`, `<RunningClock startedAt={p.runningTimer.startedAt} />` y `aria-label="Reloj corriendo"`. Las tarjetas sin reloj no cambian.
- [ ] **Step 2: Run** `npx tsc --noEmit` y `npx eslint .`. Expected: pasa.
- [ ] **Step 3: Commit** `feat: relojes corriendo visibles en el tablero`.

### Task 6: Informe PDF

**Files:**
- Create: `lib/report-pdf.ts`, `app/p/[id]/informe/route.ts`
- Modify: `package.json` + lockfile (`npx pnpm add pdf-lib`), `lib/validation.ts` (exporta `dateString`)
- Test: `tests/report-pdf.test.ts` (nuevo)

**Interfaces:**
- Consumes: `buildReport`, `formatDuration`, `formatHoursDecimal` y `startOfChileDay` (Task 2); `getTimeEntries` (Task 4); `displayDate` de `lib/payments.ts`.
- Produces:
```ts
// lib/report-pdf.ts
export function pdfSafe(text: string, font: PDFFont): string;  // quita los caracteres que la fuente no codifica y colapsa espacios
export async function renderReportPdf(input: { projectName: string; ownerName: string; from: string; to: string; report: Report }): Promise<Uint8Array>;
// app/p/[id]/informe/route.ts
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response>;
```
- **`pdfSafe`:** recorre el texto carácter por carácter y conserva los que `font.encodeText(ch)` acepta sin lanzar error.
- **Contenido del PDF:**
  - Tamaño A4, Helvetica y Helvetica-Bold (`StandardFonts`), con márgenes de 50 pt.
  - Encabezado:
    - título "Informe de horas";
    - nombre del proyecto;
    - "Período: {displayDate(from)} al {displayDate(to)}";
    - "Preparado por {ownerName}".
  - Tabla "Resumen por tarea" (Tarea | Horas), seguida de la línea "Total: …".
  - Tabla "Detalle por día" (Fecha | Tarea | Horas).
  - Los textos de tarea largos se cortan en varias líneas, según el ancho de la columna.
  - Cuando la siguiente fila no cabe, se agrega una página nueva y se repite el encabezado de la tabla.
  - El único color de acento es `rgb(0.055, 0.431, 0.404)` (#0e6e67), en el título y en los encabezados de tabla.
  - Si `report.totalMinutes === 0`, después del encabezado va solo "No hay tiempo registrado en este período.".
- **Ruta GET:**
  1. Llama a `auth()`. Sin sesión válida (`isUserId`), responde 401.
  2. Lee `desde` y `hasta` con `dateString`. Si alguna no es válida, si `desde > hasta` o si el rango supera los 366 días, responde 400 con un mensaje en texto plano en español.
  3. Dentro de `withUserDatabase`, carga el proyecto (con `userId`; si no existe, responde 404) y sus pasos (`id` y `text`).
  4. Carga los tramos con `getTimeEntries(userId, id, startOfChileDay(desde), startOfChileDay(addDays(hasta, 1)))` y arma el informe con `buildReport(…, new Date())`.
  5. Responde con el PDF y estos encabezados:
     - `Content-Type: application/pdf`;
     - `Content-Disposition: attachment; filename="informe-{slug}-{desde}-{hasta}.pdf"`, donde `slug` es el nombre en minúsculas, sin tildes y con `-` en lugar de lo que no sea `[a-z0-9]`;
     - `Cache-Control: no-store`.

- [ ] **Step 1: Write the failing tests** en `tests/report-pdf.test.ts`:
  - `pdfSafe("Login 🚀 ñandú", helvetica)` → `"Login ñandú"`. La fuente se obtiene con `(await PDFDocument.create()).embedFont(StandardFonts.Helvetica)`.
  - `renderReportPdf` con un informe vacío devuelve bytes que empiezan con `%PDF`, y `PDFDocument.load(bytes).getPageCount()` es 1.
  - Con 120 filas en `byDay`, `getPageCount()` es mayor que 1.
  - Con una tarea `"Revisión con cliente ✅"`, no lanza error.
- [ ] **Step 2: Run** `npx vitest run tests/report-pdf.test.ts`. Expected: FAIL (módulo no existe).
- [ ] **Step 3: Implement** `npx pnpm add pdf-lib`, `lib/report-pdf.ts` y la ruta.
- [ ] **Step 4: Run** `npx vitest run`, `npx tsc --noEmit`, `npx eslint .` y `npx next build`. Expected: todo pasa.
- [ ] **Step 5: Commit** `feat: informe de horas en PDF`.

### Verificación final

- [ ] `npx vitest run`, `npx tsc --noEmit`, `npx eslint .` y `npx next build` pasan.
- [ ] Avisar a Ricardo que debe correr `npm run db:migrate` para crear `time_entries` antes de probar en la app. Después, prueba manual:
  1. iniciar el reloj en dos proyectos;
  2. cambiar de tarea, crear una tarea nueva desde el reloj y detener;
  3. recargar con el reloj corriendo;
  4. editar un tramo;
  5. descargar el PDF del mes.
