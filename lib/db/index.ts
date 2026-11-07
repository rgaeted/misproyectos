import "server-only";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { sql } from "drizzle-orm";
import { isUserId } from "../access";
const globalDb = globalThis as unknown as {
  projectPool?: Pool;
};
export function database() {
  if (!process.env.DATABASE_URL)
    throw new Error(
      "Configura DATABASE_URL en .env.local para conectar PostgreSQL.",
    );
  if (!globalDb.projectPool) {
    const connectionUrl = new URL(process.env.DATABASE_URL);
    if (connectionUrl.searchParams.get("sslmode") === "require") {
      connectionUrl.searchParams.set("uselibpqcompat", "true");
    }
    const pool = new Pool({
      connectionString: connectionUrl.toString(),
      max: 3,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 5_000,
      maxLifetimeSeconds: 300,
      query_timeout: 10_000,
      statement_timeout: 10_000,
      allowExitOnIdle: true,
    });
    pool.on("error", (error) => {
      console.error("database_pool_error", { message: error.message });
    });
    if (process.env.VERCEL) attachDatabasePool(pool);
    globalDb.projectPool = pool;
  }
  return drizzle(globalDb.projectPool, { schema });
}
export type UserDatabase = Parameters<Parameters<ReturnType<typeof database>["transaction"]>[0]>[0];
export async function withUserDatabase<T>(
  userId: string,
  work: (tx: UserDatabase) => Promise<T>,
): Promise<T> {
  if (!isUserId(userId)) throw new Error("invalid_user");
  return database().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return work(tx);
  });
}
