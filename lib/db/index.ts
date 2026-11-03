import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
const globalDb = globalThis as unknown as {
  projectSql?: ReturnType<typeof postgres>;
};
export function database() {
  if (!process.env.DATABASE_URL)
    throw new Error(
      "Configura DATABASE_URL en .env.local para conectar PostgreSQL.",
    );
  globalDb.projectSql ??= postgres(process.env.DATABASE_URL, {
    max: 3,
    prepare: false,
  });
  return drizzle(globalDb.projectSql, { schema });
}
