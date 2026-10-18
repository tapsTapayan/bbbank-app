import { Decimal } from "decimal.js";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  calculateKinsenasDue,
  computeGraceDeadline,
  computeLiveLateFee,
  dateOnlyUTC,
  effectivePenaltyAmount,
  getKinsenaDueDate,
  GRACE_PERIOD_DAYS,
  startOfLocalDay,
} from "./cpe-policy";
import {
  allocateContributionPayment,
  contributionStatusAfterPayment,
  remainingContributionDues,
  toMoney,
} from "./payment-allocation";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export type OpenKinsenaInput = {
  year: number;
  /** 0-indexed month */
  monthIndex: number;
  kinsenaIndex: 1 | 2;
  cycleId?: string;
  /** Optional actor id (manual open / cycle activate). Unused by create path today. */
  openedById?: string;
};

export type OpenKinsenaResult = {
  cycleId: string;
  periodMonth: Date;
  kinsenaIndex: 1 | 2;
  dueDate: Date;
  graceDeadline: Date;
  created: number;
  skippedExisting: number;
  prepaidApplied: number;
};

function periodMonthDate(year: number, monthIndex: number): Date {
  return dateOnlyUTC(year, monthIndex, 1);
}

/**
 * Upserts Contribution rows for all ACTIVE members in the active (or given) fund cycle.
 * Auto-applies User.prepaidCredit FIFO to newly created rows.
 */
export async function openKinsenaPeriod(
  input: OpenKinsenaInput,
): Promise<OpenKinsenaResult> {
  const cycle =
    input.cycleId != null
      ? await prisma.fundCycle.findUniqueOrThrow({ where: { id: input.cycleId } })
      : await prisma.fundCycle.findFirst({ where: { isActive: true } });

  if (!cycle) {
    throw new Error("No active fund cycle. Activate a cycle before opening kinsenas.");
  }

  const periodMonth = periodMonthDate(input.year, input.monthIndex);
  const dueDate = getKinsenaDueDate(
    input.year,
    input.monthIndex,
    input.kinsenaIndex,
  );
  const graceDeadline = computeGraceDeadline(
    dueDate,
    cycle.gracePeriodDays,
  );

  const members = await prisma.user.findMany({
    where: { status: "ACTIVE", role: { in: ["MEMBER", "TREASURER", "AUDITOR"] } },
    select: {
      id: true,
      headsCount: true,
      prepaidCredit: true,
    },
  });

  let created = 0;
  let skippedExisting = 0;
  let prepaidApplied = 0;

  for (const member of members) {
    const heads = Math.max(1, member.headsCount);
    const amountDue = calculateKinsenasDue(
      heads,
      cycle.contributionAmount.toString(),
    );

    const existing = await prisma.contribution.findUnique({
      where: {
        userId_cycleId_periodMonth_kinsenaIndex: {
          userId: member.id,
          cycleId: cycle.id,
          periodMonth,
          kinsenaIndex: input.kinsenaIndex,
        },
      },
    });

    if (existing) {
      skippedExisting += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const row = await tx.contribution.create({
        data: {
          userId: member.id,
          cycleId: cycle.id,
          periodMonth,
          kinsenaIndex: input.kinsenaIndex,
          headsSnapshot: heads,
          amountDue: new Prisma.Decimal(amountDue.toFixed(2)),
          dueDate,
          graceDeadline,
        },
      });

      created += 1;

      const prepaid = toMoney(member.prepaidCredit?.toString() ?? "0");
      if (prepaid.lte(0)) return;

      const allocation = allocateContributionPayment(prepaid, {
        amountDue: amountDue,
        amountPaid: 0,
        penaltyAmount: 0,
      });
      const applied = toMoney(
        allocation.toPenalty.plus(allocation.toPrincipal),
      );
      if (applied.lte(0)) return;

      const newPaid = applied;
      const status = contributionStatusAfterPayment(
        { amountDue, amountPaid: 0, penaltyAmount: 0 },
        newPaid,
        "UNPAID",
      );

      await tx.contribution.update({
        where: { id: row.id },
        data: {
          amountPaid: new Prisma.Decimal(newPaid.toFixed(2)),
          status,
        },
      });

      await tx.user.update({
        where: { id: member.id },
        data: {
          prepaidCredit: new Prisma.Decimal(
            prepaid.minus(applied).toFixed(2),
          ),
        },
      });

      // No second CONTRIBUTION_IN — cash was booked when prepaid credit was created.
      // Applying prepaid only moves User.prepaidCredit onto the obligation row.
      prepaidApplied += 1;
    });
  }

  return {
    cycleId: cycle.id,
    periodMonth: startOfLocalDay(periodMonth),
    kinsenaIndex: input.kinsenaIndex,
    dueDate,
    graceDeadline,
    created,
    skippedExisting,
    prepaidApplied,
  };
}

