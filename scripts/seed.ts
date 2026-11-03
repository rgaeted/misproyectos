import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { projects, projectItems, projectRepos, inbox } from "../lib/db/schema";
import seed from "../data/seed.json";
import { stages, type Stage } from "../lib/stages";
const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client);
try {
  await db.transaction(async (tx) => {
    for (const p of seed.projects) {
      const inserted = await tx
        .insert(projects)
        .values({
          id: p.id,
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
      await tx.insert(inbox).values({ id, text }).onConflictDoNothing();
    }
  });
  console.log("Seed completo: datos existentes preservados.");
} finally {
  await client.end();
}
