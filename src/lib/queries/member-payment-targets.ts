import { Decimal } from "decimal.js";
import { prisma } from "@/lib/db";
import { remainingDues, formatPHP } from "@/lib/finance/loan-calculator";
import {
  calculateKinsenasDue,
  computeLiveLateFee,
  effectivePenaltyAmount,
  formatKinsenaDueLabel,
  formatKinsenaMonthLabel,
  formatLateFeeBreakdown,
  GRACE_PERIOD_DAYS,
  startOfLocalDay,
  type RejectedPenaltyWindow,
} from "@/lib/finance/cpe-policy";
import { remainingContributionDues } from "@/lib/finance/payment-allocation";

export type PaymentTargetOption = {
  id: string;
  targetType: "CONTRIBUTION" | "LOAN_AMORTIZATION";
  /** Short select label, e.g. "15 Jan 2026 · ₱1,750". */
  label: string;
  /** Month group for <optgroup>, e.g. "January 2026". Null for loans. */
  monthGroup: string | null;
  /** Remaining base contribution / installment (no late fee). */
  baseRemaining: string;
  /** Late fee included in suggestedAmount. */
  penaltyAmount: string;
  /** Remaining for this obligation (base + late fee). */
  suggestedAmount: string;
  /**
   * Base remaining for this obligation plus later open contributions in the
   * same calendar month (full-month pay hint, base only).
   */
  monthlySuggestedAmount: string;
  /** Full month including live late fees on those periods. */
  monthlyTotalSuggestedAmount: string;
  cycleId: string;
  dueDate: string;
  graceDeadline: string;
  headsSnapshot: number;
  /** Policy kinsenas amount = per-head × heads (contribution only). */
  kinsenasDue: string;
  daysDelayed: number;
  lateFeeBreakdown: string;
  status: string;
  isWithinGrace: boolean;
  isOverdue: boolean;
  isAdvance: boolean;
  /** Opened after policy grace elapsed — not “In grace”. */
  isCatchUp: boolean;
  penaltyAccrualFrozen: boolean;
  /** YYYY-MM of contribution period (contributions only). */
  periodKey: string | null;
  kinsenaIndex: 1 | 2 | null;
  /** Cycle penalty rate for UI copy (₱ / head / day). */
  penaltyRatePerHeadPerDay: string;
};

