import { prisma } from "@/lib/db";
import { formatPHP } from "@/lib/finance/loan-calculator";
import { formatKinsenaPeriodScope } from "@/lib/finance/cpe-policy";
import {
  formatPaymentScopeTitle,
  parseAllocationScopeLabels,
  parseAllocationSummary,
} from "@/lib/finance/payment-scope";
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
  /** Period-scoped allocation lines (planned on submit / posted on verify). */
  allocations: string[];
  /**
   * PaymentSubmission id for PAYMENT_SUBMITTED rows.
   * Members may edit or cancel/delete while canCancel is true (awaiting review).
   */
  submissionId: string | null;
  /** True only for Submitted / PENDING_VERIFICATION — not a reviewed record. */
  canCancel: boolean;
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
  contribution: { dueDate: Date; kinsenaIndex: number } | null;
  loanAmortization: { installmentNumber: number } | null;
}): string {
  if (row.targetType === "CONTRIBUTION" && row.contribution) {
    return `${formatKinsenaPeriodScope(
      row.contribution.dueDate,
      row.contribution.kinsenaIndex === 2 ? 2 : 1,
    )} contribution`;
  }
  if (row.targetType === "LOAN_AMORTIZATION" && row.loanAmortization) {
    return `Loan installment #${row.loanAmortization.installmentNumber}`;
  }
  return row.targetType === "CONTRIBUTION" ? "Contribution" : "Loan payment";
}

/** Fallback title when allocation lines are missing. */
function paymentPeriodTitle(row: {
  targetType: "CONTRIBUTION" | "LOAN_AMORTIZATION";
  contribution: {
    periodMonth: Date;
    kinsenaIndex: number;
    dueDate: Date;
  } | null;
  loanAmortization: { installmentNumber: number } | null;
}): string {
  if (row.targetType === "CONTRIBUTION" && row.contribution) {
    return `${formatKinsenaPeriodScope(
      row.contribution.dueDate,
      row.contribution.kinsenaIndex === 2 ? 2 : 1,
    )} payment`;
  }
  if (row.targetType === "LOAN_AMORTIZATION" && row.loanAmortization) {
    return `Installment #${row.loanAmortization.installmentNumber} payment`;
  }
  return row.targetType === "CONTRIBUTION"
    ? "Contribution payment"
    : "Loan payment";
}

/** Build allocation lines from ledger when summary is missing (legacy verifies). */
function allocationsFromLedger(
  entries: ReadonlyArray<{ amount: { toString(): string }; description: string }>,
): string[] {
  return entries.map((e) => {
    const amt = formatPHP(e.amount.toString());
    const scope = e.description.replace(/\s·\sref\s+\S+$/i, "").trim();
    return `${amt} → ${scope}`;
  });
}

function scopeTitle(allocations: string[], fallback: string): string {
  return formatPaymentScopeTitle(
    parseAllocationScopeLabels(allocations),
    fallback,
  );
}

/**
 * Member-facing activity timeline: payment submissions & reviews,
 * plus loan request / approval / release / rejection.
 * Titles and allocations reflect oldest-first period scope.
 */
