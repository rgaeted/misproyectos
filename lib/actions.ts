"use server";
import { auth } from "@/auth";
import { database } from "./db";
import { projects, projectItems, projectRepos, inbox } from "./db/schema";
import { and, eq, sql } from "drizzle-orm";
import { command } from "./validation";
import { revalidatePath } from "next/cache";
import { refreshRepos } from "./github";
export async function mutate(
  input: unknown,
): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  if (!(await auth()))
    return { ok: false, error: "Tu sesión terminó. Vuelve a iniciar sesión." };
  const parsed = command.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  const c = parsed.data;
  try {
    const db = database();
    let resultId: string | undefined;
    if (c.op === "refresh") {
      if (!process.env.GITHUB_TOKEN)
        return {
          ok: false,
          error:
            "Falta configurar GITHUB_TOKEN en el servidor para consultar los repositorios.",
        };
      const repos = await db
        .select()
        .from(projectRepos)
        .where(eq(projectRepos.projectId, c.projectId));
      await refreshRepos(repos);
    } else
      await db.transaction(async (tx) => {
        const touch = async (id: string) => {
          await tx
            .update(projects)
            .set({ updatedAt: new Date() })
            .where(eq(projects.id, id));
        };
        switch (c.op) {
          case "create": {
            resultId = crypto.randomUUID();
            await tx
              .insert(projects)
              .values({ id: resultId, name: c.name, stage: "idea" });
            break;
          }
          case "update":
            await tx
              .update(projects)
              .set({ ...c.patch, updatedAt: new Date() })
              .where(eq(projects.id, c.id));
            break;
          case "delete": {
            const [p] = await tx
              .select()
              .from(projects)
              .where(eq(projects.id, c.id));
            if (!p?.archived) throw new Error("archive_first");
            await tx.delete(projects).where(eq(projects.id, c.id));
            break;
          }
          case "addItem": {
            await tx.execute(
              sql`select id from projects where id = ${c.projectId} for update`,
            );
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
            if (item) await touch(item.projectId);
            break;
          }
          case "removeItem": {
            const [item] = await tx
              .delete(projectItems)
              .where(eq(projectItems.id, c.id))
              .returning();
            if (item) await touch(item.projectId);
            break;
          }
          case "reorder": {
            await tx.execute(
              sql`select id from projects where id = ${c.projectId} for update`,
            );
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
            if (repo) await touch(repo.projectId);
            break;
          }
          case "capture":
            await tx.insert(inbox).values({ text: c.text });
            break;
          case "removeInbox":
            await tx.delete(inbox).where(eq(inbox.id, c.id));
            break;
          case "convert": {
            const [idea] = await tx
              .delete(inbox)
              .where(eq(inbox.id, c.id))
              .returning();
            if (!idea) throw new Error("missing");
            resultId = crypto.randomUUID();
            await tx.insert(projects).values({
              id: resultId,
              name: idea.text.slice(0, 120),
              lastUpdate: idea.text.length > 120 ? idea.text : "",
              stage: "idea",
            });
            break;
          }
        }
      });
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
