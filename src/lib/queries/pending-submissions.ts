import { prisma } from "@/lib/db";
import { formatPHP, remainingDues } from "@/lib/finance/loan-calculator";
import {
  computeLiveLateFee,
  effectivePenaltyAmount,
  formatLateFeeBreakdown,
  GRACE_PERIOD_DAYS,
} from "@/lib/finance/cpe-policy";
import { remainingContributionDues } from "@/lib/finance/payment-allocation";

export type VerifyQueueItem = {
  id: string;
  memberName: string;
  memberEmail: string;
  memberHeadsCount: number;
  targetType: "CONTRIBUTION" | "LOAN_AMORTIZATION";
  targetLabel: string;
  amount: number;
  amountLabel: string;
  paymentChannel: "GCASH" | "MAYA" | "BANK_TRANSFER" | "OTHER_DIGITAL" | "CASH";
  referenceNumber: string;
  receiptStoragePath: string | null;
  receiptSignedUrl: string | null;
  /** Member-declared payment calendar date (ISO). */
  paidAt: string;
  status: "PENDING_VERIFICATION";
  submittedAt: string;
  remarks: string | null;
  aiExtractedAmount: number | null;
  aiExtractedRefNo: string | null;
  aiExtractedChannel:
    | "GCASH"
    | "MAYA"
    | "BANK_TRANSFER"
    | "OTHER_DIGITAL"
    | "CASH"
    | null;
  aiConfidenceNote: string | null;
  /** CPE Rule #3 verification fields */
  dueDate: string | null;
  graceDeadline: string | null;
  headsSnapshot: number | null;
  daysDelayed: number;
  penaltyAmount: number;
  lateFeeBreakdown: string;
  isWithinGrace: boolean;
  isOverdue: boolean;
  isCatchUp: boolean;
  penaltyFrozenAtSubmit: boolean;
  penaltyAccrualFrozen: boolean;
  gracePeriodDays: number;
  penaltyRatePerHeadPerDay: string;
  /** Obligation remaining at freeze (base + late). */
  obligationBaseRemaining: number | null;
  obligationTotalRemaining: number | null;
  contributionId: string | null;
  loanAmortizationId: string | null;
};

