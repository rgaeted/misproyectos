import { defineConfig } from "drizzle-kit";
const connectionUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : undefined;
if (connectionUrl?.searchParams.get("sslmode") === "require") {
  connectionUrl.searchParams.set("uselibpqcompat", "true");
}
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: connectionUrl?.toString() ?? "" },
});
