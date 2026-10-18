import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Bump when the generated client shape changes (e.g. User.prepaidCredit,
 * PenaltyWaiver) so hot-reload does not keep a stale PrismaClient in `globalThis`.
 */
const PRISMA_SINGLETON_KEY = "bbbank.prisma.v6-verify-alloc-summary";

const globalForPrisma = globalThis as unknown as {
  prismaByKey?: Record<string, PrismaClient | undefined>;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

/**
 * Singleton Prisma client (Prisma 7 requires a driver adapter).
 * Reuses the instance across hot reloads in development.
 */
const cache = (globalForPrisma.prismaByKey ??= {});
export const prisma = cache[PRISMA_SINGLETON_KEY] ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  cache[PRISMA_SINGLETON_KEY] = prisma;
}
