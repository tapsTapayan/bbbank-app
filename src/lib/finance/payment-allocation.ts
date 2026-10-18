import { Decimal } from "decimal.js";
import {
  allocatePayment,
  remainingDues,
  toMoney,
  type PaymentAllocation,
} from "./loan-calculator";
import { effectivePenaltyAmount } from "./cpe-policy";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export type ContributionBalances = {
  amountDue: Decimal.Value;
  amountPaid: Decimal.Value;
  penaltyAmount: Decimal.Value;
  penaltyWaivedAmount?: Decimal.Value;
};

/**
 * Allocates a contribution payment: late fee → base principal.
 * `amountPaid` is total previously applied (same unwind model as loans).
 */
export function allocateContributionPayment(
  paymentAmount: Decimal.Value,
  contribution: ContributionBalances,
): PaymentAllocation {
  const penalty = effectivePenaltyAmount(
    contribution.penaltyAmount,
    contribution.penaltyWaivedAmount ?? 0,
  );
  return allocatePayment(paymentAmount, {
    penaltyAmount: penalty,
    interestComponent: 0,
    principalComponent: contribution.amountDue,
    amountPaid: contribution.amountPaid,
  });
}

export function remainingContributionDues(
  contribution: ContributionBalances,
): ReturnType<typeof remainingDues> {
  const penalty = effectivePenaltyAmount(
    contribution.penaltyAmount,
    contribution.penaltyWaivedAmount ?? 0,
  );
  return remainingDues({
    penaltyAmount: penalty,
    interestComponent: 0,
    principalComponent: contribution.amountDue,
    amountPaid: contribution.amountPaid,
  });
}

export function contributionStatusAfterPayment(
  contribution: ContributionBalances,
  newAmountPaid: Decimal.Value,
  previousStatus: string,
): "PAID" | "PARTIAL" | "OVERDUE" | "UNPAID" {
  const dues = remainingContributionDues({
    ...contribution,
    amountPaid: newAmountPaid,
  });
  if (dues.totalDue.lte(0)) return "PAID";
  const paid = toMoney(newAmountPaid);
  if (paid.lte(0)) {
    return previousStatus === "OVERDUE" ? "OVERDUE" : "UNPAID";
  }
  return previousStatus === "OVERDUE" ? "OVERDUE" : "PARTIAL";
}

export { toMoney, remainingDues, allocatePayment };
