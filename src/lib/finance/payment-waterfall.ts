import { Decimal } from "decimal.js";
import {
  allocateContributionPayment,
  allocatePayment,
  remainingContributionDues,
  remainingDues,
  toMoney,
  type ContributionBalances,
} from "./payment-allocation";
import {
  formatPHP,
  type InstallmentBalances,
} from "./loan-calculator";
import { formatKinsenaPeriodScope } from "./cpe-policy";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export type WaterfallObligationKind = "CONTRIBUTION" | "LOAN_AMORTIZATION";

export type WaterfallObligation = {
  id: string;
  kind: WaterfallObligationKind;
  /** Short label for UI (e.g. "15 Jan 2026" or "Installment #2"). */
  label: string;
  /** Remaining total due before this payment (base + penalty [+ interest]). */
  remainingTotal: Decimal.Value;
  contribution?: ContributionBalances;
  loan?: InstallmentBalances;
};

export type WaterfallLine = {
  id: string;
  kind: WaterfallObligationKind;
  label: string;
  applied: string;
  toPenalty: string;
  toInterest: string;
  toPrincipal: string;
};

export type WaterfallPlan = {
  lines: WaterfallLine[];
  prepaid: string;
  totalApplied: string;
  /** First obligation that received funds (submission anchor). */
  primaryTargetId: string | null;
};

function lineFromAllocation(
  obligation: WaterfallObligation,
  toPenalty: Decimal,
  toInterest: Decimal,
  toPrincipal: Decimal,
): WaterfallLine | null {
  const applied = toMoney(toPenalty.plus(toInterest).plus(toPrincipal));
  if (applied.lte(0)) return null;
  return {
    id: obligation.id,
    kind: obligation.kind,
    label: obligation.label,
    applied: applied.toFixed(2),
    toPenalty: toMoney(toPenalty).toFixed(2),
    toInterest: toMoney(toInterest).toFixed(2),
    toPrincipal: toMoney(toPrincipal).toFixed(2),
  };
}

/**
 * Allocate a payment across ordered obligations (oldest first).
 * Caller must sort and ensure advance rows exist before calling.
 * Any remainder after all lines becomes prepaid.
 */
export function planPaymentWaterfall(
  paymentAmount: Decimal.Value,
  obligations: readonly WaterfallObligation[],
): WaterfallPlan {
  let remaining = toMoney(paymentAmount);
  if (remaining.lt(0)) {
    throw new Error("paymentAmount must be >= 0");
  }

  const lines: WaterfallLine[] = [];

  for (const obligation of obligations) {
    if (remaining.lte(0)) break;

    if (obligation.kind === "CONTRIBUTION" && obligation.contribution) {
      const allocation = allocateContributionPayment(
        remaining,
        obligation.contribution,
      );
      const line = lineFromAllocation(
        obligation,
        allocation.toPenalty,
        allocation.toInterest,
        allocation.toPrincipal,
      );
      if (line) {
        lines.push(line);
        remaining = allocation.leftover;
      }
      continue;
    }

    if (obligation.kind === "LOAN_AMORTIZATION" && obligation.loan) {
      const allocation = allocatePayment(remaining, obligation.loan);
      const line = lineFromAllocation(
        obligation,
        allocation.toPenalty,
        allocation.toInterest,
        allocation.toPrincipal,
      );
      if (line) {
        lines.push(line);
        remaining = allocation.leftover;
      }
    }
  }

  const totalApplied = lines.reduce(
    (sum, line) => sum.plus(line.applied),
    new Decimal(0),
  );

  return {
    lines,
    prepaid: remaining.toFixed(2),
    totalApplied: toMoney(totalApplied).toFixed(2),
    primaryTargetId: lines[0]?.id ?? null,
  };
}

