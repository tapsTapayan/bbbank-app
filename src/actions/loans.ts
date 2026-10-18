"use server";

import { revalidatePath } from "next/cache";
import { Decimal } from "decimal.js";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireAppUser } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import {
  calculateMaxLoanableAmount,
  calculateTotalMonthlyCollectibles,
  checkMemberLoanEligibility,
  generate2MonthLoanSchedule,
  isBlockingOverdueContribution,
  LOAN_FLAT_INTEREST_RATE,
  LOAN_TERM_MONTHS,
  MAX_LOANABLE_POOL_RATIO,
} from "@/lib/finance/cpe-policy";
import { toMoney } from "@/lib/finance/loan-calculator";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const requestSchema = z.object({
  principalAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Invalid principal")
    .refine((v) => Number(v) > 0, "Principal must be greater than zero"),
  repaymentFrequency: z.enum(["KINSENAS", "MONTHLY"]).default("KINSENAS"),
});

async function loadMaxLoanable(userId: string, headsCount: number) {
  const [members, cycle] = await Promise.all([
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        role: { in: ["MEMBER", "TREASURER", "AUDITOR"] },
      },
      select: { headsCount: true },
    }),
    prisma.fundCycle.findFirst({ where: { isActive: true } }),
  ]);

  if (!cycle) {
    throw new Error("No active fund cycle.");
  }

  let availableCash = new Decimal(0);
  const entries = await prisma.ledgerEntry.groupBy({
    by: ["entryType"],
    where: { cycleId: cycle.id },
    _sum: { amount: true },
  });
  const inflows = new Set([
    "CONTRIBUTION_IN",
    "PRINCIPAL_REPAYMENT_IN",
    "INTEREST_INCOME_IN",
    "PENALTY_INCOME_IN",
  ]);
  for (const row of entries) {
    const amt = new Decimal(row._sum.amount?.toString() ?? "0");
    if (inflows.has(row.entryType)) availableCash = availableCash.plus(amt);
    if (row.entryType === "LOAN_DISBURSEMENT_OUT") {
      availableCash = availableCash.minus(amt);
    }
  }

  const headsList =
    members.length > 0 ? members.map((m) => m.headsCount) : [headsCount];
  const collectibles = calculateTotalMonthlyCollectibles(headsList);
  const max = calculateMaxLoanableAmount(
    collectibles,
    headsCount,
    Decimal.max(0, availableCash),
    cycle.maxLoanablePoolRatio?.toString() ?? MAX_LOANABLE_POOL_RATIO,
  );

  return { cycle, max, availableCash: Decimal.max(0, availableCash) };
}

async function loadEligibility(userId: string) {
  const now = new Date();
  const [user, openContributions, blockingLoans] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.contribution.findMany({
      where: {
        userId,
        status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
      },
      select: {
        id: true,
        status: true,
        graceDeadline: true,
        amountDue: true,
        amountPaid: true,
        penaltyAmount: true,
        penaltyWaivedAmount: true,
      },
    }),
    prisma.loan.findMany({
      where: {
        borrowerId: userId,
        status: { in: ["PENDING", "APPROVED", "ACTIVE", "DEFAULTED"] },
      },
      select: { id: true, status: true },
    }),
  ]);

  const overdue = openContributions.filter((c) =>
    isBlockingOverdueContribution(c, now),
  );
  const eligibility = checkMemberLoanEligibility(
    { status: user.status },
    overdue,
    blockingLoans,
  );

  return { user, eligibility };
}

export async function requestLoan(
  input: z.infer<typeof requestSchema>,
): Promise<ActionResult<{ loanId: string }>> {
  try {
    const member = await requireAppUser(["MEMBER", "TREASURER", "AUDITOR"]);
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid loan request.");
    }

    const principal = toMoney(parsed.data.principalAmount);
    const { user, eligibility } = await loadEligibility(member.id);
    if (!eligibility.eligible) {
      return fail(eligibility.reasons.join(" "));
    }

    const { cycle, max } = await loadMaxLoanable(user.id, user.headsCount);
    if (principal.gt(max.maxLoanable)) {
      return fail(
        `Requested ₱${principal.toFixed(2)} exceeds max loanable ₱${max.maxLoanable.toFixed(2)}.`,
      );
    }

    const interestRate = cycle.loanInterestRate ?? LOAN_FLAT_INTEREST_RATE;
    const termMonths = cycle.loanTermMonths ?? LOAN_TERM_MONTHS;

    const loan = await prisma.loan.create({
      data: {
        borrowerId: user.id,
        cycleId: cycle.id,
        principalAmount: new Prisma.Decimal(principal.toFixed(2)),
        interestRate: new Prisma.Decimal(interestRate.toString()),
        termMonths,
        interestType: "FLAT",
        repaymentFrequency: parsed.data.repaymentFrequency,
        headsSnapshot: user.headsCount,
        status: "PENDING",
      },
    });

    revalidatePath("/loans");
    revalidatePath("/loans-admin");
    revalidatePath("/dashboard");

    return ok({ loanId: loan.id }, "Loan request submitted for treasurer review.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to request loan.");
  }
}

