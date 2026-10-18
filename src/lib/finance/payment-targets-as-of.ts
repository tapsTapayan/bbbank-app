import { Decimal } from "decimal.js";
import { formatPHP, toMoney } from "@/lib/finance/loan-calculator";
import {
  calculateKinsenaLateFee,
  calendarDaysBetween,
  formatLateFeeBreakdown,
  formatKinsenaDueLabel,
  GRACE_PERIOD_DAYS,
  startOfLocalDay,
} from "@/lib/finance/cpe-policy";
import type { PaymentTargetOption } from "@/lib/queries/member-payment-targets";

/** Parse `<input type="date">` value as a local calendar day. */
export function parseLocalIsoDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

function graceDaysForTarget(t: PaymentTargetOption): number {
  const due = new Date(t.dueDate);
  const grace = new Date(t.graceDeadline);
  if (Number.isNaN(due.getTime()) || Number.isNaN(grace.getTime())) {
    return GRACE_PERIOD_DAYS;
  }
  const days = calendarDaysBetween(due, grace);
  return days >= 0 ? days : GRACE_PERIOD_DAYS;
}

function adjustOne(
  t: PaymentTargetOption,
  asOf: Date,
): PaymentTargetOption {
  if (t.penaltyAccrualFrozen) return t;

  const fee = calculateKinsenaLateFee(
    new Date(t.dueDate),
    asOf,
    t.headsSnapshot,
    {
      gracePeriodDays: graceDaysForTarget(t),
      ratePerHeadPerDay: t.penaltyRatePerHeadPerDay,
    },
  );
  const penalty = toMoney(fee.penaltyAmount);
  const base = toMoney(t.baseRemaining);
  const suggested = toMoney(base.plus(penalty));
  const dueLabel = formatKinsenaDueLabel(new Date(t.dueDate));
  const isAdvance = startOfLocalDay(new Date(t.dueDate)) > startOfLocalDay(asOf);

  const statusTag = isAdvance
    ? "Advance"
    : fee.isOverdue
      ? "Overdue"
      : t.isCatchUp
        ? "Catch-up"
        : fee.isWithinGrace
          ? "In grace"
          : t.status === "Partial" || t.status === "PARTIAL"
            ? "Partial"
            : "Open";

  const label =
    t.targetType === "CONTRIBUTION"
      ? `${dueLabel} · ${formatPHP(base)}`
      : t.label.replace(/\s·\s₱[\d,]+\.\d{2}$/, ` · ${formatPHP(suggested)}`);

  return {
    ...t,
    label,
    penaltyAmount: penalty.toFixed(2),
    suggestedAmount: suggested.toFixed(2),
    daysDelayed: fee.chargeableDays,
    lateFeeBreakdown: formatLateFeeBreakdown(fee),
    isWithinGrace: fee.isWithinGrace,
    isOverdue: fee.isOverdue,
    isAdvance,
    status: statusTag,
    // monthly fields filled in a second pass
    monthlySuggestedAmount: t.monthlySuggestedAmount,
    monthlyTotalSuggestedAmount: t.monthlyTotalSuggestedAmount,
  };
}

/**
 * Recompute live late fees / suggested dues as of a payment transaction date
 * (Rule #3). Used on `/pay` when the member changes Paid At.
 */
export function recomputePaymentTargetsAsOf(
  targets: PaymentTargetOption[],
  paidAtIso: string,
): PaymentTargetOption[] {
  const asOf = parseLocalIsoDate(paidAtIso);
  if (!asOf) return targets;

  const adjusted = targets.map((t) => adjustOne(t, asOf));

  return adjusted.map((row) => {
    if (row.targetType !== "CONTRIBUTION" || !row.periodKey) {
      return {
        ...row,
        monthlySuggestedAmount: row.suggestedAmount,
        monthlyTotalSuggestedAmount: row.suggestedAmount,
      };
    }
    const sameMonthLater = adjusted.filter(
      (other) =>
        other.targetType === "CONTRIBUTION" &&
        other.periodKey === row.periodKey &&
        other.dueDate >= row.dueDate,
    );
    const monthlyBase = sameMonthLater.reduce(
      (sum, other) => sum.plus(other.baseRemaining),
      new Decimal(0),
    );
    const monthlyTotal = sameMonthLater.reduce(
      (sum, other) => sum.plus(other.suggestedAmount),
      new Decimal(0),
    );
    return {
      ...row,
      monthlySuggestedAmount: monthlyBase.toFixed(2),
      monthlyTotalSuggestedAmount: monthlyTotal.toFixed(2),
    };
  });
}