/** Build a contribution obligation row from balances + label. */
export function contributionWaterfallObligation(params: {
  id: string;
  label: string;
  amountDue: Decimal.Value;
  amountPaid: Decimal.Value;
  penaltyAmount: Decimal.Value;
  penaltyWaivedAmount?: Decimal.Value;
}): WaterfallObligation | null {
  const contribution: ContributionBalances = {
    amountDue: params.amountDue,
    amountPaid: params.amountPaid,
    penaltyAmount: params.penaltyAmount,
    penaltyWaivedAmount: params.penaltyWaivedAmount ?? 0,
  };
  const dues = remainingContributionDues(contribution);
  if (dues.totalDue.lte(0)) return null;
  return {
    id: params.id,
    kind: "CONTRIBUTION",
    label: params.label,
    remainingTotal: dues.totalDue.toFixed(2),
    contribution,
  };
}

/** Build a loan installment obligation row from balances + label. */
export function loanWaterfallObligation(params: {
  id: string;
  label: string;
  penaltyAmount: Decimal.Value;
  interestComponent: Decimal.Value;
  principalComponent: Decimal.Value;
  amountPaid: Decimal.Value;
}): WaterfallObligation | null {
  const loan: InstallmentBalances = {
    penaltyAmount: params.penaltyAmount,
    interestComponent: params.interestComponent,
    principalComponent: params.principalComponent,
    amountPaid: params.amountPaid,
  };
  const dues = remainingDues(loan);
  if (dues.totalDue.lte(0)) return null;
  return {
    id: params.id,
    kind: "LOAN_AMORTIZATION",
    label: params.label,
    remainingTotal: dues.totalDue.toFixed(2),
    loan,
  };
}

/** Human-readable allocation lines for pay / verify UI. */
export function formatWaterfallPreview(plan: WaterfallPlan): string[] {
  const rows = plan.lines.map(
    (line) => `${formatPHP(line.applied)} → ${line.label}`,
  );
  if (toMoney(plan.prepaid).gt(0)) {
    rows.push(`${formatPHP(plan.prepaid)} → prepaid credit`);
  }
  return rows;
}

/**
 * Client/preview helper: plan from payment-target rows (already filtered &
 * sorted oldest-first). Remaining balances are treated as amountPaid=0.
 * Loan interest/principal split is collapsed into principal for preview only;
 * verify uses live installment components.
 */
export function planFromPaymentTargets(
  paymentAmount: Decimal.Value,
  targets: ReadonlyArray<{
    id: string;
    targetType: WaterfallObligationKind;
    label: string;
    baseRemaining: string;
    penaltyAmount: string;
    dueDate: string;
    kinsenaIndex?: 1 | 2 | null;
  }>,
): WaterfallPlan {
  const obligations: WaterfallObligation[] = [];

  for (const t of targets) {
    const shortLabel =
      t.targetType === "CONTRIBUTION" &&
      (t.kinsenaIndex === 1 || t.kinsenaIndex === 2)
        ? formatKinsenaPeriodScope(new Date(t.dueDate), t.kinsenaIndex)
        : t.label.replace(/\s·\s₱[\d,]+\.\d{2}$/, "");

    if (t.targetType === "CONTRIBUTION") {
      const row = contributionWaterfallObligation({
        id: t.id,
        label: shortLabel,
        amountDue: t.baseRemaining,
        amountPaid: 0,
        penaltyAmount: t.penaltyAmount,
      });
      if (row) obligations.push(row);
      continue;
    }

    const row = loanWaterfallObligation({
      id: t.id,
      label: shortLabel,
      penaltyAmount: t.penaltyAmount,
      interestComponent: 0,
      principalComponent: t.baseRemaining,
      amountPaid: 0,
    });
    if (row) obligations.push(row);
  }

  return planPaymentWaterfall(paymentAmount, obligations);
}

/** Sum suggested dues from the start of `targets` through `throughId` inclusive. */
export function amountThroughTarget(
  targets: ReadonlyArray<{ id: string; suggestedAmount: string }>,
  throughId: string,
): string {
  let sum = new Decimal(0);
  let found = false;
  for (const t of targets) {
    sum = sum.plus(t.suggestedAmount || 0);
    if (t.id === throughId) {
      found = true;
      break;
    }
  }
  return found ? toMoney(sum).toFixed(2) : toMoney(sum).toFixed(2);
}
