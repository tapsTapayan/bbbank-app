/**
 * One-shot backfill: open current (+ next) kinsena for the active fund cycle.
 *
 * Usage (from repo root, with DATABASE_URL set):
 *   npx tsx scripts/backfill-kinsenas.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import {
  currentKinsenaPeriod,
  nextKinsenaPeriod,
  openKinsenaPeriod,
} from "../src/lib/finance/contribution-generator";

async function main() {
  const admin =
    (await prisma.user.findFirst({ where: { role: "ADMIN" } })) ??
    (await prisma.user.findFirst({ where: { role: "TREASURER" } }));

  if (!admin) {
    throw new Error("No ADMIN/TREASURER user to attribute prepaid ledger lines.");
  }

  const current = currentKinsenaPeriod();
  const next = nextKinsenaPeriod();

  console.log("Opening current", current);
  const a = await openKinsenaPeriod({ ...current, openedById: admin.id });
  console.log(a);

  console.log("Opening next (advance)", next);
  const b = await openKinsenaPeriod({ ...next, openedById: admin.id });
  console.log(b);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