export async function getMemberTransactionHistory(
  userId: string,
  limit = 80,
): Promise<MemberHistoryEvent[]> {
  const [payments, loans] = await Promise.all([
    prisma.paymentSubmission.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        amount: true,
        status: true,
        targetType: true,
        paymentChannel: true,
        referenceNumber: true,
        paidAt: true,
        createdAt: true,
        verifiedAt: true,
        auditedAt: true,
        remarks: true,
        allocationSummary: true,
        contribution: {
          select: { dueDate: true, periodMonth: true, kinsenaIndex: true },
        },
        loanAmortization: { select: { installmentNumber: true } },
        verifiedBy: { select: { name: true } },
        auditedBy: { select: { name: true } },
        // Only needed when allocationSummary is missing (legacy verifies).
        ledgerEntries: {
          orderBy: { createdAt: "asc" },
          select: { amount: true, description: true },
        },
      },
    }),
    prisma.loan.findMany({
      where: { borrowerId: userId },
      orderBy: { createdAt: "desc" },
      take: 25,
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
    const fallbackTitle = paymentPeriodTitle(row);

    const storedAlloc = parseAllocationSummary(row.allocationSummary);
    // Prefer stored scope from submit/verify. Fall back to ledger lines for
    // legacy verifies — never plan+write on the history read path.
    const ledgerAlloc =
      storedAlloc.length > 0
        ? storedAlloc
        : allocationsFromLedger(row.ledgerEntries);

    const submitAllocations = storedAlloc;

    // Submitted = not yet reviewed. Members may edit or cancel until treasurer acts.
    const awaitingReview = row.status === "PENDING_VERIFICATION";
    events.push({
      id: `pay-submit-${row.id}`,
      kind: "PAYMENT_SUBMITTED",
      at: row.createdAt.toISOString(),
      title: scopeTitle(submitAllocations, fallbackTitle),
      detail: `${channel} · paid ${paidAtLabel} · ref ${row.referenceNumber} · ${
        row.targetType === "CONTRIBUTION" ? "Contributions" : "Loan repayments"
      } bucket`,
      amount,
      amountLabel,
      tone: awaitingReview ? "pending" : "neutral",
      pill: awaitingReview ? "PENDING" : null,
      pillLabel: awaitingReview ? "Submitted" : "Filed",
      allocations: submitAllocations,
      // Always pass id on submit events; cancel only when still awaiting review.
      submissionId: row.id,
      canCancel: awaitingReview,
    });

    if (row.verifiedAt) {
      const rejected = row.status === "REJECTED";
      const verifier = row.verifiedBy?.name
        ? ` by ${row.verifiedBy.name}`
        : "";
      const verifyAllocations = rejected ? [] : ledgerAlloc;
      events.push({
        id: `pay-verify-${row.id}`,
        kind: rejected ? "PAYMENT_REJECTED" : "PAYMENT_VERIFIED",
        at: row.verifiedAt.toISOString(),
        title: rejected
          ? scopeTitle(submitAllocations, "Payment rejected")
          : scopeTitle(verifyAllocations, fallbackTitle),
        detail: rejected
          ? `${target}${verifier}${row.remarks ? ` · ${row.remarks}` : ""}`
          : `${verifier ? verifier.trim() : "Posted"} · oldest dues first`,
        amount,
        amountLabel,
        tone: rejected ? "danger" : "success",
        pill: rejected ? "REJECTED" : "VERIFIED",
        pillLabel: rejected ? "Rejected" : "Verified",
        allocations: verifyAllocations,
        submissionId: null,
        canCancel: false,
      });
    }

    if (row.auditedAt) {
      const flagged = row.status === "FLAGGED";
      const auditor = row.auditedBy?.name ? ` by ${row.auditedBy.name}` : "";
      events.push({
        id: `pay-audit-${row.id}`,
        kind: flagged ? "PAYMENT_FLAGGED" : "PAYMENT_AUDITED",
        at: row.auditedAt.toISOString(),
        title: flagged
          ? scopeTitle(ledgerAlloc, "Payment flagged")
          : scopeTitle(ledgerAlloc, "Payment audited"),
        detail: `${target}${auditor}`,
        amount,
        amountLabel,
        tone: flagged ? "danger" : "brand",
        pill: flagged ? "FLAGGED" : "AUDITED",
        pillLabel: flagged ? "Flagged" : "Audited",
        allocations: flagged ? [] : ledgerAlloc,
        submissionId: null,
        canCancel: false,
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
      allocations: [],
      submissionId: null,
      canCancel: false,
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
        allocations: [],
        submissionId: null,
        canCancel: false,
      });
      continue;
    }

    const approver = loan.approvedBy?.name
      ? ` by ${loan.approvedBy.name}`
      : "";

    if (loan.disbursedAt) {
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
        allocations: [],
        submissionId: null,
        canCancel: false,
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
        allocations: [],
        submissionId: null,
        canCancel: false,
      });
    }
  }

  events.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );

  return events.slice(0, limit);
}
