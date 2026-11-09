# Cerrar el día: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un botón "Cerrar el día" muestra lo hecho hoy y propone una lista para mañana. Ricardo la edita y la confirma, y esa lista aparece como "Hoy" arriba del tablero; tachar un ítem de paso completa el paso.

**Architecture:**
- Los pasos ganan `completed_at`. Una lista vigente por usuario se guarda en `day_lists` y `day_list_items`.
- El resumen y el borrador son lógica pura en `lib/day.ts`, calculada desde `BoardData`.
- La pantalla `/cierre` edita el borrador y lo confirma con `mutate({ op: "confirmDayList" })`. El bloque `TodayList` en el tablero tacha ítems con `toggleDayItem`.

**Tech Stack:** Next.js 15, React 19, Drizzle 0.44 + Postgres con RLS, zod 4, vitest.

**Spec:** `docs/superpowers/specs/2026-11-09-cerrar-dia-design.md`

## Global Constraints

- "Hoy" es la fecha en `America/Santiago`. Se usa `todayInChile()` de `lib/payments.ts`. Un timestamp se convierte a fecha de Chile con `todayInChile(new Date(iso))`.
- Solo existe la última lista. Confirmar reemplaza todos los ítems; abrir `/cierre` sin confirmar no cambia nada.
- El estado de un ítem de paso se lee siempre del paso; nunca se guarda en el ítem.
- Los pasos "En espera" no entran al borrador. Los proyectos archivados no aportan pasos ni pagos al borrador.
- Copy fijo:
  - botón "Cerrar el día";
  - títulos "Lo que hice hoy", "Borrador para mañana", "Hoy";
  - "Confirmar lista de mañana";
  - estado vacío "Hoy no registraste avances en el tablero.";
  - en el bloque, "Lista del cierre del {día} {dd-mm}".
- Formato de pagos en el borrador:
  - si vence mañana: "Cobrar {proyecto} · {concepto} {formatUf(monto)} (vence {dd-mm-yyyy})";
  - si está atrasado: "Cobrar {proyecto} · {concepto} {formatUf(monto)} (atrasado, venció {dd-mm-yyyy})".
- Las tablas nuevas llevan RLS `user_id = currentUser` y `FORCE ROW LEVEL SECURITY`, como en `drizzle/0005_payments.sql`.
- `pnpm` no está en el PATH: usa `npx vitest`, `npx tsc --noEmit`, `npx eslint .`, `npx drizzle-kit` y `npx next build`.

## Review Focus

1. **Paso completado ayer tarde en Chile:** se completó a las 23:30 en Chile (02:30 UTC del día siguiente) y no debe aparecer en el resumen de hoy. (Task 2)
2. **Editar el texto de un paso completado:** no debe cambiar su `completed_at`. Destacharlo y volver a tacharlo lo actualiza a la nueva hora. (Task 1)
3. **Paso borrado que estaba en la lista:** el ítem queda como texto libre y, si no estaba tachado, pasa al borrador siguiente. (Task 2)
4. **Paso duplicado:** un paso que viene de la lista anterior y que además es el primer "Por trabajar" de su proyecto aparece una sola vez en el borrador. (Task 2)
5. **`stepId` ajeno en `confirmDayList`:** un `stepId` de otro usuario o inexistente hace fallar toda la operación sin modificar la lista vigente. No hay arnés de base de datos para probarlo: se revisa en la revisión final, leyendo el código. (Task 3)

---

## File Structure

- Modificar `lib/steps.ts`: agregar `completedAtFor`.
- Modificar `lib/db/schema.ts` y generar la migración `drizzle/0006_day_close.sql`: columna `completed_at` y tablas `day_lists` y `day_list_items`.
- Modificar `lib/data.ts`: `Step.completedAt` y `BoardData.dayList`.
- Modificar `lib/payments.ts`: `PaidPayment.createdAt?`.
- Crear `lib/day.ts`: tipos, `addDays`, `daySummary` y `draftForTomorrow`.
- Modificar `lib/validation.ts` y `lib/actions.ts`: las operaciones `confirmDayList` y `toggleDayItem`, y `completed_at` en `addStep` y `editStep`.
- Crear `components/TodayList.tsx` y modificar `components/Workspace.tsx`: el bloque "Hoy" y el botón "Cerrar el día".
- Crear `app/cierre/page.tsx` y `components/DayClose.tsx`: la pantalla de cierre.
- Modificar `app/globals.css`.
- Tests: `tests/day.test.ts`, `tests/steps.test.ts` y `tests/data.test.ts`.

