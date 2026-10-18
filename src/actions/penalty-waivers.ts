"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { Decimal } from "decimal.js";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireAppUser } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import {
  addCalendarDays,
  computeLiveLateFee,
  dateOnlyUTC,
  effectivePenaltyAmount,
  GRACE_PERIOD_DAYS,
  type RejectedPenaltyWindow,
} from "@/lib/finance/cpe-policy";
import { toMoney } from "@/lib/finance/loan-calculator";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const targetSchema = z.object({
  targetType: z.enum(["CONTRIBUTION", "LOAN_AMORTIZATION"]),
  targetId: z.string().min(1),
});

const reasonSchema = z.string().trim().min(3, "Reason is required (min 3 chars).");

const singleSchema = targetSchema.extend({ reason: reasonSchema });
const bulkSchema = z.object({
  targets: z.array(targetSchema).min(1),
  reason: reasonSchema,
});
const allSchema = z.object({
  reason: reasonSchema,
  includeContributions: z.boolean().default(true),
  includeLoans: z.boolean().default(true),
});

const periodRefSchema = z.object({
  /** ISO date for first calendar day of the month (UTC). */
  periodMonth: z.string().min(1),
  kinsenaIndex: z.union([z.literal(1), z.literal(2)]),
});

const periodSchema = z
  .object({
    /** When true, apply to every open kinsenas period. */
    allPeriods: z.boolean().default(false),
    /** Used when allPeriods is false — at least one required. */
    periods: z.array(periodRefSchema).default([]),
    /** Empty / omitted = all members with obligations in the period(s). */
    memberIds: z.array(z.string().min(1)).optional(),
    reason: reasonSchema,
    includeLoans: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (!data.allPeriods && data.periods.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select at least one kinsenas period, or choose All periods.",
        path: ["periods"],
      });
    }
  });

const extendGraceSchema = z
  .object({
    allPeriods: z.boolean().default(false),
    periods: z.array(periodRefSchema).default([]),
    memberIds: z.array(z.string().min(1)).optional(),
    extraDays: z.number().int().min(1).max(30),
    reason: reasonSchema,
    includeLoans: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (!data.allPeriods && data.periods.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select at least one kinsenas period, or choose All periods.",
        path: ["periods"],
      });
    }
  });

function kinsenaDueDate(periodMonth: Date, kinsenaIndex: 1 | 2): Date {
  const y = periodMonth.getUTCFullYear();
  const m = periodMonth.getUTCMonth();
  if (kinsenaIndex === 1) return dateOnlyUTC(y, m, 15);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return dateOnlyUTC(y, m, Math.min(30, last));
}

function resolvePeriodFilters(input: {
  allPeriods: boolean;
  periods: Array<{ periodMonth: string; kinsenaIndex: 1 | 2 }>;
}): Array<{ periodMonth: Date; kinsenaIndex: 1 | 2 }> | null {
  if (input.allPeriods) return null;
  return input.periods.map((p) => ({
    periodMonth: parsePeriodMonth(p.periodMonth),
    kinsenaIndex: p.kinsenaIndex,
  }));
}

export type WaiveResult = {
  waived: number;
  skipped: number;
  batchId: string;
  totalWaived: string;
};

export type ExtendGraceResult = {
  updated: number;
  skipped: number;
  extraDays: number;
};

type SubmissionWindowRow = {
  status: string;
  createdAt: Date;
  verifiedAt: Date | null;
};

function splitSubmissionWindows(
  submissions: ReadonlyArray<SubmissionWindowRow>,
): {
  pendingSubmittedAt: Date | null;
  rejectedWindows: RejectedPenaltyWindow[];
} {
  let pendingSubmittedAt: Date | null = null;
  const rejectedWindows: RejectedPenaltyWindow[] = [];
  for (const sub of submissions) {
    if (sub.status === "PENDING_VERIFICATION") {
      pendingSubmittedAt ??= sub.createdAt;
    } else if (sub.status === "REJECTED" && sub.verifiedAt) {
      rejectedWindows.push({
        submittedAt: sub.createdAt,
        rejectedAt: sub.verifiedAt,
      });
    }
  }
  return { pendingSubmittedAt, rejectedWindows };
}

function parsePeriodMonth(iso: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid period month.");
  }
  return dateOnlyUTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

