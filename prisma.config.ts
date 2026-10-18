import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

loadEnv({ path: ".env.local" });
loadEnv();

/**
 * Prisma ORM 7+ CLI config.
 * Connection URLs live here (not in schema.prisma).
 * Live DB wiring continues in Phase 2.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Prefer a *direct* Postgres host for migrate/db push:
    //   db.<project-ref>.supabase.co:5432
    // Session pooler (*.pooler.supabase.com:5432) often returns P1001 from
    // local networks. Transaction pooler (:6543) is for the app runtime only.
    url: process.env.DIRECT_URL ?? env("DATABASE_URL"),
  },
});