---

### Task 1: Fecha de completado, tablas y carga

**Files:**
- Modify: `lib/steps.ts`
- Modify: `lib/db/schema.ts`
- Modify: `lib/data.ts`
- Modify: `lib/payments.ts`
- Modify: `lib/actions.ts` (`addStep`, `editStep`)
- Create: `drizzle/0006_day_close.sql` + snapshot y journal (generados)
- Test: `tests/steps.test.ts`, `tests/data.test.ts`

**Interfaces:**
- Produces:
```ts
// lib/steps.ts
export function completedAtFor(previous: StepState | null, next: StepState, current: Date | null, now: Date): Date | null;
// next !== "done" → null; previous === "done" → current ?? now; si no → now
// lib/db/schema.ts
projectSteps.completedAt  // timestamp("completed_at", { withTimezone: true }), nulo
dayLists       = table("day_lists", { userId uuid pk → users cascade, confirmedAt timestamptz notNull defaultNow })
dayListItems   = table("day_list_items", { id uuid pk, userId uuid → users cascade, stepId uuid → projectSteps.id onDelete "set null" (nulo),
                                           text text notNull, done boolean default false, doneAt timestamptz nulo, position integer notNull })
                 // índice en userId; políticas "day_lists_private" y "day_list_items_private": user_id = currentUser
// lib/data.ts
Step.completedAt: string | null
BoardData.dayList: import("./day").DayList | null
// lib/payments.ts
PaidPayment.createdAt?: string
```
- `DayList` y `DayItem` se definen en `lib/day.ts`, que se crea en este task solo con los tipos. Task 2 agrega las funciones:
```ts
export type DayItem = { id: string; stepId: string | null; projectId: string | null; projectName: string | null;
  text: string; done: boolean; doneAt: string | null };
export type DayList = { confirmedAt: string; items: DayItem[] };
```
- Cómo `readBoard` arma `dayList`:
  - Lee la fila de `day_lists` del usuario. Si no existe, `dayList` es `null`.
  - Lee los ítems ordenados por `position`. Para cada ítem con `stepId`, busca el paso entre los `steps` ya cargados y su proyecto entre `p`.
  - Si encuentra el paso: `text = step.text`, `done = step.state === "done"`, `doneAt = step.completedAt` y se completan `projectId` y `projectName`.
  - Si no lo encuentra: usa el `text`, `done` y `doneAt` del ítem, con `stepId: null`.
  - Sube la clave de caché a `"misproyectos-board-v5"`.

- [ ] **Step 1: Write the failing tests**
  - En `tests/steps.test.ts`, el test `"completedAtFor fija, conserva y limpia la fecha"`:
```ts
const now = new Date("2026-11-09T20:00:00Z"); const before = new Date("2026-11-08T15:00:00Z");
expect(completedAtFor("todo", "done", null, now)).toEqual(now);
expect(completedAtFor("done", "done", before, now)).toEqual(before);
expect(completedAtFor("done", "todo", before, now)).toBeNull();
expect(completedAtFor(null, "done", null, now)).toEqual(now);
expect(completedAtFor(null, "todo", null, now)).toBeNull();
```
  - En `tests/data.test.ts`, el test `"incluye la lista del día vacía"`: con `returnQueries(Promise.resolve([]))`, `getBoard` resuelve a `{ projects: [], inbox: [], dayList: null }`. Actualiza también el `toEqual` existente del segundo test a esa forma.