async function assertNoAuditedPayment(
  tx: Prisma.TransactionClient,
  contributionId: string | null,
  loanAmortizationId: string | null,
): Promise<void> {
  const audited = await tx.paymentSubmission.findFirst({
    where: {
      status: "AUDITED",
      ...(contributionId ? { contributionId } : {}),
      ...(loanAmortizationId ? { loanAmortizationId } : {}),
    },
    select: { id: true },
  });
  if (audited) {
    throw new Error("Cannot waive fees on an audited obligation.");
  }
}

async function assertPenaltyNotCollected(
  tx: Prisma.TransactionClient,
  contributionId: string | null,
  loanAmortizationId: string | null,
): Promise<void> {
  const collected = await tx.ledgerEntry.findFirst({
    where: {
      entryType: "PENALTY_INCOME_IN",
      paymentSubmission: {
        ...(contributionId ? { contributionId } : {}),
        ...(loanAmortizationId ? { loanAmortizationId } : {}),
      },
    },
    select: { id: true },
  });
  if (collected) {
    throw new Error(
      "Late fee already collected on a verified payment; use audit reverse instead.",
    );
  }
}

/**
 * Waive the live outstanding late fee (not just stored penaltyAmount).
 * Syncs stored amount from Rule #3 before freezing so passes match the UI.
 */
async function waiveOne(
  tx: Prisma.TransactionClient,
  params: {
    targetType: "CONTRIBUTION" | "LOAN_AMORTIZATION";
    targetId: string;
    reason: string;
    scope: "SINGLE" | "BULK" | "ALL";
    batchId: string;
    issuedById: string;
    now?: Date;
  },
): Promise<{ waived: boolean; amount: Decimal }> {
  const now = params.now ?? new Date();

  if (params.targetType === "CONTRIBUTION") {
    const row = await tx.contribution.findUnique({
      where: { id: params.targetId },
      include: {
        cycle: { select: { gracePeriodDays: true, penaltyRate: true } },
        paymentSubmissions: {
          where: { status: { in: ["PENDING_VERIFICATION", "REJECTED"] } },
          orderBy: { createdAt: "asc" },
          select: { status: true, createdAt: true, verifiedAt: true },
        },
      },
    });
    if (!row || row.penaltyAccrualFrozen) {
      return { waived: false, amount: new Decimal(0) };
    }

    const { pendingSubmittedAt, rejectedWindows } = splitSubmissionWindows(
      row.paymentSubmissions,
    );
    const fee = computeLiveLateFee({
      dueDate: row.dueDate,
      openedAt: row.createdAt,
      headsCount: row.headsSnapshot,
      now,
      gracePeriodDays: row.cycle.gracePeriodDays ?? GRACE_PERIOD_DAYS,
      graceDeadline: row.graceDeadline,
      ratePerHeadPerDay: row.cycle.penaltyRate.toString(),
      pendingSubmittedAt,
      rejectedWindows,
    });
    const effective = effectivePenaltyAmount(
      fee.penaltyAmount,
      row.penaltyWaivedAmount?.toString() ?? "0",
    );
    if (effective.lte(0)) {
      return { waived: false, amount: new Decimal(0) };
    }

    await Promise.all([
      assertNoAuditedPayment(tx, row.id, null),
      assertPenaltyNotCollected(tx, row.id, null),
    ]);

    await tx.contribution.update({
      where: { id: row.id },
      data: {
        penaltyWaivedAmount: new Prisma.Decimal(
          toMoney(row.penaltyWaivedAmount?.toString() ?? "0")
            .plus(effective)
            .toFixed(2),
        ),
        penaltyAmount: new Prisma.Decimal(0),
        penaltyAccrualFrozen: true,
        daysDelayed: fee.chargeableDays,
      },
    });

    await tx.penaltyWaiver.create({
      data: {
        cycleId: row.cycleId,
        targetType: "CONTRIBUTION",
        contributionId: row.id,
        amountWaived: new Prisma.Decimal(effective.toFixed(2)),
        reason: params.reason,
        scope: params.scope,
        batchId: params.batchId,
        issuedById: params.issuedById,
      },
    });

    return { waived: true, amount: effective };
  }

  const row = await tx.loanAmortization.findUnique({
    where: { id: params.targetId },
    include: {
      loan: {
        select: {
          cycleId: true,
          headsSnapshot: true,
          cycle: { select: { gracePeriodDays: true, penaltyRate: true } },
        },
      },
      paymentSubmissions: {
        where: { status: { in: ["PENDING_VERIFICATION", "REJECTED"] } },
        orderBy: { createdAt: "asc" },
        select: { status: true, createdAt: true, verifiedAt: true },
      },
    },
  });
  if (!row || row.penaltyAccrualFrozen) {
    return { waived: false, amount: new Decimal(0) };
  }

  const heads = row.headsSnapshot || row.loan.headsSnapshot;
  const { pendingSubmittedAt, rejectedWindows } = splitSubmissionWindows(
    row.paymentSubmissions,
  );
  const fee = computeLiveLateFee({
    dueDate: row.dueDate,
    openedAt: row.createdAt,
    headsCount: heads,
    now,
    gracePeriodDays: row.loan.cycle.gracePeriodDays ?? GRACE_PERIOD_DAYS,
    graceDeadline: row.graceDeadline,
    ratePerHeadPerDay: row.loan.cycle.penaltyRate.toString(),
    pendingSubmittedAt,
    rejectedWindows,
  });
  const effective = effectivePenaltyAmount(
    fee.penaltyAmount,
    row.penaltyWaivedAmount?.toString() ?? "0",
  );
  if (effective.lte(0)) {
    return { waived: false, amount: new Decimal(0) };
  }

  await Promise.all([
    assertNoAuditedPayment(tx, null, row.id),
    assertPenaltyNotCollected(tx, null, row.id),
  ]);

  await tx.loanAmortization.update({
    where: { id: row.id },
    data: {
      penaltyWaivedAmount: new Prisma.Decimal(
        toMoney(row.penaltyWaivedAmount?.toString() ?? "0")
          .plus(effective)
          .toFixed(2),
      ),
      penaltyAmount: new Prisma.Decimal(0),
      penaltyAccrualFrozen: true,
      daysDelayed: fee.chargeableDays,
    },
  });

  await tx.penaltyWaiver.create({
    data: {
      cycleId: row.loan.cycleId,
      targetType: "LOAN_AMORTIZATION",
      loanAmortizationId: row.id,
      amountWaived: new Prisma.Decimal(effective.toFixed(2)),
      reason: params.reason,
      scope: params.scope,
      batchId: params.batchId,
      issuedById: params.issuedById,
    },
  });

  return { waived: true, amount: effective };
}

