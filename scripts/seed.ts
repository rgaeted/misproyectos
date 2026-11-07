import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { projects, projectItems, projectRepos, projectSteps, inbox, users } from "../lib/db/schema";
import { eq, sql } from "drizzle-orm";
import seed from "../data/seed.json";
import { stages, type Stage } from "../lib/stages";
const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
const db = drizzle(client);
async function seedDatabase() {
  try {
    const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.githubId, "289845187"));
    if (!owner) throw new Error("Ejecuta las migraciones antes del seed.");
    const userId = owner.id;
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      for (const p of seed.projects) {
        const inserted = await tx
          .insert(projects)
          .values({
            id: p.id,
            userId,
            name: p.name,
            type: p.type,
            stage: stages.includes(p.stage as Stage) ? (p.stage as Stage) : null,
            sortOrder: p.sort_order,
            lastUpdate: p.last_update,
            nextStep: p.next_step,
            noRepoNote: "no_repo_note" in p ? p.no_repo_note : null,
          })
          .onConflictDoNothing()
          .returning();
        if (!inserted.length) continue;
        if (p.next_step.trim()) await tx.insert(projectSteps).values({ projectId: p.id, text: p.next_step, position: 0 });
        for (const repo of p.repos) {
          const [owner, name] = repo.split("/");
          await tx
            .insert(projectRepos)
            .values({ projectId: p.id, owner, name })
            .onConflictDoNothing();
        }
        for (const [kind, items] of [
          ["status", p.status],
          ["question", p.questions],
        ] as const) {
          for (const [position, text] of items.entries())
            await tx
              .insert(projectItems)
              .values({ projectId: p.id, kind, text, position });
        }
      }
      for (const text of seed.inbox) {
        const id = "302bf888-a520-49b7-b14c-cc9fc295e86e";
        await tx.insert(inbox).values({ id, userId, text }).onConflictDoNothing();
      }
    });
    console.log("Seed completo: datos existentes preservados.");
  } finally {
    await client.end();
  }
}

seedDatabase().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