/** Next kinsena after a reference date (for advance open). */
export function nextKinsenaPeriod(from: Date = new Date()): {
  year: number;
  monthIndex: number;
  kinsenaIndex: 1 | 2;
} {
  const start = startOfLocalDay(from);
  const year = start.getFullYear();
  const monthIndex = start.getMonth();
  const mid = getKinsenaDueDate(year, monthIndex, 1);
  if (mid > start) {
    return { year, monthIndex, kinsenaIndex: 1 };
  }
  const end = getKinsenaDueDate(year, monthIndex, 2);
  if (end > start) {
    return { year, monthIndex, kinsenaIndex: 2 };
  }
  const nextMonth = monthIndex === 11 ? 0 : monthIndex + 1;
  const nextYear = monthIndex === 11 ? year + 1 : year;
  return { year: nextYear, monthIndex: nextMonth, kinsenaIndex: 1 };
}

export function currentKinsenaPeriod(from: Date = new Date()): {
  year: number;
  monthIndex: number;
  kinsenaIndex: 1 | 2;
} {
  const start = startOfLocalDay(from);
  const year = start.getFullYear();
  const monthIndex = start.getMonth();
  const day = start.getDate();
  if (day <= 15) {
    return { year, monthIndex, kinsenaIndex: 1 };
  }
  return { year, monthIndex, kinsenaIndex: 2 };
}

function periodSortKey(p: {
  year: number;
  monthIndex: number;
  kinsenaIndex: 1 | 2;
}): number {
  return p.year * 1000 + p.monthIndex * 10 + p.kinsenaIndex;
}

/**
 * All kinsenas from cycle start through `through` inclusive (calendar order).
 */
export function kinsenaPeriodsThrough(params: {
  fromYear: number;
  fromMonthIndex: number;
  through: { year: number; monthIndex: number; kinsenaIndex: 1 | 2 };
}): Array<{ year: number; monthIndex: number; kinsenaIndex: 1 | 2 }> {
  const end = periodSortKey(params.through);
  const out: Array<{ year: number; monthIndex: number; kinsenaIndex: 1 | 2 }> =
    [];
  let y = params.fromYear;
  let m = params.fromMonthIndex;
  for (let i = 0; i < 48; i += 1) {
    for (const k of [1, 2] as const) {
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

/**
 * Opens every kinsena from the cycle start through the next advance period:
 * - all earlier dates in the active year (catch-up / overdue)
 * - both kinsenas of the current month (half-month or full-month pay)
 * - the next kinsena after today (advance)
 */
/** Next calendar kinsena after an existing contribution period. */
export function nextPeriodAfter(params: {
  periodMonth: Date;
  kinsenaIndex: 1 | 2;
}): { year: number; monthIndex: number; kinsenaIndex: 1 | 2 } {
  const year = params.periodMonth.getUTCFullYear();
  const monthIndex = params.periodMonth.getUTCMonth();
  if (params.kinsenaIndex === 1) {
    return { year, monthIndex, kinsenaIndex: 2 };
  }
  if (monthIndex === 11) {
    return { year: year + 1, monthIndex: 0, kinsenaIndex: 1 };
  }
  return { year, monthIndex: monthIndex + 1, kinsenaIndex: 1 };
}

/**
 * Create one contribution row for a single member if missing.
 * Unlike openKinsenaPeriod, does not touch other members (safe for verify path).
 */
async function ensureMemberKinsenaPeriod(params: {
  userId: string;
  cycleId: string;
  year: number;
  monthIndex: number;
  kinsenaIndex: 1 | 2;
}): Promise<boolean> {
  const cycle = await prisma.fundCycle.findUniqueOrThrow({
    where: { id: params.cycleId },
    select: { contributionAmount: true, gracePeriodDays: true },
  });
  const member = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, headsCount: true, prepaidCredit: true },
  });
  if (!member) return false;

  const periodMonth = periodMonthDate(params.year, params.monthIndex);
  const existing = await prisma.contribution.findUnique({
    where: {
      userId_cycleId_periodMonth_kinsenaIndex: {
        userId: params.userId,
        cycleId: params.cycleId,
        periodMonth,
        kinsenaIndex: params.kinsenaIndex,
      },
    },
    select: { id: true },
  });
  if (existing) return false;

  const heads = Math.max(1, member.headsCount);
  const amountDue = calculateKinsenasDue(
    heads,
    cycle.contributionAmount.toString(),
  );
  const dueDate = getKinsenaDueDate(
    params.year,
    params.monthIndex,
    params.kinsenaIndex,
  );
  const graceDeadline = computeGraceDeadline(dueDate, cycle.gracePeriodDays);

  await prisma.$transaction(async (tx) => {
    const row = await tx.contribution.create({
      data: {
        userId: member.id,
        cycleId: params.cycleId,
        periodMonth,
        kinsenaIndex: params.kinsenaIndex,
        headsSnapshot: heads,
        amountDue: new Prisma.Decimal(amountDue.toFixed(2)),
        dueDate,
        graceDeadline,
      },
    });

    const prepaid = toMoney(member.prepaidCredit?.toString() ?? "0");
    if (prepaid.lte(0)) return;

    const allocation = allocateContributionPayment(prepaid, {
      amountDue,
      amountPaid: 0,
      penaltyAmount: 0,
    });
    const applied = toMoney(
      allocation.toPenalty.plus(allocation.toPrincipal),
    );
    if (applied.lte(0)) return;

    const status = contributionStatusAfterPayment(
      { amountDue, amountPaid: 0, penaltyAmount: 0 },
      applied,
      "UNPAID",
    );

    await tx.contribution.update({
      where: { id: row.id },
      data: {
        amountPaid: new Prisma.Decimal(applied.toFixed(2)),
        status,
      },
    });
    await tx.user.update({
      where: { id: member.id },
      data: {
        prepaidCredit: new Prisma.Decimal(prepaid.minus(applied).toFixed(2)),
      },
    });
  });

  return true;
}