/** Interactive tx options — bulk passes can exceed Prisma’s 5s default. */
const WAIVE_TX = { maxWait: 10_000, timeout: 20_000 } as const;
const BATCH_TX = { maxWait: 10_000, timeout: 60_000 } as const;

function revalidatePassPaths() {
  revalidatePath("/passes");
  revalidatePath("/verify");
  revalidatePath("/pay");
  revalidatePath("/dashboard");
  revalidatePath("/audit");
}

async function collectOpenTargets(opts: {
  includeContributions: boolean;
  includeLoans: boolean;
  /** null = all open periods; array = specific kinsenas periods. */
  periods?: Array<{ periodMonth: Date; kinsenaIndex: 1 | 2 }> | null;
  memberIds?: string[];
  now?: Date;
}): Promise<z.infer<typeof targetSchema>[]> {
  const now = opts.now ?? new Date();
  const memberFilter =
    opts.memberIds && opts.memberIds.length > 0
      ? { in: opts.memberIds }
      : undefined;
  const periodList = opts.periods ?? null;
  const targets: z.infer<typeof targetSchema>[] = [];

  const contributionPeriodWhere =
    periodList == null
      ? {}
      : periodList.length === 1
        ? {
            periodMonth: periodList[0]!.periodMonth,
            kinsenaIndex: periodList[0]!.kinsenaIndex,
          }
        : {
            OR: periodList.map((p) => ({
              periodMonth: p.periodMonth,
              kinsenaIndex: p.kinsenaIndex,
            })),
          };

  if (opts.includeContributions) {
    const rows = await prisma.contribution.findMany({
      where: {
        status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
        penaltyAccrualFrozen: false,
        ...contributionPeriodWhere,
        ...(memberFilter ? { userId: memberFilter } : {}),
      },
      include: {
        cycle: { select: { gracePeriodDays: true, penaltyRate: true } },
        paymentSubmissions: {
          where: { status: { in: ["PENDING_VERIFICATION", "REJECTED"] } },
          orderBy: { createdAt: "asc" },
          select: { status: true, createdAt: true, verifiedAt: true },
        },
      },
    });

    for (const row of rows) {
      const { pendingSubmittedAt, rejectedWindows } = splitSubmissionWindows(
        row.paymentSubmissions,
      );
      const fee = computeLiveLateFee({
        dueDate: row.dueDate,
        openedAt: row.createdAt,
        headsCount: row.headsSnapshot,
        now,
        gracePeriodDays: row.cycle.gracePeriodDays ?? GRACE_PERIOD_DAYS,
        graceDeadline: row.graceDeadline,
        ratePerHeadPerDay: row.cycle.penaltyRate.toString(),
        pendingSubmittedAt,
        rejectedWindows,
      });
      const outstanding = effectivePenaltyAmount(
        fee.penaltyAmount,
        row.penaltyWaivedAmount?.toString() ?? "0",
      );
      if (outstanding.gt(0)) {
        targets.push({ targetType: "CONTRIBUTION", targetId: row.id });
      }
    }
  }

  if (opts.includeLoans) {
    const dueDates =
      periodList == null
        ? null
        : periodList.map((p) => kinsenaDueDate(p.periodMonth, p.kinsenaIndex));
    const dueDateFilter =
      dueDates == null
        ? {}
        : dueDates.length === 1
          ? { dueDate: dueDates[0]! }
          : { dueDate: { in: dueDates } };

    const rows = await prisma.loanAmortization.findMany({
      where: {
        status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
        penaltyAccrualFrozen: false,
        ...dueDateFilter,
        ...(memberFilter ? { loan: { borrowerId: memberFilter } } : {}),
      },
      include: {
        loan: {
          select: {
            headsSnapshot: true,
            cycle: { select: { gracePeriodDays: true, penaltyRate: true } },
          },
        },
        paymentSubmissions: {
          where: { status: { in: ["PENDING_VERIFICATION", "REJECTED"] } },
          orderBy: { createdAt: "asc" },
          select: { status: true, createdAt: true, verifiedAt: true },
        },
      },
    });

    for (const row of rows) {
      const heads = row.headsSnapshot || row.loan.headsSnapshot;
      const { pendingSubmittedAt, rejectedWindows } = splitSubmissionWindows(
        row.paymentSubmissions,
      );
      const fee = computeLiveLateFee({
        dueDate: row.dueDate,
        openedAt: row.createdAt,
        headsCount: heads,
        now,
        gracePeriodDays: row.loan.cycle.gracePeriodDays ?? GRACE_PERIOD_DAYS,
        graceDeadline: row.graceDeadline,
        ratePerHeadPerDay: row.loan.cycle.penaltyRate.toString(),
        pendingSubmittedAt,
        rejectedWindows,
      });
      const outstanding = effectivePenaltyAmount(
        fee.penaltyAmount,
        row.penaltyWaivedAmount?.toString() ?? "0",
      );
      if (outstanding.gt(0)) {
        targets.push({ targetType: "LOAN_AMORTIZATION", targetId: row.id });
      }
    }
  }

  return targets;
}

