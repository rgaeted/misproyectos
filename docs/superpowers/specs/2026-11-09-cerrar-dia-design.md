# Cerrar el día: diseño

Fecha: 2026-11-09

## Para qué

Al terminar su jornada, Ricardo quiere apretar un botón "Cerrar el día" y obtener dos cosas:

- **Un resumen de lo que hizo hoy**, sacado de lo que marcó en el tablero.
- **Un borrador de lo que debe hacer mañana.** La app lo propone y Ricardo lo valida: quita, agrega y confirma.

A la mañana siguiente, la lista confirmada lo espera arriba en el tablero como "Hoy". Durante el día va tachando ítems, y tachar un ítem que es un paso deja ese paso "Completado" en su proyecto.

## Objetivos

1. **Botón "Cerrar el día"** en la barra del tablero (`toolbar-actions` en `components/Workspace.tsx`), junto a "Pagos". Abre la pantalla de cierre.
2. **Pantalla de cierre**, con dos secciones:
   - **Lo que hice hoy.** Incluye:
     - los pasos que pasaron a "Completado" hoy, agrupados por proyecto;
     - los pagos marcados como cobrados hoy, agrupados por proyecto;
     - los ítems de texto libre de la lista "Hoy" que se tacharon hoy.
     
     Si no hay nada: "Hoy no registraste avances en el tablero."
   - **Borrador para mañana.** Es una lista editable, armada como se describe en "Cómo se arma el borrador". Ricardo puede quitar ítems, agregar ítems de texto libre, agregar otros pasos "Por trabajar" desde un selector y confirmar con "Confirmar lista de mañana".
3. **Bloque "Hoy"** arriba del tablero, con la última lista confirmada. Muestra la fecha en que se confirmó ("Lista del cierre del viernes 6-11").
   - Tachar un **ítem de paso** pone el paso en "Completado". Destacharlo lo devuelve a "Por trabajar".
   - Si el paso se completa desde el proyecto, aparece tachado también en "Hoy", porque el estado se lee del paso.
   - Los **ítems de texto libre** se tachan solo en la lista.
   - Si no hay lista confirmada, el bloque no aparece.
4. **Registro de cuándo se completa un paso.** Cada paso guarda la fecha y hora en que pasó a "Completado". Si sale de ese estado, la fecha se borra.

## Fuera de alcance

- Historial de cierres anteriores. Solo existe el último cierre; uno nuevo reemplaza la lista anterior. **[mi decisión, al entender "con eso está bien" como que no se necesita historial]**
- Enviar el resumen por correo, notificaciones o recordatorios.
- Resúmenes escritos por IA. El resumen es una lista de lo registrado, no un texto redactado.
- Tachar un ítem de pago desde "Hoy" no marca el pago como cobrado. Los pagos se marcan desde su proyecto. **[mi decisión]**

## Lo que lo haría un fracaso

- Que tachar un paso en "Hoy" y en el proyecto queden desincronizados.
- Que el borrador sea una lista enorme con todos los pendientes de todos los proyectos, que da flojera revisar.
- Que cerrar el día por error borre la lista vigente sin confirmar. La lista solo se reemplaza al apretar "Confirmar".

## Cómo se arma el borrador **[mi decisión]**

El borrador se arma en este orden y sin duplicados:

1. **Lo que quedó pendiente de la lista "Hoy" vigente.** Son los ítems de paso cuyo paso no está "Completado" y los ítems libres no tachados.
2. **El primer paso "Por trabajar" de cada proyecto activo** (no archivado), según el orden de los pasos del proyecto. Así entra lo que sigue en cada proyecto sin traer todos sus pendientes. Los demás pasos "Por trabajar" se pueden agregar desde el selector.
3. **Pagos atrasados y pagos que vencen mañana**, de proyectos activos, como ítems de texto. Ejemplo: "Cobrar Hotel Don Luis · Mensualidad 9,00 UF (vence 10-11-2026)".

Los pasos "En espera" no entran al borrador, porque dependen de otra persona.

## Decisiones de comportamiento