async function memberOpenCoverageAsOf(params: {
  userId: string;
  cycleId: string;
  asOf: Date;
}): Promise<Decimal> {
  const openRows = await prisma.contribution.findMany({
    where: {
      userId: params.userId,
      cycleId: params.cycleId,
      status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
    },
    include: {
      cycle: { select: { gracePeriodDays: true, penaltyRate: true } },
    },
  });

  let openTotal = new Decimal(0);
  for (const row of openRows) {
    const waived = row.penaltyWaivedAmount?.toString() ?? "0";
    let penalty = row.penaltyAmount.toString();
    if (!row.penaltyAccrualFrozen) {
      const fee = computeLiveLateFee({
        dueDate: row.dueDate,
        openedAt: row.createdAt,
        headsCount: row.headsSnapshot,
        now: params.asOf,
        gracePeriodDays: row.cycle.gracePeriodDays ?? GRACE_PERIOD_DAYS,
        graceDeadline: row.graceDeadline,
        ratePerHeadPerDay: row.cycle.penaltyRate.toString(),
        pendingSubmittedAt: params.asOf,
      });
      penalty = effectivePenaltyAmount(fee.penaltyAmount, waived).toFixed(2);
    } else {
      penalty = effectivePenaltyAmount(penalty, waived).toFixed(2);
    }
    const dues = remainingContributionDues({
      amountDue: row.amountDue.toString(),
      amountPaid: row.amountPaid.toString(),
      penaltyAmount: penalty,
      penaltyWaivedAmount: 0,
    });
    openTotal = openTotal.plus(dues.totalDue);
  }
  return openTotal;
}

/**
 * Ensures THIS member has open contribution rows that can absorb paymentAmount.
 * Opens only missing periods for that member (never re-opens all members).
 * Leftover beyond cycle end still becomes prepaid at verify.
 */