async function runWaiveBatch(
  targets: z.infer<typeof targetSchema>[],
  reason: string,
  scope: "SINGLE" | "BULK" | "ALL",
  issuedById: string,
): Promise<WaiveResult> {
  const batchId = randomUUID();
  let waived = 0;
  let skipped = 0;
  let total = new Decimal(0);
  const now = new Date();

  // One short transaction per target — avoids a single interactive tx that
  // stacks N×(read+assert+write) past Prisma’s default 5s timeout.
  for (const target of targets) {
    try {
      const one = await prisma.$transaction(
        (tx) =>
          waiveOne(tx, {
            ...target,
            reason,
            scope,
            batchId,
            issuedById,
            now,
          }),
        WAIVE_TX,
      );
      if (one.waived) {
        waived += 1;
        total = total.plus(one.amount);
      } else {
        skipped += 1;
      }
    } catch {
      skipped += 1;
    }
  }

  return {
    waived,
    skipped,
    batchId,
    totalWaived: total.toFixed(2),
  };
}

export async function waivePenaltySingle(
  input: z.infer<typeof singleSchema>,
): Promise<ActionResult<WaiveResult>> {
  try {
    const actor = await requireAppUser(["TREASURER", "AUDITOR"]);
    const parsed = singleSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
    }

    const batchId = randomUUID();
    const result = await prisma.$transaction(async (tx) => {
      const one = await waiveOne(tx, {
        ...parsed.data,
        scope: "SINGLE",
        batchId,
        issuedById: actor.id,
      });
      return {
        waived: one.waived ? 1 : 0,
        skipped: one.waived ? 0 : 1,
        batchId,
        totalWaived: one.amount.toFixed(2),
      };
    }, WAIVE_TX);

    revalidatePassPaths();
    return ok(
      result,
      result.waived
        ? `Pass granted · ₱${result.totalWaived} waived.`
        : "Nothing to waive (already passed or zero fee).",
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to grant pass.");
  }
}

