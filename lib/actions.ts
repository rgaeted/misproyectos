"use server";
import { auth } from "@/auth";
import { withUserDatabase } from "./db";
import { projects, projectItems, projectRepos, projectSteps, inbox, paymentPlans, payments, dayLists, dayListItems, timeEntries } from "./db/schema";
import { dueDateFor, paidOnFor, todayInChile } from "./payments";
import { completedAtFor, type StepState } from "./steps";
import { stopActionFor, taskChangeFor, validEntryRange } from "./time";
import { fetchUf, getUfToday } from "./uf";
import { and, eq, getTableColumns, inArray, isNull } from "drizzle-orm";
import { command } from "./validation";
import { revalidatePath, revalidateTag } from "next/cache";
import { refreshRepos } from "./github";
import { isUserId } from "./access";
import { boardTag } from "./board-cache";
import { githubTokenForUser } from "./integrations";
export async function mutate(
  input: unknown,
): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const userId = (await auth())?.user?.id;
  if (!isUserId(userId))
    return { ok: false, error: "Tu sesión terminó. Vuelve a iniciar sesión." };
  const parsed = command.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  const c = parsed.data;
  try {
    let resultId: string | undefined;
    if (c.op === "refresh") {
      const token = await githubTokenForUser(userId);
      if (!token)
        return {
          ok: false,
          error:
            "La actualización de repositorios requiere una cuenta de GitHub. Vuelve a entrar con GitHub para renovar el acceso.",
        };
      const repos = await withUserDatabase(userId, async (tx) => {
        const [project] = await tx.select({ id: projects.id }).from(projects)
          .where(and(eq(projects.id, c.projectId), eq(projects.userId, userId)));
        if (!project) throw new Error("missing_project");
        return tx.select().from(projectRepos).where(eq(projectRepos.projectId, project.id));
      });
      await refreshRepos(repos, userId, token);
    } else if (c.op === "markPaid") {
      // La consulta de la UF es una llamada HTTP: se hace fuera de la transacción.
      const plan = await withUserDatabase(userId, async (tx) => {
        const [row] = await tx.select(getTableColumns(paymentPlans)).from(paymentPlans)
          .innerJoin(projects, eq(paymentPlans.projectId, projects.id))
          .where(and(eq(paymentPlans.id, c.planId), eq(projects.userId, userId)));
        if (!row) throw new Error("missing_plan");
        return row;
      });
      const dueDate = dueDateFor(plan, c.seq);
      if (!dueDate) throw new Error("invalid_payment");
      const today = todayInChile();
      const paidOn = paidOnFor(dueDate, today);
      const ufValue = paidOn === today ? await getUfToday() : await fetchUf(paidOn);
      await withUserDatabase(userId, async (tx) => {
        await tx.insert(payments).values({ planId: plan.id, seq: c.seq, dueDate, amountUf: plan.amountUf, paidOn, ufValue })
          .onConflictDoNothing();
        await tx.update(projects).set({ updatedAt: new Date() })
          .where(and(eq(projects.id, plan.projectId), eq(projects.userId, userId)));
      });
    } else
      await withUserDatabase(userId, async (tx) => {
        const ownedProject = async (id: string) => {
          const [project] = await tx.select().from(projects)
            .where(and(eq(projects.id, id), eq(projects.userId, userId))).for("update");
          if (!project) throw new Error("missing_project");
          return project;
        };
        const touch = async (id: string) => {
          await tx
            .update(projects)
            .set({ updatedAt: new Date() })
            .where(and(eq(projects.id, id), eq(projects.userId, userId)));
        };
        const ownedStep = async (id: string) => {
          const [pointer] = await tx.select({ projectId: projectSteps.projectId }).from(projectSteps).where(eq(projectSteps.id, id));
          if (!pointer) throw new Error("missing_step");
          await ownedProject(pointer.projectId);
          const [step] = await tx.select().from(projectSteps).where(eq(projectSteps.id, id));
          if (!step) throw new Error("missing_step");
          return step;
        };
        const ownedPlan = async (id: string) => {
          const [pointer] = await tx.select({ projectId: paymentPlans.projectId }).from(paymentPlans).where(eq(paymentPlans.id, id));
          if (!pointer) throw new Error("missing_plan");
          await ownedProject(pointer.projectId);
          const [plan] = await tx.select().from(paymentPlans).where(eq(paymentPlans.id, id));
          if (!plan) throw new Error("missing_plan");
          return plan;
        };
        // Llamar después de ownedProject(projectId).
        const insertStep = async (projectId: string, text: string, state: StepState, waitingOn: string) => {
          const rows = await tx.select({ position: projectSteps.position }).from(projectSteps).where(eq(projectSteps.projectId, projectId));
          if (rows.length >= 500) throw new Error("too_many_steps");
          const [step] = await tx.insert(projectSteps).values({
            projectId, text, state,
            waitingOn: state === "waiting" ? waitingOn : "",
            completedAt: completedAtFor(null, state, null, new Date()),
            position: rows.reduce((max, row) => Math.max(max, row.position), -1) + 1,
          }).returning({ id: projectSteps.id });
          return step.id;
        };
        // Llamar después de ownedProject(projectId): el paso debe ser de ese proyecto.
        const projectStep = async (projectId: string, id: string) => {
          const [step] = await tx.select().from(projectSteps)
            .where(and(eq(projectSteps.id, id), eq(projectSteps.projectId, projectId)));
          if (!step) throw new Error("missing_step");
          return step;
        };
        const ownedEntry = async (id: string) => {
          const [pointer] = await tx.select({ projectId: timeEntries.projectId }).from(timeEntries).where(eq(timeEntries.id, id));
          if (!pointer) throw new Error("missing_entry");
          await ownedProject(pointer.projectId);
          const [entry] = await tx.select().from(timeEntries).where(eq(timeEntries.id, id));
          if (!entry) throw new Error("missing_entry");
          return entry;
        };
        const runningEntry = async (projectId: string) => {
          const [entry] = await tx.select().from(timeEntries)
            .where(and(eq(timeEntries.projectId, projectId), isNull(timeEntries.endedAt)));
          return entry ? { ...entry, startedAt: entry.startedAt.toISOString() } : undefined;
        };
        // Llamar después de ownedProject(projectId).
        const stopRunning = async (projectId: string, now: Date) => {
          const running = await runningEntry(projectId);
          if (!running) return;
          if (stopActionFor(running, now) === "close")
            await tx.update(timeEntries).set({ endedAt: now }).where(eq(timeEntries.id, running.id));
          else await tx.delete(timeEntries).where(eq(timeEntries.id, running.id));
        };
        switch (c.op) {
          case "startTimer": {
            const project = await ownedProject(c.projectId);
            if (project.archived) throw new Error("archived");
            await tx.insert(timeEntries).values({ projectId: c.projectId, startedAt: new Date() }).onConflictDoNothing();
            await touch(c.projectId);
            break;
          }
          case "setTimerTask": {
            const project = await ownedProject(c.projectId);
            if (project.archived) throw new Error("archived");
            // Sin reloj en marcha no se inicia uno: la UI ofrece "Iniciar" para eso.
            const running = await runningEntry(c.projectId);
            if (!running) throw new Error("not_running");
            const now = new Date();
            const task = c.stepId !== undefined
              ? await projectStep(c.projectId, c.stepId).then((step) => ({ stepId: step.id, taskText: step.text }))
              : { stepId: await insertStep(c.projectId, c.text!, "todo", ""), taskText: c.text! };
            const change = taskChangeFor(running, now);
            if (change === "assign") {
              await tx.update(timeEntries).set(task).where(eq(timeEntries.id, running.id));
            } else {
              if (change === "replace") await tx.delete(timeEntries).where(eq(timeEntries.id, running.id));
              else await tx.update(timeEntries).set({ endedAt: now }).where(eq(timeEntries.id, running.id));
              await tx.insert(timeEntries).values({ projectId: c.projectId, startedAt: now, ...task });
            }
            await touch(c.projectId);
            break;
          }
          case "stopTimer": {
            await ownedProject(c.projectId);
            await stopRunning(c.projectId, new Date());
            await touch(c.projectId);
            break;
          }
          case "addTimeEntry": {
            await ownedProject(c.projectId);
            const startedAt = new Date(c.startedAt);
            const endedAt = new Date(c.endedAt);
            if (!validEntryRange(startedAt, endedAt, new Date())) throw new Error("invalid_range");
            const task = c.stepId
              ? await projectStep(c.projectId, c.stepId).then((step) => ({ stepId: step.id, taskText: step.text }))
              : { stepId: null, taskText: "" };
            await tx.insert(timeEntries).values({ projectId: c.projectId, startedAt, endedAt, ...task });
            await touch(c.projectId);
            break;
          }
          case "editTimeEntry": {
            const entry = await ownedEntry(c.id);
            if (entry.endedAt === null) throw new Error("running_entry");
            const startedAt = c.startedAt !== undefined ? new Date(c.startedAt) : entry.startedAt;
            const endedAt = c.endedAt !== undefined ? new Date(c.endedAt) : entry.endedAt;
            if (!validEntryRange(startedAt, endedAt, new Date())) throw new Error("invalid_range");
            const task = c.stepId === undefined
              ? {}
              : c.stepId === null
                ? { stepId: null, taskText: "" }
                : await projectStep(entry.projectId, c.stepId).then((step) => ({ stepId: step.id, taskText: step.text }));
            await tx.update(timeEntries).set({ startedAt, endedAt, ...task }).where(eq(timeEntries.id, entry.id));
            await touch(entry.projectId);
            break;
          }
          case "removeTimeEntry": {
            const entry = await ownedEntry(c.id);
            await tx.delete(timeEntries).where(eq(timeEntries.id, entry.id));
            await touch(entry.projectId);
            break;
          }
          case "confirmDayList": {
            const stepIds = c.items.flatMap((item) => ("stepId" in item ? [item.stepId] : []));
            const found = stepIds.length
              ? await tx.select({ id: projectSteps.id, text: projectSteps.text }).from(projectSteps)
                  .innerJoin(projects, eq(projectSteps.projectId, projects.id))
                  .where(and(inArray(projectSteps.id, stepIds), eq(projects.userId, userId)))
              : [];
            const texts = new Map(found.map((row) => [row.id, row.text]));
            if (stepIds.some((id) => !texts.has(id))) throw new Error("missing_step");
            await tx.delete(dayListItems).where(eq(dayListItems.userId, userId));
            if (c.items.length)
              await tx.insert(dayListItems).values(c.items.map((item, position) =>
                "stepId" in item
                  ? { userId, stepId: item.stepId, text: texts.get(item.stepId)!, position }
                  : { userId, text: item.text, position }));
            await tx.insert(dayLists).values({ userId, confirmedAt: new Date() })
              .onConflictDoUpdate({ target: dayLists.userId, set: { confirmedAt: new Date() } });
            break;
          }
          case "toggleDayItem": {
            const [item] = await tx.select().from(dayListItems)
              .where(and(eq(dayListItems.id, c.id), eq(dayListItems.userId, userId)));
            if (!item) throw new Error("missing_item");
            if (item.stepId) {
              const step = await ownedStep(item.stepId);
              const state = c.done ? "done" : "todo";
              await tx.update(projectSteps).set({
                state, waitingOn: "", completedAt: completedAtFor(step.state, state, step.completedAt, new Date()),
              }).where(eq(projectSteps.id, step.id));
              await touch(step.projectId);
            } else {
              await tx.update(dayListItems).set({ done: c.done, doneAt: c.done ? new Date() : null })
                .where(eq(dayListItems.id, item.id));
            }
            break;
          }
          case "addPlan": {
            await ownedProject(c.projectId);
            const rows = await tx.select({ position: paymentPlans.position }).from(paymentPlans).where(eq(paymentPlans.projectId, c.projectId));
            if (rows.length >= 50) throw new Error("too_many_plans");
            await tx.insert(paymentPlans).values({
              projectId: c.projectId, concept: c.concept, kind: c.kind, amountUf: c.amountUf, startDate: c.startDate,
              installments: c.kind === "installments" ? c.installments : null,
              position: rows.reduce((max, row) => Math.max(max, row.position), -1) + 1,
            });
            await touch(c.projectId);
            break;
          }
          case "editPlan": {
            const plan = await ownedPlan(c.id);
            if (c.installments !== undefined && plan.kind !== "installments") throw new Error("invalid_installments");
            if (c.endDate !== undefined && plan.kind !== "monthly") throw new Error("invalid_end_date");
            const startDate = c.startDate ?? plan.startDate;
            if (c.endDate && c.endDate < startDate) throw new Error("invalid_end_date");
            if (c.startDate && plan.endDate && plan.endDate < c.startDate) throw new Error("invalid_end_date");
            await tx.update(paymentPlans).set({
              ...(c.concept !== undefined ? { concept: c.concept } : {}),
              ...(c.amountUf !== undefined ? { amountUf: c.amountUf } : {}),
              ...(c.startDate !== undefined ? { startDate: c.startDate } : {}),
              ...(c.installments !== undefined ? { installments: c.installments } : {}),
              ...(c.endDate !== undefined ? { endDate: c.endDate } : {}),
            }).where(eq(paymentPlans.id, plan.id));
            await touch(plan.projectId);
            break;
          }
          case "deletePlan": {
            const plan = await ownedPlan(c.id);
            await tx.delete(paymentPlans).where(eq(paymentPlans.id, plan.id));
            await touch(plan.projectId);
            break;
          }
          case "unmarkPaid": {
            const plan = await ownedPlan(c.planId);
            await tx.delete(payments).where(and(eq(payments.planId, plan.id), eq(payments.seq, c.seq)));
            await touch(plan.projectId);
            break;
          }
          case "addStep": {
            await ownedProject(c.projectId);
            await insertStep(c.projectId, c.text, c.state, c.waitingOn);
            await touch(c.projectId);
            break;
          }
          case "editStep": {
            const step = await ownedStep(c.id);
            const state = c.state ?? step.state;
            if (c.waitingOn && state !== "waiting") throw new Error("invalid_waiting_note");
            await tx.update(projectSteps).set({
              ...(c.text !== undefined ? { text: c.text } : {}),
              state,
              waitingOn: state === "waiting" ? c.waitingOn ?? step.waitingOn : "",
              completedAt: completedAtFor(step.state, state, step.completedAt, new Date()),
            }).where(eq(projectSteps.id, step.id));
            await touch(step.projectId);
            break;
          }
          case "removeStep": {
            const step = await ownedStep(c.id);
            await tx.delete(projectSteps).where(eq(projectSteps.id, step.id));
            await touch(step.projectId);
            break;
          }
          case "reorderSteps": {
            await ownedProject(c.projectId);
            const rows = await tx.select({ id: projectSteps.id }).from(projectSteps).where(eq(projectSteps.projectId, c.projectId));
            if (new Set(c.ids).size !== rows.length || c.ids.length !== rows.length || rows.some((row) => !c.ids.includes(row.id))) throw new Error("stale_order");
            for (const [position, id] of c.ids.entries()) await tx.update(projectSteps).set({ position }).where(eq(projectSteps.id, id));
            await touch(c.projectId);
            break;
          }
          case "create": {
            resultId = crypto.randomUUID();
            await tx
              .insert(projects)
              .values({ id: resultId, userId, name: c.name, stage: "idea" });
            break;
          }
          case "update":
            await ownedProject(c.id);
            if (c.patch.archived === true) await stopRunning(c.id, new Date());
            await tx
              .update(projects)
              .set({ ...c.patch, updatedAt: new Date() })
              .where(and(eq(projects.id, c.id), eq(projects.userId, userId)));
            break;
          case "delete": {
            const p = await ownedProject(c.id);
            if (!p?.archived) throw new Error("archive_first");
            await tx.delete(projects).where(and(eq(projects.id, c.id), eq(projects.userId, userId)));
            break;
          }
          case "addItem": {
            await ownedProject(c.projectId);
            const rows = await tx
              .select()
              .from(projectItems)
              .where(
                and(
                  eq(projectItems.projectId, c.projectId),
                  eq(projectItems.kind, c.kind),
                ),
              );
            await tx.insert(projectItems).values({
              projectId: c.projectId,
              kind: c.kind,
              text: c.text,
              position:
                rows.reduce((max, r) => Math.max(max, r.position), -1) + 1,
            });
            await touch(c.projectId);
            break;
          }
          case "editItem": {
            const [existing] = await tx
              .select()
              .from(projectItems)
              .where(eq(projectItems.id, c.id));
            if (
              !existing ||
              (c.done !== undefined && existing.kind !== "question")
            )
              throw new Error("invalid_item");
            const [item] = await tx
              .update(projectItems)
              .set({
                ...("text" in c ? { text: c.text } : {}),
                ...("done" in c ? { done: c.done } : {}),
              })
              .where(eq(projectItems.id, c.id))
              .returning();
            if (!item) throw new Error("missing_item");
            await touch(item.projectId);
            break;
          }
          case "removeItem": {
            const [item] = await tx
              .delete(projectItems)
              .where(eq(projectItems.id, c.id))
              .returning();
            if (!item) throw new Error("missing_item");
            await touch(item.projectId);
            break;
          }
          case "reorder": {
            await ownedProject(c.projectId);
            const rows = await tx
              .select()
              .from(projectItems)
              .where(
                and(
                  eq(projectItems.projectId, c.projectId),
                  eq(projectItems.kind, c.kind),
                ),
              );
            if (
              new Set(c.ids).size !== rows.length ||
              c.ids.length !== rows.length ||
              rows.some((r) => !c.ids.includes(r.id))
            )
              throw new Error("stale_order");
            for (const [position, id] of c.ids.entries())
              await tx
                .update(projectItems)
                .set({ position })
                .where(eq(projectItems.id, id));
            await touch(c.projectId);
            break;
          }
          case "addRepo":
            await ownedProject(c.projectId);
            await tx
              .insert(projectRepos)
              .values({ projectId: c.projectId, ...c.url })
              .onConflictDoNothing();
            await touch(c.projectId);
            break;
          case "removeRepo": {
            const [repo] = await tx
              .delete(projectRepos)
              .where(eq(projectRepos.id, c.id))
              .returning();
            if (!repo) throw new Error("missing_repo");
            await touch(repo.projectId);
            break;
          }
          case "capture":
            await tx.insert(inbox).values({ userId, text: c.text });
            break;
          case "removeInbox": {
            const removed = await tx.delete(inbox).where(and(eq(inbox.id, c.id), eq(inbox.userId, userId))).returning({ id: inbox.id });
            if (!removed.length) throw new Error("missing_idea");
            break;
          }
          case "convert": {
            const [idea] = await tx
              .delete(inbox)
              .where(and(eq(inbox.id, c.id), eq(inbox.userId, userId)))
              .returning();
            if (!idea) throw new Error("missing");
            resultId = crypto.randomUUID();
            await tx.insert(projects).values({
              id: resultId,
              userId,
              name: idea.text.slice(0, 120),
              lastUpdate: idea.text.length > 120 ? idea.text : "",
              stage: "idea",
            });
            break;
          }
        }
      });
    revalidateTag(boardTag(userId));
    revalidatePath("/", "layout");
    return { ok: true, id: resultId };
  } catch {
    return {
      ok: false,
      error:
        "No se pudo guardar el cambio. Actualiza la página e inténtalo de nuevo.",
    };
  }
}