function contributionLabel(periodMonth: Date, kinsenaIndex: number): string {
  const month = periodMonth.toLocaleDateString("en-PH", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const kinsena = kinsenaIndex === 1 ? "15th" : "30th";
  return `${month} ${kinsena} Contribution`;
}

/**
 * Loads PENDING_VERIFICATION submissions for the treasurer queue.
 * Attaches CPE grace / late-fee verification frozen at submittedAt,
 * with catch-up due anchoring.
 */
export async function getPendingVerificationQueue(): Promise<VerifyQueueItem[]> {
  const rows = await prisma.paymentSubmission.findMany({
    where: { status: "PENDING_VERIFICATION" },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { name: true, email: true, headsCount: true } },
      contribution: {
        select: {
          id: true,
          periodMonth: true,
          kinsenaIndex: true,
          dueDate: true,
          graceDeadline: true,
          headsSnapshot: true,
          amountDue: true,
          amountPaid: true,
          penaltyAmount: true,
          penaltyWaivedAmount: true,
          penaltyAccrualFrozen: true,
          daysDelayed: true,
          createdAt: true,
          cycle: { select: { gracePeriodDays: true, penaltyRate: true } },
        },
      },
      loanAmortization: {
        select: {
          id: true,
          installmentNumber: true,
          dueDate: true,
          graceDeadline: true,
          headsSnapshot: true,
          principalComponent: true,
          interestComponent: true,
          amountPaid: true,
          penaltyAmount: true,
          penaltyWaivedAmount: true,
          penaltyAccrualFrozen: true,
          daysDelayed: true,
          createdAt: true,
          loan: {
            select: {
              id: true,
              headsSnapshot: true,
              cycle: { select: { gracePeriodDays: true, penaltyRate: true } },
            },
          },
        },
      },
    },
  });

  return rows.map((row) => {
    let targetLabel = "Payment";
    let dueDate: Date | null = null;
    let graceDeadline: Date | null = null;
    let headsSnapshot: number | null = null;
    let gracePeriodDays = GRACE_PERIOD_DAYS;
    let ratePerHeadPerDay: string = "10";
    let penaltyAccrualFrozen = false;
    let storedPenalty = 0;
    let waived = 0;
    let storedDays = 0;
    let openedAt: Date | null = null;
    let contributionId: string | null = null;
    let loanAmortizationId: string | null = null;
    let obligationBaseRemaining: number | null = null;
    let obligationTotalRemaining: number | null = null;

    if (row.targetType === "CONTRIBUTION" && row.contribution) {
      targetLabel = contributionLabel(
        row.contribution.periodMonth,
        row.contribution.kinsenaIndex,
      );
      dueDate = row.contribution.dueDate;
      graceDeadline = row.contribution.graceDeadline;
      headsSnapshot = row.contribution.headsSnapshot;
      gracePeriodDays = row.contribution.cycle.gracePeriodDays;
      ratePerHeadPerDay = row.contribution.cycle.penaltyRate.toString();
      penaltyAccrualFrozen = Boolean(row.contribution.penaltyAccrualFrozen);
      storedPenalty = Number(row.contribution.penaltyAmount.toString());
      waived = Number(row.contribution.penaltyWaivedAmount?.toString() ?? "0");
      storedDays = row.contribution.daysDelayed;
      openedAt = row.contribution.createdAt;
      contributionId = row.contribution.id;
    } else if (row.targetType === "LOAN_AMORTIZATION" && row.loanAmortization) {
      targetLabel = `Loan · Installment #${row.loanAmortization.installmentNumber}`;
      dueDate = row.loanAmortization.dueDate;
      graceDeadline = row.loanAmortization.graceDeadline;
      headsSnapshot =
        row.loanAmortization.headsSnapshot ||
        row.loanAmortization.loan.headsSnapshot;
      gracePeriodDays = row.loanAmortization.loan.cycle.gracePeriodDays;
      ratePerHeadPerDay =
        row.loanAmortization.loan.cycle.penaltyRate.toString();
      penaltyAccrualFrozen = Boolean(row.loanAmortization.penaltyAccrualFrozen);
      storedPenalty = Number(row.loanAmortization.penaltyAmount.toString());
      waived = Number(
        row.loanAmortization.penaltyWaivedAmount?.toString() ?? "0",
      );
      storedDays = row.loanAmortization.daysDelayed;
      openedAt = row.loanAmortization.createdAt;
      loanAmortizationId = row.loanAmortization.id;
    }

    let daysDelayed = 0;
    let penaltyAmount = 0;
    let lateFeeBreakdown = "No obligation due date on this submission.";
    let isWithinGrace = false;
    let isOverdue = false;
    let isCatchUp = false;

    if (dueDate && headsSnapshot != null && openedAt) {
      if (penaltyAccrualFrozen) {
        daysDelayed = storedDays;
        penaltyAmount = Math.max(0, storedPenalty - waived);
        lateFeeBreakdown = "Pass granted — late fee waived / frozen.";
      } else {
        const fee = computeLiveLateFee({
          dueDate,
          openedAt,
          headsCount: headsSnapshot,
          now: row.createdAt,
          gracePeriodDays,
          ratePerHeadPerDay,
          pendingSubmittedAt: row.createdAt,
        });
        daysDelayed = fee.chargeableDays;
        penaltyAmount = Number(
          effectivePenaltyAmount(fee.penaltyAmount, waived).toFixed(2),
        );
        isCatchUp = fee.isCatchUp;
        lateFeeBreakdown =
          fee.isCatchUp && fee.chargeableDays === 0
            ? "Catch-up open — late fees freeze from submit; accrual is from open day, not the original due date."
            : formatLateFeeBreakdown(fee);
        isWithinGrace = fee.isWithinGrace;
        isOverdue = fee.isOverdue;
      }
    }

    if (row.contribution) {
      const dues = remainingContributionDues({
        amountDue: row.contribution.amountDue.toString(),
        amountPaid: row.contribution.amountPaid.toString(),
        penaltyAmount,
        penaltyWaivedAmount: 0,
      });
      obligationBaseRemaining = Number(dues.principalDue.toFixed(2));
      obligationTotalRemaining = Number(dues.totalDue.toFixed(2));
    } else if (row.loanAmortization) {
      const dues = remainingDues({
        penaltyAmount,
        interestComponent: row.loanAmortization.interestComponent.toString(),
        principalComponent: row.loanAmortization.principalComponent.toString(),
        amountPaid: row.loanAmortization.amountPaid.toString(),
      });
      obligationBaseRemaining = Number(
        dues.interestDue.plus(dues.principalDue).toFixed(2),
      );
      obligationTotalRemaining = Number(dues.totalDue.toFixed(2));
    }

    const amount = Number(row.amount.toString());

    return {
      id: row.id,
      memberName: row.user.name,
      memberEmail: row.user.email ?? "—",
      memberHeadsCount: row.user.headsCount,
      targetType: row.targetType,
      targetLabel,
      amount,
      amountLabel: formatPHP(amount),
      paymentChannel: row.paymentChannel,
      referenceNumber: row.referenceNumber,
      receiptStoragePath: row.receiptUrl,
      receiptSignedUrl: null,
      paidAt: row.paidAt.toISOString(),
      status: "PENDING_VERIFICATION" as const,
      submittedAt: row.createdAt.toISOString(),
      remarks: row.remarks,
      aiExtractedAmount:
        row.aiExtractedAmount != null
          ? Number(row.aiExtractedAmount.toString())
          : null,
      aiExtractedRefNo: row.aiExtractedRefNo,
      aiExtractedChannel: row.aiExtractedChannel,
      aiConfidenceNote: row.aiConfidenceNote,
      dueDate: dueDate?.toISOString() ?? null,
      graceDeadline: graceDeadline?.toISOString() ?? null,
      headsSnapshot,
      daysDelayed,
      penaltyAmount,
      lateFeeBreakdown,
      isWithinGrace,
      isOverdue,
      isCatchUp,
      penaltyFrozenAtSubmit: true,
      penaltyAccrualFrozen,
      gracePeriodDays,
      penaltyRatePerHeadPerDay: ratePerHeadPerDay,
      obligationBaseRemaining,
      obligationTotalRemaining,
      contributionId,
      loanAmortizationId,
    };
  });
}