- **Qué cuenta como "hoy":** la fecha en `America/Santiago`, con `todayInChile()` de `lib/payments.ts`.
- **"Lo que hice hoy" de pasos:** pasos con `completed_at` dentro de hoy en Chile y que siguen "Completado".
- **"Lo que hice hoy" de pagos:** registros de `payments` con `created_at` dentro de hoy en Chile. Se usa `created_at` porque `paid_on` puede ser una fecha pasada.
- Los pasos que ya estaban completados antes de este cambio no tienen fecha y no aparecen en ningún resumen. La migración no inventa fechas.
- **Ítems de paso:** guardan el `step_id` y una copia del texto. Si el paso sigue existiendo, se muestra su texto actual y su estado. Si se borró, el ítem queda como texto libre con la copia (FK `on delete set null`).
- **Ítems libres:** guardan `done` y `done_at` (para el resumen del día).
- **Reabrir la pantalla de cierre** no cambia nada hasta confirmar. Se puede cerrar el día varias veces; cada confirmación reemplaza la lista.

## Cómo se construye (lo que ya existe y lo que decidí)

La feature sigue los patrones de la app (Next.js 15, Drizzle, RLS por usuario, `mutate({ op })`, `getBoard` con caché y tag), igual que pagos.

**Datos** (migración nueva):

- `project_steps.completed_at` (`timestamptz`, nulo).
  - Se fija en `now()` al pasar a `done` en `addStep` (si nace completado) y en `editStep`.
  - Se limpia al salir de `done`.
- `day_lists`: una fila por usuario.
  - Columnas: `user_id` (PK, FK a `users`, con cascade) y `confirmed_at` (`timestamptz`).
  - Política RLS: `user_id = currentUser`.
- `day_list_items`:
  - Columnas: `id`, `user_id` (FK con cascade), `step_id` (uuid, FK a `project_steps` on delete set null, nulo), `text`, `done` (bool, default false), `done_at` (`timestamptz`, nulo) y `position`.
  - Política RLS: `user_id = currentUser`.

**Operaciones nuevas en `mutate`:**

- `confirmDayList { items: ({ stepId: uuid } | { text: string })[] }` (máx. 100):
  - Borra los ítems del usuario e inserta los nuevos en orden.
  - Hace upsert de `day_lists.confirmed_at = now()`.
  - Valida que cada `stepId` pertenezca al usuario y guarda la copia de su texto.
- `toggleDayItem { id: uuid, done: boolean }`:
  - Si el ítem tiene `step_id`, cambia el estado del paso (`done`, o `todo` al destachar) con la misma lógica de `editStep`, incluido `completed_at`.
  - Si no tiene, cambia `done` y `done_at` del ítem.

**Carga:**

- `getBoard` agrega `dayList: { confirmedAt: string; items: DayItem[] } | null`.
- Cada `DayItem` es `{ id, stepId, projectId | null, projectName | null, text, done }`, con `text` y `done` tomados del paso cuando existe.
- `Step` gana `completedAt: string | null`.

**Lógica pura** (`lib/day.ts`, con tests):

- `daySummary(board, payments, today)` arma "Lo que hice hoy".
- `draftForTomorrow(board, today)` arma el borrador con las reglas de arriba.
- `addDays(date, n)` sobre strings `YYYY-MM-DD`. "Mañana" es `addDays(todayInChile(), 1)`.

**Pantalla de cierre:** una ruta `app/cierre/page.tsx`, con un servidor que carga el tablero y un componente cliente para editar el borrador. Al confirmar, vuelve a `/`. **[mi decisión]**

**Bloque "Hoy":** un componente `components/TodayList.tsx`, renderizado en `Workspace` encima del tablero.

## Lo que queda a criterio de quien lo construya

- El diseño visual. Debe seguir `globals.css` (tokens, `panel-section`, filas tipo `step-row` y `payment-row`) y funcionar a ancho de teléfono.
- La forma exacta del selector para agregar otros pasos.
- El orden visual dentro de "Lo que hice hoy", siempre que agrupe por proyecto.