export async function waivePenaltyBulk(
  input: z.infer<typeof bulkSchema>,
): Promise<ActionResult<WaiveResult>> {
  try {
    const actor = await requireAppUser(["TREASURER", "AUDITOR"]);
    const parsed = bulkSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
    }

    const result = await runWaiveBatch(
      parsed.data.targets,
      parsed.data.reason,
      "BULK",
      actor.id,
    );

    revalidatePassPaths();
    return ok(
      result,
      result.waived
        ? `Pass granted on ${result.waived} obligation(s) · ₱${result.totalWaived}.`
        : "Nothing to waive (already passed or zero fee).",
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to grant bulk pass.");
  }
}

export async function waivePenaltyAll(
  input: z.infer<typeof allSchema>,
): Promise<ActionResult<WaiveResult>> {
  try {
    const actor = await requireAppUser(["TREASURER", "AUDITOR"]);
    const parsed = allSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
    }

    const targets = await collectOpenTargets({
      includeContributions: parsed.data.includeContributions,
      includeLoans: parsed.data.includeLoans,
    });

    if (targets.length === 0) {
      return ok(
        { waived: 0, skipped: 0, batchId: "", totalWaived: "0.00" },
        "No open late fees to waive.",
      );
    }

    const result = await runWaiveBatch(
      targets,
      parsed.data.reason,
      "ALL",
      actor.id,
    );

    revalidatePassPaths();
    return ok(
      result,
      `Pass all: ${result.waived} waived · ₱${result.totalWaived}.`,
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to grant pass-all.");
  }
}

/** Waive live late fees for one or more kinsenas periods (all or selected members). */
export async function waivePenaltyForPeriod(
  input: z.infer<typeof periodSchema>,
): Promise<ActionResult<WaiveResult>> {
  try {
    const actor = await requireAppUser(["TREASURER", "AUDITOR"]);
    const parsed = periodSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
    }

    const periods = resolvePeriodFilters(parsed.data);
    const targets = await collectOpenTargets({
      includeContributions: true,
      includeLoans: parsed.data.includeLoans,
      periods,
      memberIds: parsed.data.memberIds,
    });

    if (targets.length === 0) {
      return ok(
        { waived: 0, skipped: 0, batchId: "", totalWaived: "0.00" },
        "No open late fees in the selected period(s) for those members.",
      );
    }

    const result = await runWaiveBatch(
      targets,
      parsed.data.reason,
      "BULK",
      actor.id,
    );

    revalidatePassPaths();
    return ok(
      result,
      result.waived
        ? `Period pass: ${result.waived} waived · ₱${result.totalWaived}.`
        : "Nothing to waive in the selected period(s).",
    );
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Failed to waive period fees.",
    );
  }
}

/**
 * Push graceDeadline forward by N days for one or more kinsenas periods.
 * Recalculates stored late fees from the new grace end — does not freeze accrual.
 */
