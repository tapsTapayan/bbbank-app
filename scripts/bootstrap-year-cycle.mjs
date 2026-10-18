/**
 * Create/activate CPE {year} and open all kinsenas from Jan 1 through next period.
 * Usage: node --env-file=.env.local scripts/bootstrap-year-cycle.mjs [year] [--reset]
 *   --reset  deletes existing contributions for the cycle before reopening
 */
import { PrismaClient, Prisma } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const args = process.argv.slice(2);
const reset = args.includes("--reset");
const year = Number(args.find((a) => /^\d{4}$/.test(a)) ?? new Date().getFullYear());
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function dateOnlyUTC(y, monthIndex, day) {
  return new Date(Date.UTC(y, monthIndex, day));
}

function lastDayOfMonth(y, monthIndex) {
  return new Date(Date.UTC(y, monthIndex + 1, 0)).getUTCDate();
}

function getKinsenaDueDate(y, monthIndex, kinsenaIndex) {
  if (kinsenaIndex === 1) return dateOnlyUTC(y, monthIndex, 15);
  return dateOnlyUTC(y, monthIndex, Math.min(30, lastDayOfMonth(y, monthIndex)));
}

function computeGraceDeadline(dueDate, graceDays) {
  return dateOnlyUTC(
    dueDate.getUTCFullYear(),
    dueDate.getUTCMonth(),
    dueDate.getUTCDate() + graceDays,
  );
}

function startOfLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function nextKinsenaPeriod(from) {
  const start = startOfLocalDay(from);
  const y = start.getFullYear();
  const monthIndex = start.getMonth();
  const mid = getKinsenaDueDate(y, monthIndex, 1);
  // Compare calendar days via UTC parts of due vs local today parts
  const todayKey = y * 1000 + monthIndex * 10 + start.getDate();
  const midKey = mid.getUTCFullYear() * 1000 + mid.getUTCMonth() * 10 + mid.getUTCDate();
  if (midKey > todayKey) return { year: y, monthIndex, kinsenaIndex: 1 };
  const end = getKinsenaDueDate(y, monthIndex, 2);
  const endKey = end.getUTCFullYear() * 1000 + end.getUTCMonth() * 10 + end.getUTCDate();
  if (endKey > todayKey) return { year: y, monthIndex, kinsenaIndex: 2 };
  const nextMonth = monthIndex === 11 ? 0 : monthIndex + 1;
  const nextYear = monthIndex === 11 ? y + 1 : y;
  return { year: nextYear, monthIndex: nextMonth, kinsenaIndex: 1 };
}

function periodSortKey(p) {
  return p.year * 1000 + p.monthIndex * 10 + p.kinsenaIndex;
}

function kinsenaPeriodsThrough({ fromYear, fromMonthIndex, through }) {
  const end = periodSortKey(through);
  const out = [];
  let y = fromYear;
  let m = fromMonthIndex;
  for (let i = 0; i < 48; i += 1) {
    for (const k of [1, 2]) {
      const p = { year: y, monthIndex: m, kinsenaIndex: k };
      if (periodSortKey(p) > end) return out;
      out.push(p);
    }
    if (m === 11) {
      y += 1;
      m = 0;
    } else {
      m += 1;
    }
  }
  return out;
}

async function openKinsena(cycle, y, monthIndex, kinsenaIndex) {
  const periodMonth = dateOnlyUTC(y, monthIndex, 1);
  const dueDate = getKinsenaDueDate(y, monthIndex, kinsenaIndex);
  const graceDeadline = computeGraceDeadline(dueDate, cycle.gracePeriodDays);

  const members = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: { in: ["MEMBER", "TREASURER", "AUDITOR"] },
    },
    select: { id: true, headsCount: true },
  });

  let created = 0;
  let skipped = 0;

  for (const member of members) {
    const heads = Math.max(1, member.headsCount);
    const amountDue = new Prisma.Decimal(250).mul(heads);

    const existing = await prisma.contribution.findUnique({
      where: {
        userId_cycleId_periodMonth_kinsenaIndex: {
          userId: member.id,
          cycleId: cycle.id,
          periodMonth,
          kinsenaIndex,
        },
      },
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.contribution.create({
      data: {
        userId: member.id,
        cycleId: cycle.id,
        periodMonth,
        kinsenaIndex,
        headsSnapshot: heads,
        amountDue,
        dueDate,
        graceDeadline,
        status: "UNPAID",
      },
    });
    created += 1;
  }

  return { created, skipped };
}

async function main() {
  const startDate = dateOnlyUTC(year, 0, 1);
  const endDate = dateOnlyUTC(year, 11, 31);

  let cycle = await prisma.fundCycle.findFirst({
    where: { name: { contains: String(year) } },
  });

  if (cycle) {
    await prisma.$transaction(async (tx) => {
      await tx.fundCycle.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
      await tx.fundCycle.update({
        where: { id: cycle.id },
        data: { isActive: true, startDate, endDate },
      });
    });
    cycle = await prisma.fundCycle.findUniqueOrThrow({ where: { id: cycle.id } });
    console.log(`Reactivated cycle: ${cycle.name} (${cycle.id}) · dates fixed to UTC`);
  } else {
    cycle = await prisma.$transaction(async (tx) => {
      await tx.fundCycle.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
      return tx.fundCycle.create({
        data: {
          name: `CPE ${year}`,
          contributionAmount: new Prisma.Decimal("250.00"),
          loanInterestRate: new Prisma.Decimal("0.10"),
          penaltyRate: new Prisma.Decimal("10.00"),
          gracePeriodDays: 2,
          maxLoanablePoolRatio: new Prisma.Decimal("0.50"),
          loanTermMonths: 2,
          startDate,
          endDate,
          isActive: true,
        },
      });
    });
    console.log(`Created cycle: ${cycle.name} (${cycle.id})`);
  }

  if (reset) {
    const wiped = await prisma.contribution.deleteMany({
      where: { cycleId: cycle.id },
    });
    console.log(`Reset: deleted ${wiped.count} contribution(s)`);
  }

  const asOf = new Date();
  const through = nextKinsenaPeriod(asOf);
  const lastInCycle = {
    year: cycle.endDate.getUTCFullYear(),
    monthIndex: cycle.endDate.getUTCMonth(),
    kinsenaIndex: 2,
  };
  const cappedThrough =
    periodSortKey(through) <= periodSortKey(lastInCycle)
      ? through
      : lastInCycle;

  const periods = kinsenaPeriodsThrough({
    fromYear: year,
    fromMonthIndex: 0,
    through: cappedThrough,
  });

  let totalCreated = 0;
  for (const p of periods) {
    const result = await openKinsena(cycle, p.year, p.monthIndex, p.kinsenaIndex);
    totalCreated += result.created;
    console.log(
      `  ${p.year}-${String(p.monthIndex + 1).padStart(2, "0")} k${p.kinsenaIndex}: +${result.created} (skipped ${result.skipped})`,
    );
  }

  const total = await prisma.contribution.count({ where: { cycleId: cycle.id } });
  console.log(
    `Done. Created ${totalCreated} · ${total} total on ${cycle.name} · through ${cappedThrough.year}-${cappedThrough.monthIndex + 1} k${cappedThrough.kinsenaIndex}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
