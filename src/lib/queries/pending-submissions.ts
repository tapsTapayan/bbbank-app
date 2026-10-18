import { prisma } from "@/lib/db";
import { formatPHP } from "@/lib/finance/loan-calculator";

export type VerifyQueueItem = {
  id: string;
  memberName: string;
  memberEmail: string;
  targetType: "CONTRIBUTION" | "LOAN_AMORTIZATION";
  targetLabel: string;
  amount: number;
  amountLabel: string;
  paymentChannel: "GCASH" | "MAYA" | "BANK_TRANSFER" | "CASH";
  referenceNumber: string;
  receiptStoragePath: string;
  receiptSignedUrl: string | null;
  status: "PENDING_VERIFICATION";
  submittedAt: string;
  remarks: string | null;
};

function contributionLabel(periodMonth: Date): string {
  return (
    periodMonth.toLocaleDateString("en-PH", {
      month: "short",
      year: "numeric",
    }) + " Contribution"
  );
}

/**
 * Loads PENDING_VERIFICATION submissions for the treasurer queue.
 * Signed receipt URLs are fetched on demand via `fetchReceiptSignedUrl`.
 */
export async function getPendingVerificationQueue(): Promise<VerifyQueueItem[]> {
  const rows = await prisma.paymentSubmission.findMany({
    where: { status: "PENDING_VERIFICATION" },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { name: true, email: true } },
      contribution: { select: { periodMonth: true } },
      loanAmortization: {
        select: {
          installmentNumber: true,
          loan: { select: { id: true } },
        },
      },
    },
  });

  return rows.map((row) => {
    let targetLabel = "Payment";
    if (row.targetType === "CONTRIBUTION" && row.contribution) {
      targetLabel = contributionLabel(row.contribution.periodMonth);
    } else if (row.targetType === "LOAN_AMORTIZATION" && row.loanAmortization) {
      targetLabel = `Loan · Installment #${row.loanAmortization.installmentNumber}`;
    }

    const amount = Number(row.amount.toString());

    return {
      id: row.id,
      memberName: row.user.name,
      memberEmail: row.user.email,
      targetType: row.targetType,
      targetLabel,
      amount,
      amountLabel: formatPHP(amount),
      paymentChannel: row.paymentChannel,
      referenceNumber: row.referenceNumber,
      receiptStoragePath: row.receiptUrl,
      receiptSignedUrl: null,
      status: "PENDING_VERIFICATION" as const,
      submittedAt: row.createdAt.toISOString(),
      remarks: row.remarks,
    };
  });
}
