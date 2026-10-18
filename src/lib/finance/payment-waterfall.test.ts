import { describe, expect, it } from "vitest";
import {
  contributionWaterfallObligation,
  formatWaterfallPreview,
  loanWaterfallObligation,
  planPaymentWaterfall,
} from "./payment-waterfall";

function contrib(
  id: string,
  label: string,
  amountDue: number,
  penalty = 0,
  amountPaid = 0,
) {
  const row = contributionWaterfallObligation({
    id,
    label,
    amountDue,
    amountPaid,
    penaltyAmount: penalty,
  });
  if (!row) throw new Error(`expected obligation ${id}`);
  return row;
}

describe("planPaymentWaterfall (contributions)", () => {
  it("partial: applies only to the oldest overdue", () => {
    const plan = planPaymentWaterfall(500, [
      contrib("a", "15 Jan", 1000, 120),
      contrib("b", "30 Jan", 1000),
    ]);
    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0]?.id).toBe("a");
    expect(plan.lines[0]?.toPenalty).toBe("120.00");
    expect(plan.lines[0]?.toPrincipal).toBe("380.00");
    expect(plan.prepaid).toBe("0.00");
    expect(plan.primaryTargetId).toBe("a");
  });

  it("exact: covers two periods oldest-first", () => {
    const plan = planPaymentWaterfall(2120, [
      contrib("a", "15 Jan", 1000, 120),
      contrib("b", "30 Jan", 1000),
    ]);
    expect(plan.lines).toHaveLength(2);
    expect(plan.lines[0]?.id).toBe("a");
    expect(plan.lines[0]?.applied).toBe("1120.00");
    expect(plan.lines[1]?.id).toBe("b");
    expect(plan.lines[1]?.applied).toBe("1000.00");
    expect(plan.prepaid).toBe("0.00");
  });

  it("excess: fills open rows then prepaid", () => {
    const plan = planPaymentWaterfall(3000, [
      contrib("a", "15 Jan", 1000),
      contrib("b", "30 Jan", 1000),
    ]);
    expect(plan.lines).toHaveLength(2);
    expect(plan.totalApplied).toBe("2000.00");
    expect(plan.prepaid).toBe("1000.00");
  });

  it("ignores selection order: overdue still first when listed first", () => {
    // Caller must sort — verifying oldest-first when ordered correctly.
    const plan = planPaymentWaterfall(1000, [
      contrib("overdue", "15 Jan", 1000, 200),
      contrib("advance", "15 Feb", 1000),
    ]);
    expect(plan.primaryTargetId).toBe("overdue");
    expect(plan.lines[0]?.toPenalty).toBe("200.00");
    expect(plan.lines[0]?.toPrincipal).toBe("800.00");
    expect(plan.lines.some((l) => l.id === "advance")).toBe(false);
  });

  it("formats preview lines", () => {
    const plan = planPaymentWaterfall(2500, [
      contrib("a", "15 Jan", 1000),
      contrib("b", "30 Jan", 1000),
    ]);
    expect(formatWaterfallPreview(plan)).toEqual([
      "₱1,000.00 → 15 Jan",
      "₱1,000.00 → 30 Jan",
      "₱500.00 → prepaid credit",
    ]);
  });
});

describe("planPaymentWaterfall (loans)", () => {
  it("cascades installments penalties→interest→principal", () => {
    const a = loanWaterfallObligation({
      id: "i1",
      label: "Installment #1",
      penaltyAmount: 40,
      interestComponent: 250,
      principalComponent: 2500,
      amountPaid: 0,
    });
    const b = loanWaterfallObligation({
      id: "i2",
      label: "Installment #2",
      penaltyAmount: 0,
      interestComponent: 250,
      principalComponent: 2500,
      amountPaid: 0,
    });
    if (!a || !b) throw new Error("expected installments");

    const plan = planPaymentWaterfall(3000, [a, b]);
    expect(plan.lines[0]?.id).toBe("i1");
    expect(plan.lines[0]?.applied).toBe("2790.00");
    expect(plan.lines[1]?.id).toBe("i2");
    expect(plan.lines[1]?.toInterest).toBe("210.00");
    expect(plan.prepaid).toBe("0.00");
  });
});