- [ ] **Step 2: Run** `npx vitest run tests/steps.test.ts tests/data.test.ts`. Expected: FAIL (`completedAtFor` no existe, falta `dayList`).

- [ ] **Step 3: Implement**
  - Agrega `completedAtFor`, el schema, los tipos y la carga en `readBoard`.
  - En `lib/actions.ts`:
    - `addStep` guarda `completedAt: completedAtFor(null, c.state, null, new Date())`.
    - `editStep` guarda `completedAt: completedAtFor(step.state, state, step.completedAt, new Date())`.
  - Genera la migración con `npx drizzle-kit generate --name day_close` y agrega al final del SQL `ALTER TABLE "day_lists" FORCE ROW LEVEL SECURITY;` y `ALTER TABLE "day_list_items" FORCE ROW LEVEL SECURITY;`, separados por `--> statement-breakpoint`.

- [ ] **Step 4: Verify**

Run: `npx vitest run && npx tsc --noEmit`
Expected: todo PASS y sin errores de tipos. No apliques la migración: eso es parte del deploy.

- [ ] **Step 5: Commit**

```bash
git add lib/steps.ts lib/db/schema.ts lib/data.ts lib/payments.ts lib/day.ts lib/actions.ts tests/steps.test.ts tests/data.test.ts drizzle/0006_day_close.sql drizzle/meta/0006_snapshot.json drizzle/meta/_journal.json
git commit -m "feat: fecha de completado de pasos y tablas de la lista del día"
```

---

### Task 2: Resumen y borrador (`lib/day.ts`)

**Files:**
- Modify: `lib/day.ts`
- Test: `tests/day.test.ts`

**Interfaces:**
- Consumes:
  - `Project` y `DayList` (Task 1);
  - `projectPayments`, `todayInChile`, `formatUf` y `displayDate` de `lib/payments.ts`.
- Produces:
```ts
export type DraftItem =
  | { key: string; kind: "step"; stepId: string; projectName: string; text: string }
  | { key: string; kind: "text"; text: string };
export type DaySummary = { groups: { projectId: string; projectName: string; steps: string[]; payments: string[] }[];
  freeItems: string[]; empty: boolean };
export function addDays(date: string, days: number): string;
export function chileDate(iso: string): string; // todayInChile(new Date(iso))
export function daySummary(projects: Project[], dayList: DayList | null, today: string): DaySummary;
export function draftForTomorrow(projects: Project[], dayList: DayList | null, today: string): DraftItem[];
```

Reglas de `daySummary`:
- `steps` son los textos de pasos con `state === "done"` y `chileDate(completedAt) === today`.
- `payments` son `"{concepto} · {formatUf(amountUf)}"` de los pagos con `createdAt` y `chileDate(createdAt) === today`. El concepto se busca en `project.plans`.
- `groups` solo incluye proyectos con algo, en el orden del arreglo `projects`, incluidos los archivados.
- `freeItems` son los textos de los ítems con `stepId === null`, `done` y `chileDate(doneAt) === today`.

Reglas de `draftForTomorrow`, en este orden y sin duplicados:
1. **Ítems no hechos de `dayList`.** Con `stepId`, pasan a `kind: "step"`, `key: "step:<id>"`. Sin `stepId`, pasan a `kind: "text"`, `key: "text:<texto>"`.
2. **El primer paso `todo` de cada proyecto no archivado**, en el orden de `project.steps`. Se omite si su `stepId` ya está.
3. **Pagos de proyectos no archivados.** Sale de `projectPayments(...).upcoming`: los `overdue` y los que tienen `dueDate === addDays(today, 1)`, en ese orden. Van como `kind: "text"` con el copy de Global Constraints. Se omite un texto que ya esté.

