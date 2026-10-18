import { describe, expect, it } from "vitest";
import {
  calculateKinsenaLateFee,
  calculateKinsenasDue,
  calculateMaxLoanableAmount,
  calculateTotalMonthlyCollectibles,
  checkMemberLoanEligibility,
  computeLiveLateFee,
  effectiveAsOfForPenaltyAccrual,
  effectiveDueDateForPenalty,
  formatKinsenaDueLabel,
  generate2MonthLoanSchedule,
  isBlockingOverdueContribution,
  startOfLocalDay,
} from "./cpe-policy";
import {
  allocateContributionPayment,
  allocatePayment,
  contributionStatusAfterPayment,
} from "./payment-allocation";

describe("calculateKinsenaLateFee (Rule #3)", () => {
  it("matches the March 15 → March 20 example (3 chargeable days)", () => {
    const fee = calculateKinsenaLateFee(
      new Date(2026, 2, 15),
      new Date(2026, 2, 20),
      4,
    );
    expect(fee.chargeableDays).toBe(3);
    expect(fee.penaltyAmount.toFixed(2)).toBe("120.00");
    expect(fee.isOverdue).toBe(true);
  });

  it("charges nothing within the 2-day grace", () => {
    const fee = calculateKinsenaLateFee(
      new Date(2026, 2, 15),
      new Date(2026, 2, 17),
      4,
    );
    expect(fee.chargeableDays).toBe(0);
    expect(fee.penaltyAmount.toFixed(2)).toBe("0.00");
    expect(fee.isWithinGrace).toBe(true);
  });
});

describe("effectiveDueDateForPenalty", () => {
  it("always uses the policy due date (Rule #3)", () => {
    const due = new Date(Date.UTC(2026, 0, 15));
    const opened = new Date(Date.UTC(2026, 9, 18));
    expect(effectiveDueDateForPenalty(due, opened).getTime()).toBe(
      startOfLocalDay(due).getTime(),
    );
  });
});

describe("formatKinsenaDueLabel", () => {
  it("uses the UTC calendar day (Feb last day, not 30th)", () => {
    expect(formatKinsenaDueLabel(new Date(Date.UTC(2026, 1, 28)))).toBe(
      "28 Feb 2026",
    );
    expect(formatKinsenaDueLabel(new Date(Date.UTC(2026, 0, 15)))).toBe(
      "15 Jan 2026",
    );
  });
});

describe("calculateMaxLoanableAmount (Rule #1)", () => {
  it("caps at 50% collectibles × heads, then cash", () => {
    const result = calculateMaxLoanableAmount(10000, 4, 100000);
    expect(result.policyCap.toFixed(2)).toBe("20000.00");
    expect(result.maxLoanable.toFixed(2)).toBe("20000.00");
    expect(result.limitedBy).toBe("POLICY");
  });

  it("is limited by available cash when lower", () => {
    const result = calculateMaxLoanableAmount(10000, 4, 5000);
    expect(result.maxLoanable.toFixed(2)).toBe("5000.00");
    expect(result.limitedBy).toBe("CASH");
  });
});

describe("generate2MonthLoanSchedule (Rule #2)", () => {
  it("applies 10% flat interest over 4 kinsenas", () => {
    const schedule = generate2MonthLoanSchedule(20000, new Date(2026, 0, 5), "KINSENAS");
    expect(schedule.interestTotal.toFixed(2)).toBe("2000.00");
    expect(schedule.totalPayable.toFixed(2)).toBe("22000.00");
    expect(schedule.installmentCount).toBe(4);
    const sum = schedule.installments.reduce(
      (s, i) => s.plus(i.totalDue),
      schedule.installments[0]!.totalDue.mul(0),
    );
    expect(sum.toFixed(2)).toBe("22000.00");
  });
});