export async function ensureContributionCoverageForAmount(params: {
  userId: string;
  cycleId: string;
  paymentAmount: Decimal.Value;
  openedById: string;
  asOf?: Date;
}): Promise<{ createdTotal: number }> {
  const asOf = params.asOf ?? new Date();
  const payment = toMoney(params.paymentAmount);
  if (payment.lte(0)) return { createdTotal: 0 };

  const cycle = await prisma.fundCycle.findUniqueOrThrow({
    where: { id: params.cycleId },
  });
  const cycleEndKey = periodSortKey({
    year: cycle.endDate.getUTCFullYear(),
    monthIndex: cycle.endDate.getUTCMonth(),
    kinsenaIndex: 2,
  });

  const through = nextKinsenaPeriod(asOf);
  const lastInCycle = {
    year: cycle.endDate.getUTCFullYear(),
    monthIndex: cycle.endDate.getUTCMonth(),
    kinsenaIndex: 2 as const,
  };
  const cappedThrough =
    periodSortKey(through) <= periodSortKey(lastInCycle)
      ? through
      : lastInCycle;

  let createdTotal = 0;
  const seedPeriods = kinsenaPeriodsThrough({
    fromYear: cycle.startDate.getUTCFullYear(),
    fromMonthIndex: cycle.startDate.getUTCMonth(),
    through: cappedThrough,
  });
  for (const period of seedPeriods) {
    const created = await ensureMemberKinsenaPeriod({
      userId: params.userId,
      cycleId: params.cycleId,
      ...period,
    });
    if (created) createdTotal += 1;
  }

  for (let i = 0; i < 24; i += 1) {
    const openTotal = await memberOpenCoverageAsOf({
      userId: params.userId,
      cycleId: params.cycleId,
      asOf,
    });
    if (payment.lte(openTotal)) break;

    const latest = await prisma.contribution.findFirst({
      where: { userId: params.userId, cycleId: params.cycleId },
      orderBy: [{ dueDate: "desc" }, { kinsenaIndex: "desc" }],
      select: { periodMonth: true, kinsenaIndex: true },
    });
    if (!latest) break;

    const next = nextPeriodAfter({
      periodMonth: latest.periodMonth,
      kinsenaIndex: latest.kinsenaIndex as 1 | 2,
    });
    if (periodSortKey(next) > cycleEndKey) break;

    const created = await ensureMemberKinsenaPeriod({
      userId: params.userId,
      cycleId: params.cycleId,
      ...next,
    });
    if (created) {
      createdTotal += 1;
      continue;
    }
    // Already exists (likely PAID) — cannot extend coverage further this way.
    break;
  }

  return { createdTotal };
}

export async function openPayableContributionWindow(params: {
  openedById?: string;
  cycleId?: string;
  asOf?: Date;
}): Promise<{
  results: OpenKinsenaResult[];
  createdTotal: number;
}> {
  const asOf = params.asOf ?? new Date();
  const cycle =
    params.cycleId != null
      ? await prisma.fundCycle.findUniqueOrThrow({ where: { id: params.cycleId } })
      : await prisma.fundCycle.findFirst({ where: { isActive: true } });

  if (!cycle) {
    throw new Error(
      "No active fund cycle. Activate a cycle before opening kinsenas.",
    );
  }

  // FundCycle dates are @db.Date (UTC midnight) — use UTC parts to avoid
  // shifting Jan 1 → Dec 31 in positive-offset timezones.
  const fromYear = cycle.startDate.getUTCFullYear();
  const fromMonthIndex = cycle.startDate.getUTCMonth();
  const through = nextKinsenaPeriod(asOf);
  const lastInCycle = {
    year: cycle.endDate.getUTCFullYear(),
    monthIndex: cycle.endDate.getUTCMonth(),
    kinsenaIndex: 2 as const,
  };
  const cappedThrough =
    periodSortKey(through) <= periodSortKey(lastInCycle)
      ? through
      : lastInCycle;

  const unique = kinsenaPeriodsThrough({
    fromYear,
    fromMonthIndex,
    through: cappedThrough,
  });

  const results: OpenKinsenaResult[] = [];
  let createdTotal = 0;
  for (const period of unique) {
    const result = await openKinsenaPeriod({
      ...period,
      cycleId: cycle.id,
      openedById: params.openedById,
    });
    results.push(result);
    createdTotal += result.created;
  }

  return { results, createdTotal };
}

/**
 * Daily / scheduled auto-open: when a kinsena due day arrives (15th or EOM),
 * `nextKinsenaPeriod` advances and the successor period is created for all
 * active members. Idempotent — skips rows that already exist. No-ops when
 * there is no active fund cycle.
 */
export async function autoOpenScheduledKinsenas(params?: {
  asOf?: Date;
  openedById?: string;
}): Promise<{
  opened: boolean;
  createdTotal: number;
  through: { year: number; monthIndex: number; kinsenaIndex: 1 | 2 } | null;
}> {
  const asOf = params?.asOf ?? new Date();
  const cycle = await prisma.fundCycle.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  if (!cycle) {
    return { opened: false, createdTotal: 0, through: null };
  }

  const through = nextKinsenaPeriod(asOf);
  const { createdTotal } = await openPayableContributionWindow({
    cycleId: cycle.id,
    asOf,
    openedById: params?.openedById,
  });

  return { opened: true, createdTotal, through };
}
