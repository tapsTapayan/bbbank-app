import { requirePageUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { AuditWorkspace, type AuditQueueItem } from "./audit-workspace";

export const instant = false;

export default async function AuditPage() {
  await requirePageUser(["AUDITOR"], "/audit");

  const rows = await prisma.paymentSubmission.findMany({
    where: { status: "VERIFIED" },
    orderBy: { verifiedAt: "asc" },
    include: {
      user: { select: { name: true } },
      contribution: {
        select: { periodMonth: true, kinsenaIndex: true },
      },
      loanAmortization: { select: { installmentNumber: true } },
    },
  });

  const queue: AuditQueueItem[] = rows.map((row) => {
    let targetLabel = "Payment";
    if (row.contribution) {
      const k = row.contribution.kinsenaIndex === 1 ? "15th" : "30th";
      targetLabel = `${row.contribution.periodMonth.toLocaleDateString("en-PH", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })} ${k} contribution`;
    } else if (row.loanAmortization) {
      targetLabel = `Loan installment #${row.loanAmortization.installmentNumber}`;
    }
    return {
      id: row.id,
      memberName: row.user.name,
      targetLabel,
      amount: Number(row.amount.toString()),
      referenceNumber: row.referenceNumber,
      paymentChannel: row.paymentChannel,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      receiptStoragePath: row.receiptUrl,
    };
  });

  return <AuditWorkspace queue={queue} />;
}
