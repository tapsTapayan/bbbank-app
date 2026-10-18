import { prisma } from "@/lib/db";
import {
  computeLiveLateFee,
  effectivePenaltyAmount,
  formatKinsenaPeriodScope,
  GRACE_PERIOD_DAYS,
} from "@/lib/finance/cpe-policy";
import {
  contributionWaterfallObligation,
  formatWaterfallPreview,
  loanWaterfallObligation,
  planPaymentWaterfall,
} from "@/lib/finance/payment-waterfall";

export type PlannedSubmissionAllocation = {
  lines: string[];
  primaryTargetId: string | null;
  summary: string | null;
};

/**
 * Planned oldest-first allocation for a payment amount as of paidAt.
 * Matches treasurer verify-queue preview / verify fee clock (Rule #3).
 */
export async function planSubmissionAllocation(params: {
  userId: string;
  amount: string;
  targetType: "CONTRIBUTION" | "LOAN_AMORTIZATION";
  paidAt: Date;
}): Promise<PlannedSubmissionAllocation> {
  const asOf = params.paidAt;

  if (params.targetType === "CONTRIBUTION") {
    const open = await prisma.contribution.findMany({
      where: {
        userId: params.userId,
        status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
      },
      orderBy: [{ dueDate: "asc" }, { kinsenaIndex: "asc" }],
      include: {
        cycle: { select: { gracePeriodDays: true, penaltyRate: true } },
      },
    });

    const obligations = open
      .map((c) => {
        const waived = c.penaltyWaivedAmount?.toString() ?? "0";
        let penalty: string;
        if (c.penaltyAccrualFrozen) {
          penalty = effectivePenaltyAmount(c.penaltyAmount.toString(), waived).toFixed(
            2,
          );
        } else {
          const fee = computeLiveLateFee({
            dueDate: c.dueDate,
            openedAt: c.createdAt,
            headsCount: c.headsSnapshot,
            now: asOf,
            gracePeriodDays: c.cycle.gracePeriodDays ?? GRACE_PERIOD_DAYS,
            graceDeadline: c.graceDeadline,
            ratePerHeadPerDay: c.cycle.penaltyRate.toString(),
            // Freeze accrual clock at the payment transaction date (same as verify queue).
            pendingSubmittedAt: asOf,
          });
          penalty = effectivePenaltyAmount(fee.penaltyAmount, waived).toFixed(2);
        }

        return contributionWaterfallObligation({
          id: c.id,
          label: formatKinsenaPeriodScope(
            c.dueDate,
            c.kinsenaIndex === 2 ? 2 : 1,
          ),
          amountDue: c.amountDue.toString(),
          amountPaid: c.amountPaid.toString(),
          penaltyAmount: penalty,
          penaltyWaivedAmount: 0,
        });
      })
      .filter((row): row is NonNullable<typeof row> => row != null);

    const plan = planPaymentWaterfall(params.amount, obligations);
    const lines = formatWaterfallPreview(plan);
    return {
      lines,
      primaryTargetId: plan.primaryTargetId,
      summary: lines.length > 0 ? lines.join("\n") : null,
    };
  }

  const open = await prisma.loanAmortization.findMany({
    where: {
      loan: {
        borrowerId: params.userId,
        status: { in: ["ACTIVE", "APPROVED"] },
      },
      status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
    },
    orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }],
    include: {
      loan: {
        select: {
          headsSnapshot: true,
          cycle: { select: { gracePeriodDays: true, penaltyRate: true } },
        },
      },
    },
  });

  const obligations = open
    .map((a) => {
      const heads = a.headsSnapshot || a.loan.headsSnapshot;
      const waived = a.penaltyWaivedAmount?.toString() ?? "0";
      let penalty: string;
      if (a.penaltyAccrualFrozen) {
        penalty = effectivePenaltyAmount(a.penaltyAmount.toString(), waived).toFixed(
          2,
        );
      } else {
        const fee = computeLiveLateFee({
          dueDate: a.dueDate,
          openedAt: a.createdAt,
          headsCount: heads,
          now: asOf,
          gracePeriodDays: a.loan.cycle.gracePeriodDays ?? GRACE_PERIOD_DAYS,
          graceDeadline: a.graceDeadline,
          ratePerHeadPerDay: a.loan.cycle.penaltyRate.toString(),
          pendingSubmittedAt: asOf,
        });
        penalty = effectivePenaltyAmount(fee.penaltyAmount, waived).toFixed(2);
      }

      return loanWaterfallObligation({
        id: a.id,
        label: `Installment #${a.installmentNumber}`,
        penaltyAmount: penalty,
        interestComponent: a.interestComponent.toString(),
        principalComponent: a.principalComponent.toString(),
        amountPaid: a.amountPaid.toString(),
      });
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  const plan = planPaymentWaterfall(params.amount, obligations);
  const lines = formatWaterfallPreview(plan);
  return {
    lines,
    primaryTargetId: plan.primaryTargetId,
    summary: lines.length > 0 ? lines.join("\n") : null,
  };
}

/** @deprecated Use planSubmissionAllocation — kept for call-site clarity. */
export async function planSubmissionAllocationLines(params: {
  userId: string;
  amount: string;
  targetType: "CONTRIBUTION" | "LOAN_AMORTIZATION";
  paidAt: Date;
}): Promise<string[]> {
  const plan = await planSubmissionAllocation(params);
  return plan.lines;
}
