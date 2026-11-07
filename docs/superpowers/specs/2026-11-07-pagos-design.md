# Pagos por proyecto: diseño

Fecha: 2026-11-07

## Para qué

Ricardo cobra a sus clientes por proyecto y quiere controlar la plata dentro de la misma app donde sigue sus proyectos: qué le han pagado, qué le van a pagar y cuándo. Hoy los cobros tienen formas distintas:

- **Transmarko:** 4 pagos (cuotas).
- **Hotel Don Luis:** 9 UF mensuales sin término, y además 10 UF durante los 3 primeros meses. Los meses 1 a 3 suman 19 UF y del 4 en adelante son 9 UF.
- **Clínica:** un solo pago.

Todo se cobra en **UF**. También quiere ver el equivalente en **pesos**.

## Objetivos

1. Cada proyecto tiene uno o más **planes de pago**. Un plan es de uno de tres tipos:
   - **Pago único:** un monto en UF y una fecha.
   - **Cuotas:** N pagos de X UF, mensuales desde una fecha inicial.
   - **Mensual:** X UF cada mes desde una fecha inicial, sin término. Se le puede poner un término después, por ejemplo si el cliente se va.
   
   El Hotel Don Luis se arma con dos planes: "Mensualidad" (mensual, 9 UF) y "Implementación" (3 cuotas de 10 UF), ambos con la misma fecha inicial.
2. La app genera sola las fechas de los pagos. Ricardo no ingresa cada mes a mano.
3. Cada pago está **pendiente** o **pagado**. Se marca y desmarca con un clic. No se guarda ningún otro dato manual (ni factura ni monto real).
4. **Sección "Pagos" en el panel del proyecto** (`components/ProjectPanel.tsx`, junto a "Próximos pasos"):
   - **Pagado:** lista con fecha y UF, y el total cobrado del proyecto.
   - **Por cobrar:** próximos pagos con fecha y UF. Los pagos con fecha pasada que siguen sin pagar aparecen como **atrasados**, destacados y primero.
   - Gestión de planes: crear, editar (concepto, monto, fecha inicial y cantidad de cuotas), terminar un mensual y eliminar.
5. **Vista general de pagos**, con todos los proyectos:
   - Por cobrar **este mes** y **el próximo mes**: total y detalle por proyecto.
   - **Atrasados:** total y detalle.
   - **Cobrado en el año en curso:** total.
   
   Se abre desde el encabezado del Workspace.
6. **Pesos:** cada monto en UF muestra al lado su equivalente en CLP.

## Fuera de alcance

- Gastos y pagos hechos por Ricardo. Solo se registran cobros a clientes.
- Facturación, boletas, recordatorios por correo y cualquier conexión a bancos.
- Pagos parciales: un pago está pagado completo o pendiente.
- Monedas distintas de UF.
- Reportes o exportación a Excel.

## Lo que lo haría un fracaso

- Que, al cambiar un plan, cambien los montos de pagos ya cobrados. El historial de lo pagado no se toca.
- Que, si la API de la UF falla, la app se rompa o muestre pesos inventados. En ese caso se muestra solo UF.
- Que el mensual sin término llene la pantalla con una lista infinita.

## Decisiones de comportamiento

Marcadas como **[mi decisión]** las que tomé yo (Claude); Ricardo puede cambiarlas.

- **Fechas:** cada pago cae el mismo día del mes que la fecha inicial. Si ese día no existe (un 31 en febrero), cae el último día del mes. **[mi decisión]**
- **Horizonte del mensual:** "Por cobrar" muestra los pagos atrasados y los próximos **12 meses**. **[mi decisión]**
- **Pagos atrasados:** son los pagos con fecha anterior a hoy (hora de Chile, `America/Santiago`) que siguen pendientes. No tienen límite hacia atrás.
- **Al marcar como pagado** se guardan:
  - la fecha de pago, que es **la más temprana entre hoy y la fecha del pago**,
  - el monto en UF de ese momento,
  - el valor de la UF de esa fecha.
  
  Así los pesos de lo cobrado quedan fijos. La regla de la fecha tiene un motivo: al empezar, Ricardo va a marcar de una vez los meses ya cobrados del Hotel Don Luis y de Transmarko. Esos pagos tienen que quedar en su mes original y con la UF de ese mes, no con la de hoy. Si un cliente paga un mes atrasado, el pago queda registrado en la fecha en que vencía. **[mi decisión]** Si el valor de la UF no está disponible al marcar, se guarda sin valor UF y lo pagado de ese pago se muestra solo en UF. **[mi decisión]**