export async function extendGraceForPeriod(
  input: z.infer<typeof extendGraceSchema>,
): Promise<ActionResult<ExtendGraceResult>> {
  try {
    await requireAppUser(["TREASURER", "AUDITOR"]);
    const parsed = extendGraceSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
    }

    const periodList = resolvePeriodFilters(parsed.data);
    const memberFilter =
      parsed.data.memberIds && parsed.data.memberIds.length > 0
        ? { in: parsed.data.memberIds }
        : undefined;
    const extraDays = parsed.data.extraDays;
    const now = new Date();

    const contributionPeriodWhere =
      periodList == null
        ? {}
        : periodList.length === 1
          ? {
              periodMonth: periodList[0]!.periodMonth,
              kinsenaIndex: periodList[0]!.kinsenaIndex,
            }
          : {
              OR: periodList.map((p) => ({
                periodMonth: p.periodMonth,
                kinsenaIndex: p.kinsenaIndex,
              })),
            };

    const dueDates =
      periodList == null
        ? null
        : periodList.map((p) => kinsenaDueDate(p.periodMonth, p.kinsenaIndex));
    const dueDateFilter =
      dueDates == null
        ? {}
        : dueDates.length === 1
          ? { dueDate: dueDates[0]! }
          : { dueDate: { in: dueDates } };

    let updated = 0;
    let skipped = 0;

    await prisma.$transaction(
      async (tx) => {
        const contributions = await tx.contribution.findMany({
          where: {
            ...contributionPeriodWhere,
            status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
            ...(memberFilter ? { userId: memberFilter } : {}),
          },
          include: {
            cycle: { select: { gracePeriodDays: true, penaltyRate: true } },
            paymentSubmissions: {
              where: { status: { in: ["PENDING_VERIFICATION", "REJECTED"] } },
              orderBy: { createdAt: "asc" },
              select: { status: true, createdAt: true, verifiedAt: true },
            },
          },
        });

        for (const row of contributions) {
          if (row.penaltyAccrualFrozen) {
            skipped += 1;
            continue;
          }
          const newGrace = addCalendarDays(row.graceDeadline, extraDays);
          const { pendingSubmittedAt, rejectedWindows } =
            splitSubmissionWindows(row.paymentSubmissions);
          const fee = computeLiveLateFee({
            dueDate: row.dueDate,
            openedAt: row.createdAt,
            headsCount: row.headsSnapshot,
            now,
            gracePeriodDays: row.cycle.gracePeriodDays ?? GRACE_PERIOD_DAYS,
            graceDeadline: newGrace,
            ratePerHeadPerDay: row.cycle.penaltyRate.toString(),
            pendingSubmittedAt,
            rejectedWindows,
          });
          const paid = Number(row.amountPaid.toString());
          const nextStatus =
            fee.chargeableDays > 0
              ? "OVERDUE"
              : paid > 0
                ? "PARTIAL"
                : "UNPAID";

          await tx.contribution.update({
            where: { id: row.id },
            data: {
              graceDeadline: newGrace,
              daysDelayed: fee.chargeableDays,
              penaltyAmount: new Prisma.Decimal(fee.penaltyAmount.toFixed(2)),
              status: nextStatus,
            },
          });
          updated += 1;
        }

        if (parsed.data.includeLoans) {
          const amortizations = await tx.loanAmortization.findMany({
            where: {
              ...dueDateFilter,
              status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
              ...(memberFilter
                ? { loan: { borrowerId: memberFilter } }
                : {}),
            },
            include: {
              loan: {
                select: {
                  headsSnapshot: true,
                  cycle: {
                    select: { gracePeriodDays: true, penaltyRate: true },
                  },
                },
              },
              paymentSubmissions: {
                where: {
                  status: { in: ["PENDING_VERIFICATION", "REJECTED"] },
                },
                orderBy: { createdAt: "asc" },
                select: { status: true, createdAt: true, verifiedAt: true },
              },
            },
          });

          for (const row of amortizations) {
            if (row.penaltyAccrualFrozen) {
              skipped += 1;
              continue;
            }
            const newGrace = addCalendarDays(row.graceDeadline, extraDays);
            const heads = row.headsSnapshot || row.loan.headsSnapshot;
            const { pendingSubmittedAt, rejectedWindows } =
              splitSubmissionWindows(row.paymentSubmissions);
            const fee = computeLiveLateFee({
              dueDate: row.dueDate,
              openedAt: row.createdAt,
              headsCount: heads,
              now,
              gracePeriodDays:
                row.loan.cycle.gracePeriodDays ?? GRACE_PERIOD_DAYS,
              graceDeadline: newGrace,
              ratePerHeadPerDay: row.loan.cycle.penaltyRate.toString(),
              pendingSubmittedAt,
              rejectedWindows,
            });
            const paid = Number(row.amountPaid.toString());
            const nextStatus =
              fee.chargeableDays > 0
                ? "OVERDUE"
                : paid > 0
                  ? "PARTIAL"
                  : "UNPAID";

            await tx.loanAmortization.update({
              where: { id: row.id },
              data: {
                graceDeadline: newGrace,
                daysDelayed: fee.chargeableDays,
                penaltyAmount: new Prisma.Decimal(
                  fee.penaltyAmount.toFixed(2),
                ),
                status: nextStatus,
              },
            });
            updated += 1;
          }
        }
      },
      BATCH_TX,
    );

    revalidatePassPaths();
    return ok(
      { updated, skipped, extraDays },
      updated
        ? `Grace extended +${extraDays} day(s) on ${updated} obligation(s).`
        : "No open obligations found for the selected period(s).",
    );
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Failed to extend grace.",
    );
  }
}
