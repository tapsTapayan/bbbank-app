import "dotenv/config";
import { defineConfig, env } from "prisma/config";

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
    url: env("DATABASE_URL"),
  },
});