- **Pesos de lo pendiente:** se calculan con el valor UF de hoy y se rotulan "aprox." **[mi decisión]**
- **Editar un plan:** cambia los pagos pendientes. Los pagados conservan el monto guardado.
  - Si un cambio de fecha inicial o de cantidad de cuotas deja un pago pagado fuera del calendario, ese pago se sigue mostrando en "Pagado", porque es historia real.
  - Ejemplo: un plan de 4 cuotas pasa a 3 y la cuota 4 ya estaba pagada. La cuota 4 sigue apareciendo en "Pagado". **[mi decisión]**
- **Terminar un mensual:** se elige el último mes que se cobra. No se generan pagos después de ese mes.
- **Eliminar un plan:** pide confirmación. Si el plan tiene pagos marcados, avisa que también se borra ese historial. **[mi decisión]**
- **Proyectos archivados:** su historial sigue contando en "Cobrado en el año", pero sus pagos pendientes no aparecen en la vista general. **[mi decisión]**

## Cómo se construye (lo que ya existe y lo que decidí)

La app es Next.js 15 con Drizzle, Postgres con RLS por usuario y server actions validadas con zod (`lib/actions.ts` usa `mutate` con `op`, y `lib/validation.ts`). El tablero se carga en `lib/data.ts` con `unstable_cache` y un tag por usuario. La feature sigue esos mismos patrones. **[mi decisión]**

**Datos** (nueva migración `drizzle/0005_payments.sql`, con las mismas políticas RLS que `project_steps`):

- `payment_plans`:
  - `id`, `project_id` (con cascade),
  - `concept` (texto; ej. "Mensualidad"),
  - `kind` (enum `once` | `installments` | `monthly`),
  - `amount_uf` (`numeric(10,2)`),
  - `start_date` (`date`),
  - `installments` (entero, solo para cuotas),
  - `end_date` (`date`, nulo; solo para un mensual terminado),
  - `position`, `created_at`.
- `payments`: un registro **solo por cada pago marcado como pagado**. Los pendientes no se guardan; se calculan desde el plan.
  - `id`, `plan_id` (con cascade),
  - `seq` (número del pago dentro del plan, desde 0),
  - `due_date`,
  - `amount_uf`,
  - `paid_on` (`date`),
  - `uf_value` (`numeric`, nulo),
  - `unique(plan_id, seq)`.
  
  Desmarcar borra el registro.

**Lógica pura** (`lib/payments.ts`, con tests en vitest, como `lib/steps.ts`): genera el calendario de un plan hasta una fecha límite, cruza el calendario con los pagos registrados y calcula los totales del proyecto y de la vista general. Toda la aritmética de fechas y montos vive ahí.

**Valor UF:** se obtiene de `https://mindicador.cl/api/uf`, una API pública y gratuita que no requiere clave. **[mi decisión]**

- El valor de hoy se cachea unas horas con `unstable_cache`.
- Al marcar un pago, se usa el valor de esa fecha con `/api/uf/dd-mm-yyyy`.
- El fetch tiene un timeout corto. Si falla, se devuelve `null` y la UI muestra solo UF.

**Carga:** los planes y los pagos se agregan a `BoardData` en `lib/data.ts`. Las mutaciones (`addPlan`, `editPlan`, `deletePlan`, `markPaid`, `unmarkPaid`) se agregan a `mutate` e invalidan el mismo tag del tablero.

**Vista general:** una ruta nueva `app/pagos/page.tsx`, protegida con `requireUser` y alimentada desde `getBoard`. Se enlaza desde el encabezado del Workspace. **[mi decisión]**

**Formato:** las UF se muestran con 2 decimales y coma decimal ("9,00 UF"). Los pesos se muestran sin decimales y con separador de miles ("$ 342.150"), usando `Intl` con `es-CL`.

**Datos iniciales:** Ricardo ingresa los planes de Transmarko, del Hotel Don Luis y de la Clínica desde la propia app. No hay que precargarlos con `scripts/seed.ts`.

## Lo que queda a criterio de quien lo construya

- El diseño visual exacto de la sección y de la vista general. Debe seguir el estilo existente de `globals.css` y de `panel-section`.
- La forma del formulario para crear y editar planes, siempre que muestre solo los campos que aplican a cada tipo.
- Una prueba e2e para marcar un pago, si cabe en `tests/e2e/workspace.spec.ts`.
