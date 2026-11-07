import "server-only";
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { database } from "./db";
import { authRateLimits } from "./db/schema";

export function clientAddress(headers: Headers): string {
  return headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "local";
}
export async function allowAttempt(scope: string, identity: string, limit: number, seconds: number) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("missing_auth_secret");
  const key = createHmac("sha256", secret).update(`${scope}:${identity}`).digest("hex");
  const now = new Date();
  const resetsAt = new Date(now.getTime() + seconds * 1000);
  const [row] = await database().insert(authRateLimits).values({ key, attempts: 1, resetsAt })
    .onConflictDoUpdate({ target: authRateLimits.key, set: {
      attempts: sql`case when ${authRateLimits.resetsAt} <= ${now} then 1 else ${authRateLimits.attempts} + 1 end`,
      resetsAt: sql`case when ${authRateLimits.resetsAt} <= ${now} then ${resetsAt} else ${authRateLimits.resetsAt} end`,
    } }).returning({ attempts: authRateLimits.attempts });
  return row.attempts <= limit;
}