- [ ] **Step 1: Write the failing tests** in `tests/day.test.ts`. Usa un helper `project(overrides)` que arme un `Project` completo con arreglos vacíos.
  - `"addDays cruza meses y años"`: `addDays("2026-11-30", 1)` → `"2026-12-01"` y `addDays("2026-12-31", 1)` → `"2027-01-01"`.
  - `"resumen usa la fecha de Chile"`:
    - Un paso `done` con `completedAt: "2026-11-10T02:30:00Z"` (23:30 del 9 en Chile) aparece con `today = "2026-11-09"`.
    - Uno con `"2026-11-09T02:30:00Z"` (8 de noviembre en Chile) no aparece.
    - Un paso `todo` no aparece.
  - `"resumen incluye pagos registrados hoy e ítems libres tachados hoy"`:
    - Un pago con `createdAt` de hoy da `"Mensualidad · 9,00 UF"` en su grupo.
    - Un ítem libre `done` con `doneAt` de hoy aparece en `freeItems`.
    - Sin nada, `empty: true` y `groups: []`.
  - `"borrador: arrastra pendientes, primer paso por proyecto, sin duplicados"`:
    - El proyecto A tiene pasos `[a1 done, a2 waiting, a3 todo, a4 todo]`. La lista tiene un ítem de paso `a3` no hecho y un ítem libre `"Llamar al contador"` no hecho. Los keys del borrador son `["step:a3", "text:Llamar al contador"]`, en ese orden: `a3` aparece una sola vez y `a4` no entra.
    - El proyecto B archivado, con un paso `todo`, no aporta nada.
  - `"borrador: un paso borrado queda como texto"`: un ítem `{ stepId: null, text: "Paso viejo", done: false }` da `{ kind: "text", text: "Paso viejo" }`.
  - `"borrador: pagos atrasados y que vencen mañana"`: el proyecto "Hotel" tiene un plan mensual de 9 UF desde `"2026-10-10"` y `today = "2026-11-09"`. Los textos incluyen `"Cobrar Hotel · Mensualidad 9,00 UF (atrasado, venció 10-10-2026)"` y `"Cobrar Hotel · Mensualidad 9,00 UF (vence 10-11-2026)"`.

