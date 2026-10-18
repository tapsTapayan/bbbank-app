import { Decimal } from "decimal.js";

/** Configure Decimal for banker's-friendly 2-decimal currency math (PHP centavos). */
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export type InterestType = "FLAT" | "DIMINISHING";

export type AmortizationInstallment = {
  installmentNumber: number;
  dueDate: Date;
  principalComponent: Decimal;
  interestComponent: Decimal;
  totalDue: Decimal;
  remainingPrincipal: Decimal;
};

export type PaymentAllocation = {
  toPenalty: Decimal;
  toInterest: Decimal;
  toPrincipal: Decimal;
  leftover: Decimal;
};

export type InstallmentBalances = {
  penaltyAmount: Decimal.Value;
  interestComponent: Decimal.Value;
  principalComponent: Decimal.Value;
  /** Amount already applied to this installment (optional). */
  amountPaid?: Decimal.Value;
};

function toMoney(value: Decimal.Value): Decimal {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  // Clamp overflow (e.g. Jan 31 + 1 month → Mar 3) back to last day of target month
  if (result.getDate() < day) {
    result.setDate(0);
  }
  return result;
}

/**
 * Generates a monthly amortization schedule.
 *
 * - FLAT: total interest = principal × monthlyRate × termMonths;
 *   each installment pays equal principal and equal interest shares.
 * - DIMINISHING: classic fixed-payment (PMT) amortizing loan;
 *   interest accrues on remaining principal each period.
 *
 * All money values use Decimal.js — never native floats.
 */
export function generateAmortizationSchedule(params: {
  principal: Decimal.Value;
  monthlyInterestRate: Decimal.Value;
  termMonths: number;
  startDate: Date;
  interestType: InterestType;
}): AmortizationInstallment[] {
  const { termMonths, startDate, interestType } = params;
  const principal = toMoney(params.principal);
  const monthlyRate = new Decimal(params.monthlyInterestRate);

  if (principal.lte(0)) {
    throw new Error("principal must be greater than zero");
  }
  if (monthlyRate.lt(0)) {
    throw new Error("monthlyInterestRate must be >= 0");
  }
  if (!Number.isInteger(termMonths) || termMonths < 1) {
    throw new Error("termMonths must be a positive integer");
  }
  if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
    throw new Error("startDate must be a valid Date");
  }

  if (interestType === "FLAT") {
    return generateFlatSchedule(principal, monthlyRate, termMonths, startDate);
  }
  return generateDiminishingSchedule(principal, monthlyRate, termMonths, startDate);
}

function generateFlatSchedule(
  principal: Decimal,
  monthlyRate: Decimal,
  termMonths: number,
  startDate: Date,
): AmortizationInstallment[] {
  const totalInterest = toMoney(principal.mul(monthlyRate).mul(termMonths));
  const basePrincipal = toMoney(principal.div(termMonths));
  const baseInterest = toMoney(totalInterest.div(termMonths));

  // Absorb rounding remainder into the final installment so totals reconcile
  let allocatedPrincipal = new Decimal(0);
  let allocatedInterest = new Decimal(0);
  const schedule: AmortizationInstallment[] = [];

  for (let i = 1; i <= termMonths; i++) {
    const isLast = i === termMonths;
    const principalComponent = isLast
      ? toMoney(principal.minus(allocatedPrincipal))
      : basePrincipal;
    const interestComponent = isLast
      ? toMoney(totalInterest.minus(allocatedInterest))
      : baseInterest;

    allocatedPrincipal = allocatedPrincipal.plus(principalComponent);
    allocatedInterest = allocatedInterest.plus(interestComponent);

    const remainingPrincipal = toMoney(principal.minus(allocatedPrincipal));

    schedule.push({
      installmentNumber: i,
      dueDate: addMonths(startDate, i),
      principalComponent,
      interestComponent,
      totalDue: toMoney(principalComponent.plus(interestComponent)),
      remainingPrincipal,
    });
  }

  return schedule;
}

