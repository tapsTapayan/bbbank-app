import { prisma } from "@/lib/db";
import { remainingDues, formatPHP } from "@/lib/finance/loan-calculator";

export type PaymentTargetOption = {
  id: string;
  targetType: "CONTRIBUTION" | "LOAN_AMORTIZATION";
  label: string;
  suggestedAmount: string;
  cycleId: string;
};

/**
 * Open contribution periods and unpaid loan installments for the member upload form.
 */
export async function getMemberPaymentTargets(
  userId: string,
): Promise<PaymentTargetOption[]> {
  const [contributions, amortizations, activeCycle] = await Promise.all([
    prisma.contribution.findMany({
      where: {
        userId,
        status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
      },
      orderBy: { dueDate: "asc" },
      include: { cycle: { select: { id: true, name: true } } },
    }),
    prisma.loanAmortization.findMany({
      where: {
        loan: { borrowerId: userId, status: { in: ["ACTIVE", "APPROVED"] } },
        status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
      },
      orderBy: { dueDate: "asc" },
      include: {
        loan: { select: { id: true, cycleId: true } },
      },
    }),
    prisma.fundCycle.findFirst({
      where: { isActive: true },
      select: { id: true },
    }),
  ]);

  const options: PaymentTargetOption[] = [];

  for (const c of contributions) {
    const due = Number(c.amountDue.toString()) - Number(c.amountPaid.toString());
    options.push({
      id: c.id,
      targetType: "CONTRIBUTION",
      label: `${c.periodMonth.toLocaleDateString("en-PH", {
        month: "short",
        year: "numeric",
      })} · ${c.cycle.name}`,
      suggestedAmount: Math.max(due, 0).toFixed(2),
      cycleId: c.cycleId,
    });
  }

  for (const a of amortizations) {
    const dues = remainingDues({
      penaltyAmount: a.penaltyAmount.toString(),
      interestComponent: a.interestComponent.toString(),
      principalComponent: a.principalComponent.toString(),
      amountPaid: a.amountPaid.toString(),
    });
    options.push({
      id: a.id,
      targetType: "LOAN_AMORTIZATION",
      label: `Loan installment #${a.installmentNumber} · ${formatPHP(dues.totalDue)} due`,
      suggestedAmount: dues.totalDue.toFixed(2),
      cycleId: a.loan.cycleId,
    });
  }

  // Ensure at least one cycleId is available for path construction when no dues exist.
  if (options.length === 0 && activeCycle) {
    // Caller can still show an empty-state message.
  }

  return options;
}