- [ ] **Step 2: Run** `npx vitest run tests/day.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** las funciones en `lib/day.ts`. `addDays` usa `Date.UTC` sobre los números del string.

- [ ] **Step 4: Run** `npx vitest run tests/day.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/day.ts tests/day.test.ts
git commit -m "feat: resumen del día y borrador para mañana"
```

---

### Task 3: Operaciones `confirmDayList` y `toggleDayItem`

**Files:**
- Modify: `lib/validation.ts`, `lib/actions.ts`
- Test: `tests/day.test.ts`

**Interfaces:**
- Consumes: `dayLists`, `dayListItems`, `projectSteps.completedAt` y `completedAtFor` (Task 1).
- Produces:
```ts
{ op: "confirmDayList", items: ({ stepId: uuid } | { text: content })[] }  // .max(100), mensaje "Usa hasta 100 ítems."
{ op: "toggleDayItem", id: uuid, done: boolean }
```
Comportamiento en el servidor, dentro de la transacción de `mutate`:
- **`confirmDayList`:**
  1. Si hay `stepId`, carga esos pasos con `innerJoin(projects)` y `projects.userId = userId`. Si falta alguno, lanza `missing_step` y no toca la lista.
  2. Borra los `day_list_items` del usuario.
  3. Inserta los ítems en orden (`position` = índice). `text` es el texto del paso o el texto libre.
  4. Hace upsert de `day_lists` (`onConflictDoUpdate` sobre `userId`, con `confirmedAt: new Date()`).
- **`toggleDayItem`:**
  1. Carga el ítem `where id and userId`. Si no existe, lanza `missing_item`.
  2. Si tiene `stepId`: verifica el paso con el helper `ownedStep` existente y lo actualiza con `state: done ? "done" : "todo"`, `waitingOn: ""` y `completedAt: completedAtFor(...)`. Después hace `touch(projectId)`.
  3. Si no tiene `stepId`: actualiza `done` y `doneAt: done ? new Date() : null`.

- [ ] **Step 1: Write the failing tests** in `tests/day.test.ts` (`describe("validación del día")`):
  - `confirmDayList` con `[{ stepId: <uuid> }, { text: " Llamar " }]` → pasa, con el texto recortado a `"Llamar"`.
  - Falla con `{ text: " " }`, con `{ stepId: "x" }` y con 101 ítems.
  - Pasa con `items: []`.
  - `toggleDayItem` sin `done` → falla.

- [ ] **Step 2: Run** `npx vitest run tests/day.test.ts`. Expected: FAIL en los casos nuevos.

- [ ] **Step 3: Implement** la validación y las operaciones.

- [ ] **Step 4: Verify**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: todo PASS y sin errores.

- [ ] **Step 5: Commit**

```bash
git add lib/validation.ts lib/actions.ts tests/day.test.ts
git commit -m "feat: confirmar la lista del día y tachar ítems"
```

---

### Task 4: Bloque "Hoy", pantalla `/cierre` y botón

**Files:**
- Create: `components/TodayList.tsx`, `components/DayClose.tsx`, `app/cierre/page.tsx`
- Modify: `components/Workspace.tsx`, `app/globals.css`

**Interfaces:**
- Consumes: `BoardData.dayList` (Task 1); `daySummary`, `draftForTomorrow`, `DraftItem` y `chileDate` (Task 2); las operaciones de Task 3; `mutate` de `lib/actions.ts`; `requireUser` y `getBoard`.
- Produces:
  - `TodayList({ dayList, run, pending }: { dayList: DayList | null; run: Run; pending: boolean })`:
    - Devuelve `null` si `dayList` es `null`.
    - Encabezado "Hoy" y la línea "Lista del cierre del {día de la semana} {dd-mm}", con `Intl.DateTimeFormat("es-CL", { weekday: "long", timeZone: "America/Santiago" })` sobre `confirmedAt`.
    - Cada ítem es un checkbox con su texto y, si tiene, el nombre del proyecto. Al cambiar, llama a `run({ op: "toggleDayItem", id, done })`. Los hechos se ven tachados.
  - `DayClose({ summary, draft, extraSteps }: { summary: DaySummary; draft: DraftItem[]; extraSteps: { stepId: string; projectName: string; text: string }[] })`, componente cliente:
    - Muestra "Lo que hice hoy": un grupo por proyecto con sus pasos y pagos, más los ítems libres. Si `summary.empty`, muestra "Hoy no registraste avances en el tablero."
    - Muestra "Borrador para mañana" como lista editable. Cada ítem tiene un botón "Quitar".
    - Tiene un input "Agregar algo" para ítems de texto, y un `<select>` "Agregar otro paso" con `extraSteps` que no estén ya en la lista.
    - El botón "Confirmar lista de mañana" llama a `mutate({ op: "confirmDayList", items })`. Si sale bien, hace `router.push("/")` y `router.refresh()`. Si falla, muestra el error devuelto.
    - Tiene un enlace "← Volver al tablero" (`/`) que no guarda nada.
  - `app/cierre/page.tsx`:
    - Server component con `dynamic = "force-dynamic"`.
    - Llama a `requireUser`, `getBoard` y `todayInChile`.
    - `extraSteps` son todos los pasos `todo` de proyectos no archivados.
  - En `Workspace.tsx`:
    - Agrega el botón "Cerrar el día" (`router.push("/cierre")`) en `toolbar-actions`, antes de "Pagos".
    - Agrega `<TodayList dayList={data.dayList} run={run} pending={pending > 0} />` justo antes del `DndContext` del tablero, solo cuando `!archived`.
- Estilos: reutiliza los tokens existentes, `panel-section` y la estructura de filas `payment-row`. Todo debe funcionar a 360 px sin scroll horizontal.

- [ ] **Step 1: Implement** los componentes, la página y los cambios en `Workspace`.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run && npx next build`
Expected: sin errores, y `/cierre` aparece en la tabla de rutas del build.

- [ ] **Step 3: Commit**

```bash
git add components/TodayList.tsx components/DayClose.tsx app/cierre/page.tsx components/Workspace.tsx app/globals.css
git commit -m "feat: cerrar el día y lista de hoy en el tablero"
```
