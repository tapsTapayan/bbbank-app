import { prisma } from "@/lib/db";
import { formatPHP } from "@/lib/finance/loan-calculator";
import { formatKinsenaPeriodScope } from "@/lib/finance/cpe-policy";
import {
  formatPaymentScopeLabel,
  parseAllocationScopeLabels,
  parseAllocationSummary,
} from "@/lib/finance/payment-scope";

export type MemberPendingSubmission = {
  id: string;
  label: string;
  amount: number;
  amountLabel: string;
  channelLabel: string;
  paymentChannel:
    | "GCASH"
    | "MAYA"
    | "BANK_TRANSFER"
    | "OTHER_DIGITAL"
    | "CASH";
  referenceNumber: string;
  receiptUrl: string | null;
  targetType: "CONTRIBUTION" | "LOAN_AMORTIZATION";
  /** Contribution or loan amortization id used as the form period. */
  targetId: string;
  /** Fund cycle for receipt storage path. */
  cycleId: string;
  submittedAt: string;
  /** YYYY-MM-DD for the pay form date input. */
  paidAt: string;
};

function channelLabel(channel: string): string {
  switch (channel) {
    case "GCASH":
      return "GCash";
    case "MAYA":
      return "Maya";
    case "BANK_TRANSFER":
      return "Bank transfer";
    case "OTHER_DIGITAL":
      return "Digital";
    case "CASH":
      return "Cash";
    default:
      return channel.replaceAll("_", " ");
  }
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Unreviewed payment proofs the member may edit or cancel. */
export async function getMemberPendingSubmissions(
  userId: string,
): Promise<MemberPendingSubmission[]> {
  const rows = await prisma.paymentSubmission.findMany({
    where: { userId, status: "PENDING_VERIFICATION" },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      contribution: {
        select: { dueDate: true, kinsenaIndex: true, cycleId: true },
      },
      loanAmortization: {
        select: {
          installmentNumber: true,
          loan: { select: { cycleId: true } },
        },
      },
    },
  });

  return rows.flatMap((row) => {
    const targetId =
      row.targetType === "CONTRIBUTION"
        ? row.contributionId
        : row.loanAmortizationId;
    const cycleId =
      row.targetType === "CONTRIBUTION"
        ? row.contribution?.cycleId
        : row.loanAmortization?.loan.cycleId;
    if (!targetId || !cycleId) return [];

    const allocations = parseAllocationSummary(row.allocationSummary);
    const fallback =
      row.targetType === "CONTRIBUTION" && row.contribution
        ? formatKinsenaPeriodScope(
            row.contribution.dueDate,
            row.contribution.kinsenaIndex === 2 ? 2 : 1,
          )
        : row.targetType === "LOAN_AMORTIZATION" && row.loanAmortization
          ? `Installment #${row.loanAmortization.installmentNumber}`
          : row.targetType === "CONTRIBUTION"
            ? "Contribution"
            : "Loan payment";

    const amount = Number(row.amount.toString());
    return [
      {
        id: row.id,
        label: formatPaymentScopeLabel(
          parseAllocationScopeLabels(allocations),
          fallback,
        ),
        amount,
        amountLabel: formatPHP(amount),
        channelLabel: channelLabel(row.paymentChannel),
        paymentChannel: row.paymentChannel,
        referenceNumber: row.referenceNumber,
        receiptUrl: row.receiptUrl,
        targetType: row.targetType,
        targetId,
        cycleId,
        submittedAt: row.createdAt.toISOString(),
        paidAt: toIsoDate(row.paidAt),
      },
    ];
  });
}
