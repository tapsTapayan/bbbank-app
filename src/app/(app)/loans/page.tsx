import { Decimal } from "decimal.js";
import { requirePageUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  calculateMaxLoanableAmount,
  calculateTotalMonthlyCollectibles,
  checkMemberLoanEligibility,
  isBlockingOverdueContribution,
  LOAN_FLAT_INTEREST_RATE,
  LOAN_TERM_MONTHS,
  MAX_LOANABLE_POOL_RATIO,
} from "@/lib/finance/cpe-policy";
import { LoansCalculator } from "./loans-calculator";

export const instant = false;

async function loadLoanContext(userId: string) {
  const now = new Date();
  const [user, members, openContributions, blockingLoans, cycle] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      prisma.user.findMany({
        where: { status: "ACTIVE", role: "MEMBER" },
        select: { headsCount: true },
      }),
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
        },
      }),
      prisma.loan.findMany({
        where: {
          borrowerId: userId,
          status: { in: ["PENDING", "APPROVED", "ACTIVE", "DEFAULTED"] },
        },
        select: { id: true, status: true },
      }),
      prisma.fundCycle.findFirst({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          loanInterestRate: true,
          loanTermMonths: true,
          maxLoanablePoolRatio: true,
        },
      }),
    ]);

  const overdueContributions = openContributions.filter((c) =>
    isBlockingOverdueContribution(c, now),
  );

  let availableCash = new Decimal(0);
  if (cycle) {
    const entries = await prisma.ledgerEntry.groupBy({
      by: ["entryType"],
      where: { cycleId: cycle.id },
      _sum: { amount: true },
    });
    const inflowTypes = new Set([
      "CONTRIBUTION_IN",
      "PRINCIPAL_REPAYMENT_IN",
      "INTEREST_INCOME_IN",
      "PENALTY_INCOME_IN",
    ]);
    const outflowTypes = new Set(["LOAN_DISBURSEMENT_OUT"]);
    for (const row of entries) {
      const amt = new Decimal(row._sum.amount?.toString() ?? "0");
      if (inflowTypes.has(row.entryType)) {
        availableCash = availableCash.plus(amt);
      } else if (outflowTypes.has(row.entryType)) {
        availableCash = availableCash.minus(amt);
      }
    }
  }

  const headsList =
    members.length > 0
      ? members.map((m) => m.headsCount)
      : [user.headsCount];
  const totalMonthlyCollectibles =
    calculateTotalMonthlyCollectibles(headsList);

  const maxLoanable = calculateMaxLoanableAmount(
    totalMonthlyCollectibles,
    user.headsCount,
    Decimal.max(0, availableCash),
    cycle?.maxLoanablePoolRatio?.toString() ?? MAX_LOANABLE_POOL_RATIO,
  );

  const eligibility = checkMemberLoanEligibility(
    { status: user.status },
    overdueContributions,
    blockingLoans,
  );

  return {
    headsCount: user.headsCount,
    memberStatus: user.status,
    cycleName: cycle?.name ?? null,
    interestRate: Number(
      (cycle?.loanInterestRate ?? LOAN_FLAT_INTEREST_RATE).toString(),
    ),
    termMonths: cycle?.loanTermMonths ?? LOAN_TERM_MONTHS,
    totalMonthlyCollectibles: Number(
      maxLoanable.totalMonthlyCollectibles.toFixed(2),
    ),
    availableCashPool: Number(maxLoanable.availableCashPool.toFixed(2)),
    policyCap: Number(maxLoanable.policyCap.toFixed(2)),
    maxLoanable: Number(maxLoanable.maxLoanable.toFixed(2)),
    limitedBy: maxLoanable.limitedBy,
    eligibility,
  };
}

export default async function LoansPage() {
  const sessionUser = await requirePageUser(undefined, "/loans");
  const ctx = await loadLoanContext(sessionUser.id);

  return <LoansCalculator {...ctx} />;
}