export async function approveLoan(
  loanId: string,
): Promise<ActionResult<{ loanId: string }>> {
  try {
    const treasurer = await requireAppUser(["TREASURER"]);
    const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
    if (loan.status !== "PENDING") {
      return fail(`Loan is already ${loan.status.toLowerCase()}.`);
    }

    await prisma.loan.update({
      where: { id: loanId },
      data: {
        status: "APPROVED",
        approvedById: treasurer.id,
      },
    });

    revalidatePath("/loans-admin");
    revalidatePath("/loans");
    return ok({ loanId }, "Loan approved. Ready to disburse.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to approve loan.");
  }
}

export async function rejectLoan(
  loanId: string,
  remarks?: string,
): Promise<ActionResult<{ loanId: string }>> {
  try {
    await requireAppUser(["TREASURER"]);
    const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
    if (loan.status !== "PENDING" && loan.status !== "APPROVED") {
      return fail(`Cannot reject a ${loan.status.toLowerCase()} loan.`);
    }

    await prisma.loan.update({
      where: { id: loanId },
      data: { status: "REJECTED" },
    });

    revalidatePath("/loans-admin");
    revalidatePath("/loans");
    return ok(
      { loanId },
      remarks?.trim()
        ? `Loan rejected: ${remarks.trim()}`
        : "Loan rejected.",
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to reject loan.");
  }
}

export async function disburseLoan(
  loanId: string,
): Promise<ActionResult<{ loanId: string }>> {
  try {
    const treasurer = await requireAppUser(["TREASURER"]);

    const result = await prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findUniqueOrThrow({
        where: { id: loanId },
        include: { borrower: true, cycle: true },
      });

      if (loan.status !== "APPROVED" && loan.status !== "PENDING") {
        throw new Error(`Cannot disburse a ${loan.status.toLowerCase()} loan.`);
      }

      const { max } = await loadMaxLoanable(
        loan.borrowerId,
        loan.headsSnapshot,
      );
      const principal = toMoney(loan.principalAmount.toString());
      if (principal.gt(max.maxLoanable)) {
        throw new Error(
          `Disbursement blocked: exceeds current max loanable ₱${max.maxLoanable.toFixed(2)}.`,
        );
      }

      const now = new Date();
      const schedule = generate2MonthLoanSchedule(
        principal,
        now,
        loan.repaymentFrequency,
        {
          interestRate: loan.interestRate.toString(),
          termMonths: loan.termMonths || LOAN_TERM_MONTHS,
          gracePeriodDays: loan.cycle.gracePeriodDays,
        },
      );

      for (const inst of schedule.installments) {
        await tx.loanAmortization.create({
          data: {
            loanId: loan.id,
            installmentNumber: inst.installmentNumber,
            dueDate: inst.dueDate,
            graceDeadline: inst.graceDeadline,
            headsSnapshot: loan.headsSnapshot,
            principalComponent: new Prisma.Decimal(
              inst.principalComponent.toFixed(2),
            ),
            interestComponent: new Prisma.Decimal(
              inst.interestComponent.toFixed(2),
            ),
          },
        });
      }

      await tx.loan.update({
        where: { id: loan.id },
        data: {
          status: "ACTIVE",
          disbursedAt: now,
          approvedById: loan.approvedById ?? treasurer.id,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          cycleId: loan.cycleId,
          userId: loan.borrowerId,
          loanId: loan.id,
          entryType: "LOAN_DISBURSEMENT_OUT",
          amount: new Prisma.Decimal(principal.toFixed(2)),
          description: `Loan disbursement · ${loan.id.slice(-6).toUpperCase()}`,
          createdById: treasurer.id,
        },
      });

      return { loanId: loan.id };
    });

    revalidatePath("/loans-admin");
    revalidatePath("/loans");
    revalidatePath("/dashboard");
    revalidatePath("/pay");

    return ok(result, "Loan disbursed and schedule created.");
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Failed to disburse loan.",
    );
  }
}