function splitWindows(
  submissions: ReadonlyArray<{
    status: string;
    createdAt: Date;
    verifiedAt: Date | null;
  }>,
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

/**
 * Open contribution periods and unpaid loan installments for the member upload form.
 * Includes future-dated UNPAID rows (advance). Live late fees freeze at PENDING
 * submission createdAt; waived/frozen penalties show as zero.
 *
 * Catch-up rows opened after their calendar grace already passed accrue late fees
 * from the open/create day — not from the historical due date.
 */
export async function getMemberPaymentTargets(
  userId: string,
): Promise<PaymentTargetOption[]> {
  const now = new Date();
  const today = startOfLocalDay(now);

  const [contributions, amortizations] = await Promise.all([
    prisma.contribution.findMany({
      where: {
        userId,
        status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
      },
      orderBy: { dueDate: "asc" },
      include: {
        cycle: {
          select: {
            id: true,
            name: true,
            gracePeriodDays: true,
            penaltyRate: true,
            contributionAmount: true,
          },
        },
        paymentSubmissions: {
          where: { status: { in: ["PENDING_VERIFICATION", "REJECTED"] } },
          orderBy: { createdAt: "asc" },
          select: { status: true, createdAt: true, verifiedAt: true },
        },
      },
    }),
    prisma.loanAmortization.findMany({
      where: {
        loan: { borrowerId: userId, status: { in: ["ACTIVE", "APPROVED"] } },
        status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
      },
      orderBy: { dueDate: "asc" },
      include: {
        loan: {
          select: {
            id: true,
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
    }),
  ]);

  const options: PaymentTargetOption[] = [];
  const contribRows: Array<{
    id: string;
    periodKey: string;
    baseRemaining: Decimal;
    totalSuggested: Decimal;
    option: Omit<
      PaymentTargetOption,
      "monthlySuggestedAmount" | "monthlyTotalSuggestedAmount"
    >;
  }> = [];

  for (const c of contributions) {
    const graceDays = c.cycle.gracePeriodDays ?? GRACE_PERIOD_DAYS;
    const rate = c.cycle.penaltyRate.toString();
    const { pendingSubmittedAt, rejectedWindows } = splitWindows(
      c.paymentSubmissions,
    );
    const fee = computeLiveLateFee({
      dueDate: c.dueDate,
      openedAt: c.createdAt,
      headsCount: c.headsSnapshot,
      now,
      gracePeriodDays: graceDays,
      ratePerHeadPerDay: rate,
      pendingSubmittedAt,
      rejectedWindows,
    });
    const rawPenalty = c.penaltyAccrualFrozen
      ? new Decimal(c.penaltyAmount.toString())
      : fee.penaltyAmount;
    const penalty = effectivePenaltyAmount(
      rawPenalty,
      c.penaltyWaivedAmount?.toString() ?? "0",
    );
    const dues = remainingContributionDues({
      amountDue: c.amountDue.toString(),
      amountPaid: c.amountPaid.toString(),
      penaltyAmount: penalty,
      penaltyWaivedAmount: 0,
    });
    const baseRemaining = dues.principalDue;
    const totalSuggested = dues.totalDue;
    const isAdvance = startOfLocalDay(c.dueDate) > today;
    const periodKey = `${c.periodMonth.getUTCFullYear()}-${String(c.periodMonth.getUTCMonth() + 1).padStart(2, "0")}`;
    const dueLabel = formatKinsenaDueLabel(c.dueDate);
    const statusTag = isAdvance
      ? "Advance"
      : fee.isOverdue && !c.penaltyAccrualFrozen
        ? "Overdue"
        : fee.isCatchUp
          ? "Catch-up"
          : fee.isWithinGrace
            ? "In grace"
            : "Open";

    contribRows.push({
      id: c.id,
      periodKey,
      baseRemaining,
      totalSuggested,
      option: {
        id: c.id,
        targetType: "CONTRIBUTION",
        label: `${dueLabel} · ${formatPHP(baseRemaining)}`,
        monthGroup: formatKinsenaMonthLabel(c.dueDate),
        baseRemaining: baseRemaining.toFixed(2),
        penaltyAmount: penalty.toFixed(2),
        suggestedAmount: totalSuggested.toFixed(2),
        cycleId: c.cycleId,
        dueDate: c.dueDate.toISOString(),
        graceDeadline: c.graceDeadline.toISOString(),
        headsSnapshot: c.headsSnapshot,
        kinsenasDue: calculateKinsenasDue(
          c.headsSnapshot,
          c.cycle.contributionAmount.toString(),
        ).toFixed(2),
        daysDelayed: c.penaltyAccrualFrozen ? c.daysDelayed : fee.chargeableDays,
        lateFeeBreakdown: c.penaltyAccrualFrozen
          ? "Pass granted — late fee frozen."
          : fee.isCatchUp && fee.chargeableDays === 0
            ? `Catch-up period · opened ${formatKinsenaDueLabel(c.createdAt)}. Late fees start after ${fee.gracePeriodDays} days from open — not from the original due date.`
            : formatLateFeeBreakdown(fee),
        status: statusTag,
        isWithinGrace: fee.isWithinGrace,
        isOverdue: fee.isOverdue && !Boolean(c.penaltyAccrualFrozen),
        isAdvance,
        isCatchUp: fee.isCatchUp,
        penaltyAccrualFrozen: Boolean(c.penaltyAccrualFrozen),
        periodKey,
        kinsenaIndex: c.kinsenaIndex === 1 ? 1 : 2,
        penaltyRatePerHeadPerDay: rate,
      },
    });
  }

  for (const row of contribRows) {
    const sameMonthLater = contribRows.filter(
      (other) =>
        other.periodKey === row.periodKey &&
        other.option.dueDate >= row.option.dueDate,
    );
    const monthlyBase = sameMonthLater.reduce(
      (sum, other) => sum.plus(other.baseRemaining),
      new Decimal(0),
    );
    const monthlyTotal = sameMonthLater.reduce(
      (sum, other) => sum.plus(other.totalSuggested),
      new Decimal(0),
    );
    options.push({
      ...row.option,
      monthlySuggestedAmount: monthlyBase.toFixed(2),
      monthlyTotalSuggestedAmount: monthlyTotal.toFixed(2),
    });
  }

  for (const a of amortizations) {
    const heads = a.headsSnapshot || a.loan.headsSnapshot;
    const graceDays = a.loan.cycle.gracePeriodDays ?? GRACE_PERIOD_DAYS;
    const rate = a.loan.cycle.penaltyRate.toString();
    const { pendingSubmittedAt, rejectedWindows } = splitWindows(
      a.paymentSubmissions,
    );
    const fee = computeLiveLateFee({
      dueDate: a.dueDate,
      openedAt: a.createdAt,
      headsCount: heads,
      now,
      gracePeriodDays: graceDays,
      ratePerHeadPerDay: rate,
      pendingSubmittedAt,
      rejectedWindows,
    });
    const rawPenalty = a.penaltyAccrualFrozen
      ? new Decimal(a.penaltyAmount.toString())
      : fee.penaltyAmount;
    const penalty = effectivePenaltyAmount(
      rawPenalty,
      a.penaltyWaivedAmount?.toString() ?? "0",
    );
    const dues = remainingDues({
      penaltyAmount: penalty,
      interestComponent: a.interestComponent.toString(),
      principalComponent: a.principalComponent.toString(),
      amountPaid: a.amountPaid.toString(),
    });
    const baseRemaining = dues.interestDue.plus(dues.principalDue);
    const isAdvance = startOfLocalDay(a.dueDate) > today;
    const statusTag = isAdvance
      ? "Advance"
      : fee.isOverdue && !a.penaltyAccrualFrozen
        ? "Overdue"
        : fee.isCatchUp
          ? "Catch-up"
          : fee.isWithinGrace
            ? "In grace"
            : a.status === "PARTIAL"
              ? "Partial"
              : "Open";

    options.push({
      id: a.id,
      targetType: "LOAN_AMORTIZATION",
      label: `Loan #${a.installmentNumber} · ${formatKinsenaDueLabel(a.dueDate)} · ${formatPHP(dues.totalDue)}`,
      monthGroup: null,
      baseRemaining: baseRemaining.toFixed(2),
      penaltyAmount: penalty.toFixed(2),
      suggestedAmount: dues.totalDue.toFixed(2),
      monthlySuggestedAmount: dues.totalDue.toFixed(2),
      monthlyTotalSuggestedAmount: dues.totalDue.toFixed(2),
      cycleId: a.loan.cycleId,
      dueDate: a.dueDate.toISOString(),
      graceDeadline: a.graceDeadline.toISOString(),
      headsSnapshot: heads,
      kinsenasDue: dues.totalDue.toFixed(2),
      daysDelayed: a.penaltyAccrualFrozen ? a.daysDelayed : fee.chargeableDays,
      lateFeeBreakdown: a.penaltyAccrualFrozen
        ? "Pass granted — late fee frozen."
        : fee.isCatchUp && fee.chargeableDays === 0
          ? `Catch-up installment · opened ${formatKinsenaDueLabel(a.createdAt)}. Late fees start after ${fee.gracePeriodDays} days from open.`
          : formatLateFeeBreakdown(fee),
      status: statusTag,
      isWithinGrace: fee.isWithinGrace,
      isOverdue: fee.isOverdue && !Boolean(a.penaltyAccrualFrozen),
      isAdvance,
      isCatchUp: fee.isCatchUp,
      penaltyAccrualFrozen: Boolean(a.penaltyAccrualFrozen),
      periodKey: null,
      kinsenaIndex: null,
      penaltyRatePerHeadPerDay: rate,
    });
  }

  return options;
}