describe("checkMemberLoanEligibility (Rule #5)", () => {
  it("blocks inactive members and overdue / blocking loans", () => {
    const ok = checkMemberLoanEligibility(
      { status: "ACTIVE" },
      [],
      [],
    );
    expect(ok.eligible).toBe(true);

    const blocked = checkMemberLoanEligibility(
      { status: "SUSPENDED" },
      [{ id: "c1" }],
      [{ status: "ACTIVE" }],
    );
    expect(blocked.eligible).toBe(false);
    expect(blocked.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it("treats past-grace unpaid as blocking without OVERDUE status", () => {
    const pastGrace = isBlockingOverdueContribution({
      status: "UNPAID",
      graceDeadline: new Date(2026, 2, 17),
      amountDue: 1000,
      amountPaid: 0,
    }, new Date(2026, 2, 20));
    expect(pastGrace).toBe(true);

    const paid = isBlockingOverdueContribution({
      status: "OVERDUE",
      graceDeadline: new Date(2026, 2, 17),
      amountDue: 1000,
      amountPaid: 1120,
      penaltyAmount: 120,
    }, new Date(2026, 2, 20));
    expect(paid).toBe(false);
  });

  it("still blocks when amountPaid equals amountDue but penalty leaves principal unpaid", () => {
    const blocked = isBlockingOverdueContribution(
      {
        status: "OVERDUE",
        graceDeadline: new Date(2026, 2, 17),
        amountDue: 1000,
        amountPaid: 1000,
        penaltyAmount: 120,
      },
      new Date(2026, 2, 20),
    );
    expect(blocked).toBe(true);
  });
});

describe("effectiveAsOfForPenaltyAccrual (freeze / reject resume)", () => {
  it("freezes at pending submit", () => {
    const submit = new Date(2026, 2, 18);
    const asOf = effectiveAsOfForPenaltyAccrual({
      now: new Date(2026, 2, 25),
      pendingSubmittedAt: submit,
    });
    expect(asOf.getTime()).toBe(submit.getTime());
  });

  it("excludes rejected pending window from accrual clock", () => {
    const asOf = effectiveAsOfForPenaltyAccrual({
      now: new Date(2026, 2, 25),
      rejectedWindows: [
        {
          submittedAt: new Date(2026, 2, 18),
          rejectedAt: new Date(2026, 2, 21),
        },
      ],
    });
    // 3 calendar days paused → effective asOf is Mar 22
    expect(asOf.getFullYear()).toBe(2026);
    expect(asOf.getMonth()).toBe(2);
    expect(asOf.getDate()).toBe(22);
  });
});

describe("computeLiveLateFee", () => {
  it("accrues Rule #3 from policy due even for catch-up opens", () => {
    // Due Jan 15, opened Oct 18, asOf Oct 20 → past policy grace by months.
    const fee = computeLiveLateFee({
      dueDate: new Date(Date.UTC(2026, 0, 15)),
      openedAt: new Date(Date.UTC(2026, 9, 18)),
      headsCount: 4,
      now: new Date(2026, 9, 20),
    });
    expect(fee.isCatchUp).toBe(true);
    expect(fee.isWithinGrace).toBe(false);
    expect(fee.chargeableDays).toBeGreaterThan(0);
    expect(Number(fee.penaltyAmount.toFixed(2))).toBeGreaterThan(0);
  });

  it("still freezes accrual at pending submit", () => {
    const fee = computeLiveLateFee({
      dueDate: new Date(Date.UTC(2026, 0, 15)),
      openedAt: new Date(Date.UTC(2026, 9, 18)),
      headsCount: 4,
      now: new Date(2026, 9, 25),
      // Submitted during policy grace — freeze keeps chargeable days at 0.
      pendingSubmittedAt: new Date(2026, 0, 16),
    });
    expect(fee.chargeableDays).toBe(0);
    expect(fee.penaltyAmount.toFixed(2)).toBe("0.00");
  });

  it("keeps In-grace semantics for on-time opens within policy grace", () => {
    const fee = computeLiveLateFee({
      dueDate: new Date(2026, 2, 15),
      openedAt: new Date(2026, 2, 1),
      headsCount: 4,
      now: new Date(2026, 2, 16),
    });
    expect(fee.isCatchUp).toBe(false);
    expect(fee.isWithinGrace).toBe(true);
    expect(fee.chargeableDays).toBe(0);
  });
});

describe("allocateContributionPayment", () => {
  it("underpays: applies to penalty then principal, leaves PARTIAL", () => {
    const allocation = allocateContributionPayment(50, {
      amountDue: 1000,
      amountPaid: 0,
      penaltyAmount: 120,
    });
    expect(allocation.toPenalty.toFixed(2)).toBe("50.00");
    expect(allocation.toPrincipal.toFixed(2)).toBe("0.00");
    expect(allocation.leftover.toFixed(2)).toBe("0.00");
    const status = contributionStatusAfterPayment(
      { amountDue: 1000, amountPaid: 0, penaltyAmount: 120 },
      50,
      "OVERDUE",
    );
    expect(status).toBe("OVERDUE");
  });

  it("exact: clears penalty + base", () => {
    const allocation = allocateContributionPayment(1120, {
      amountDue: 1000,
      amountPaid: 0,
      penaltyAmount: 120,
    });
    expect(allocation.toPenalty.toFixed(2)).toBe("120.00");
    expect(allocation.toPrincipal.toFixed(2)).toBe("1000.00");
    expect(allocation.leftover.toFixed(2)).toBe("0.00");
    expect(
      contributionStatusAfterPayment(
        { amountDue: 1000, amountPaid: 0, penaltyAmount: 120 },
        1120,
        "OVERDUE",
      ),
    ).toBe("PAID");
  });

  it("overpays: leftover after dues", () => {
    const allocation = allocateContributionPayment(1500, {
      amountDue: 1000,
      amountPaid: 0,
      penaltyAmount: 120,
    });
    expect(allocation.leftover.toFixed(2)).toBe("380.00");
  });
});

describe("Rule #4 kinsenas due", () => {
  it("is ₱250 × heads", () => {
    expect(calculateKinsenasDue(4).toFixed(2)).toBe("1000.00");
    expect(calculateTotalMonthlyCollectibles([4]).toFixed(2)).toBe("2000.00");
  });

  it("honors cycle per-head amount", () => {
    expect(calculateKinsenasDue(4, 300).toFixed(2)).toBe("1200.00");
  });
});

describe("allocatePayment (loan P→I→Prin)", () => {
  it("applies penalties then interest then principal", () => {
    const allocation = allocatePayment(500, {
      penaltyAmount: 120,
      interestComponent: 200,
      principalComponent: 5000,
      amountPaid: 0,
    });
    expect(allocation.toPenalty.toFixed(2)).toBe("120.00");
    expect(allocation.toInterest.toFixed(2)).toBe("200.00");
    expect(allocation.toPrincipal.toFixed(2)).toBe("180.00");
    expect(allocation.leftover.toFixed(2)).toBe("0.00");
  });
});
