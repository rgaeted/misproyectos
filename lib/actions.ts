"use server";
import { auth } from "@/auth";
import { withUserDatabase } from "./db";
import { projects, projectItems, projectRepos, projectSteps, inbox, paymentPlans, payments } from "./db/schema";
import { dueDateFor, paidOnFor, todayInChile } from "./payments";
import { fetchUf, getUfToday } from "./uf";
import { and, eq, getTableColumns } from "drizzle-orm";
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
        switch (c.op) {
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
            const rows = await tx.select({ position: projectSteps.position }).from(projectSteps).where(eq(projectSteps.projectId, c.projectId));
            if (rows.length >= 500) throw new Error("too_many_steps");
            await tx.insert(projectSteps).values({
              projectId: c.projectId, text: c.text, state: c.state,
              waitingOn: c.state === "waiting" ? c.waitingOn : "",
              position: rows.reduce((max, row) => Math.max(max, row.position), -1) + 1,
            });
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
