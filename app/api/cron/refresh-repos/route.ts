import { timingSafeEqual } from "node:crypto";
import { database } from "@/lib/db";
import { projectRepos } from "@/lib/db/schema";
import { refreshRepos } from "@/lib/github";
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
    await refreshRepos(await database().select().from(projectRepos));
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
