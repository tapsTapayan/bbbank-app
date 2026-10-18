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
  referenceNumber: string;
  submittedAt: string;
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

/** Unreviewed payment proofs the member may cancel. */
export async function getMemberPendingSubmissions(
  userId: string,
): Promise<MemberPendingSubmission[]> {
  const rows = await prisma.paymentSubmission.findMany({
    where: { userId, status: "PENDING_VERIFICATION" },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      contribution: {
        select: { dueDate: true, kinsenaIndex: true },
      },
      loanAmortization: { select: { installmentNumber: true } },
    },
  });

  return rows.map((row) => {
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
    return {
      id: row.id,
      label: formatPaymentScopeLabel(
        parseAllocationScopeLabels(allocations),
        fallback,
      ),
      amount,
      amountLabel: formatPHP(amount),
      channelLabel: channelLabel(row.paymentChannel),
      referenceNumber: row.referenceNumber,
      submittedAt: row.createdAt.toISOString(),
      paidAt: row.paidAt.toISOString(),
    };
  });
}
