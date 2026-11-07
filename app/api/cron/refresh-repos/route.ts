import { timingSafeEqual } from "node:crypto";
import { database, withUserDatabase } from "@/lib/db";
import { projectRepos, users, authRateLimits } from "@/lib/db/schema";
import { isNotNull, lt } from "drizzle-orm";
import { refreshRepos } from "@/lib/github";
import { revalidateTag } from "next/cache";
import { githubTokenForUser } from "@/lib/integrations";
import { boardTag } from "@/lib/board-cache";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (
    !secret ||
    Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  )
    return new Response("No autorizado", { status: 401 });
  try {
    const accounts = await database().select({ id: users.id }).from(users).where(isNotNull(users.githubToken));
    for (const user of accounts) {
      const token = await githubTokenForUser(user.id);
      if (!token) continue;
      const repos = await withUserDatabase(user.id, (tx) => tx.select().from(projectRepos));
      await refreshRepos(repos, user.id, token);
      revalidateTag(boardTag(user.id));
    }
    await database().delete(authRateLimits).where(lt(authRateLimits.resetsAt, new Date(Date.now() - 7 * 86400000)));
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
