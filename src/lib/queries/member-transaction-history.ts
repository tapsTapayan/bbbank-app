import { prisma } from "@/lib/db";
import { formatPHP } from "@/lib/finance/loan-calculator";
import { formatKinsenaDueLabel } from "@/lib/finance/cpe-policy";
import type { PaymentPillStatus } from "@/lib/finance/status-labels";

export type HistoryEventKind =
  | "PAYMENT_SUBMITTED"
  | "PAYMENT_VERIFIED"
  | "PAYMENT_REJECTED"
  | "PAYMENT_AUDITED"
  | "PAYMENT_FLAGGED"
  | "LOAN_REQUESTED"
  | "LOAN_APPROVED"
  | "LOAN_RELEASED"
  | "LOAN_REJECTED";

export type MemberHistoryEvent = {
  id: string;
  kind: HistoryEventKind;
  at: string;
  title: string;
  detail: string;
  amount: number | null;
  amountLabel: string | null;
  tone: "neutral" | "pending" | "success" | "danger" | "brand";
  pill: PaymentPillStatus | null;
  pillLabel: string | null;
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

function paymentTargetLabel(row: {
  targetType: "CONTRIBUTION" | "LOAN_AMORTIZATION";
  contribution: { dueDate: Date } | null;
  loanAmortization: { installmentNumber: number } | null;
}): string {
  if (row.targetType === "CONTRIBUTION" && row.contribution) {
    return `${formatKinsenaDueLabel(row.contribution.dueDate)} contribution`;
  }
  if (row.targetType === "LOAN_AMORTIZATION" && row.loanAmortization) {
    return `Loan installment #${row.loanAmortization.installmentNumber}`;
  }
  return row.targetType === "CONTRIBUTION" ? "Contribution" : "Loan payment";
}

/**
 * Member-facing activity timeline: payment submissions & reviews,
 * plus loan request / approval / release / rejection.
 */
export async function getMemberTransactionHistory(
  userId: string,
  limit = 120,
): Promise<MemberHistoryEvent[]> {
  const [payments, loans] = await Promise.all([
    prisma.paymentSubmission.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: {
        contribution: { select: { dueDate: true } },
        loanAmortization: { select: { installmentNumber: true } },
        verifiedBy: { select: { name: true } },
        auditedBy: { select: { name: true } },
      },
    }),
    prisma.loan.findMany({
      where: { borrowerId: userId },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        principalAmount: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        disbursedAt: true,
        approvedById: true,
        approvedBy: { select: { name: true } },
      },
    }),
  ]);

  const events: MemberHistoryEvent[] = [];

  for (const row of payments) {
    const amount = Number(row.amount.toString());
    const amountLabel = formatPHP(amount);
    const target = paymentTargetLabel(row);
    const channel = channelLabel(row.paymentChannel);
    const paidAtLabel = row.paidAt.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });

    events.push({
      id: `pay-submit-${row.id}`,
      kind: "PAYMENT_SUBMITTED",
      at: row.createdAt.toISOString(),
      title: "Payment submitted",
      detail: `${target} · ${channel} · paid ${paidAtLabel} · ref ${row.referenceNumber}`,
      amount,
      amountLabel,
      tone: "pending",
      pill: "PENDING",
      pillLabel: "Submitted",
    });

    if (row.verifiedAt) {
      const rejected = row.status === "REJECTED";
      const verifier = row.verifiedBy?.name
        ? ` by ${row.verifiedBy.name}`
        : "";
      events.push({
        id: `pay-verify-${row.id}`,
        kind: rejected ? "PAYMENT_REJECTED" : "PAYMENT_VERIFIED",
        at: row.verifiedAt.toISOString(),
        title: rejected ? "Payment rejected" : "Payment verified",
        detail: rejected
          ? `${target}${verifier}${row.remarks ? ` · ${row.remarks}` : ""}`
          : `${target}${verifier} · posted to ledger`,
        amount,
        amountLabel,
        tone: rejected ? "danger" : "success",
        pill: rejected ? "REJECTED" : "VERIFIED",
        pillLabel: rejected ? "Rejected" : "Verified",
      });
    }

    if (row.auditedAt) {
      const flagged = row.status === "FLAGGED";
      const auditor = row.auditedBy?.name ? ` by ${row.auditedBy.name}` : "";
      events.push({
        id: `pay-audit-${row.id}`,
        kind: flagged ? "PAYMENT_FLAGGED" : "PAYMENT_AUDITED",
        at: row.auditedAt.toISOString(),
        title: flagged ? "Payment flagged" : "Payment audited",
        detail: `${target}${auditor}`,
        amount,
        amountLabel,
        tone: flagged ? "danger" : "brand",
        pill: flagged ? "FLAGGED" : "AUDITED",
        pillLabel: flagged ? "Flagged" : "Audited",
      });
    }
  }

  for (const loan of loans) {
    const principal = Number(loan.principalAmount.toString());
    const principalLabel = formatPHP(principal);

    events.push({
      id: `loan-req-${loan.id}`,
      kind: "LOAN_REQUESTED",
      at: loan.createdAt.toISOString(),
      title: "Loan requested",
      detail: `${principalLabel} principal · awaiting treasurer review`,
      amount: principal,
      amountLabel: principalLabel,
      tone: "pending",
      pill: "PENDING",
      pillLabel: "Requested",
    });

    if (loan.status === "REJECTED") {
      events.push({
        id: `loan-rej-${loan.id}`,
        kind: "LOAN_REJECTED",
        at: loan.updatedAt.toISOString(),
        title: "Loan rejected",
        detail: `${principalLabel} request was not approved`,
        amount: principal,
        amountLabel: principalLabel,
        tone: "danger",
        pill: "REJECTED",
        pillLabel: "Rejected",
      });
      continue;
    }

    const approver = loan.approvedBy?.name
      ? ` by ${loan.approvedBy.name}`
      : "";

    if (loan.disbursedAt) {
      // Approval time is not stored separately — release covers approved + disbursed.
      events.push({
        id: `loan-out-${loan.id}`,
        kind: "LOAN_RELEASED",
        at: loan.disbursedAt.toISOString(),
        title: "Loan approved & released",
        detail: `${principalLabel} disbursed to member${approver}`,
        amount: principal,
        amountLabel: principalLabel,
        tone: "success",
        pill: "VERIFIED",
        pillLabel: "Released",
      });
    } else if (
      loan.approvedById &&
      (loan.status === "APPROVED" || loan.status === "ACTIVE")
    ) {
      events.push({
        id: `loan-apr-${loan.id}`,
        kind: "LOAN_APPROVED",
        at: loan.updatedAt.toISOString(),
        title: "Loan approved",
        detail: `${principalLabel} approved${approver} · pending release`,
        amount: principal,
        amountLabel: principalLabel,
        tone: "brand",
        pill: "AUDITED",
        pillLabel: "Approved",
      });
    }
  }

  events.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );

  return events.slice(0, limit);
}