function generateDiminishingSchedule(
  principal: Decimal,
  monthlyRate: Decimal,
  termMonths: number,
  startDate: Date,
): AmortizationInstallment[] {
  // PMT = P * r * (1+r)^n / ((1+r)^n - 1); if r = 0 → equal principal shares
  let fixedPayment: Decimal;
  if (monthlyRate.isZero()) {
    fixedPayment = toMoney(principal.div(termMonths));
  } else {
    const factor = monthlyRate.plus(1).pow(termMonths);
    fixedPayment = toMoney(
      principal.mul(monthlyRate).mul(factor).div(factor.minus(1)),
    );
  }

  let remaining = principal;
  const schedule: AmortizationInstallment[] = [];

  for (let i = 1; i <= termMonths; i++) {
    const interestComponent = toMoney(remaining.mul(monthlyRate));
    const isLast = i === termMonths;

    let principalComponent: Decimal;
    if (isLast) {
      principalComponent = toMoney(remaining);
    } else {
      principalComponent = toMoney(fixedPayment.minus(interestComponent));
      // Guard against over-amortizing due to rounding near the end
      if (principalComponent.gt(remaining)) {
        principalComponent = toMoney(remaining);
      }
    }

    remaining = toMoney(remaining.minus(principalComponent));

    schedule.push({
      installmentNumber: i,
      dueDate: addMonths(startDate, i),
      principalComponent,
      interestComponent,
      totalDue: toMoney(principalComponent.plus(interestComponent)),
      remainingPrincipal: remaining,
    });
  }

  return schedule;
}

/**
 * Allocates a payment across an installment in strict priority order:
 * Penalties → Interest → Principal.
 *
 * Remaining dues are computed from original components minus amount already paid
 * (applied in the same priority order historically).
 */
export function allocatePayment(
  paymentAmount: Decimal.Value,
  installment: InstallmentBalances,
): PaymentAllocation {
  let remaining = toMoney(paymentAmount);
  if (remaining.lt(0)) {
    throw new Error("paymentAmount must be >= 0");
  }

  const dues = remainingDues(installment);

  const toPenalty = Decimal.min(remaining, dues.penaltyDue);
  remaining = remaining.minus(toPenalty);

  const toInterest = Decimal.min(remaining, dues.interestDue);
  remaining = remaining.minus(toInterest);

  const toPrincipal = Decimal.min(remaining, dues.principalDue);
  remaining = remaining.minus(toPrincipal);

  return {
    toPenalty: toMoney(toPenalty),
    toInterest: toMoney(toInterest),
    toPrincipal: toMoney(toPrincipal),
    leftover: toMoney(remaining),
  };
}

/**
 * Derives outstanding balances by unwinding amountPaid through the same
 * Penalties → Interest → Principal priority (so re-allocations stay consistent).
 */
export function remainingDues(installment: InstallmentBalances): {
  penaltyDue: Decimal;
  interestDue: Decimal;
  principalDue: Decimal;
  totalDue: Decimal;
} {
  const penalty = toMoney(installment.penaltyAmount);
  const interest = toMoney(installment.interestComponent);
  const principal = toMoney(installment.principalComponent);
  let paid = toMoney(installment.amountPaid ?? 0);

  const penaltyCovered = Decimal.min(paid, penalty);
  paid = paid.minus(penaltyCovered);

  const interestCovered = Decimal.min(paid, interest);
  paid = paid.minus(interestCovered);

  const principalCovered = Decimal.min(paid, principal);

  const penaltyDue = toMoney(penalty.minus(penaltyCovered));
  const interestDue = toMoney(interest.minus(interestCovered));
  const principalDue = toMoney(principal.minus(principalCovered));

  return {
    penaltyDue,
    interestDue,
    principalDue,
    totalDue: toMoney(penaltyDue.plus(interestDue).plus(principalDue)),
  };
}

/** Formats a Decimal money value as Philippine Peso display string (e.g. ₱1,234.56). */
export function formatPHP(amount: Decimal.Value): string {
  const value = toMoney(amount);
  const formatted = value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `₱${formatted}`;
}
