"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronRight, ArrowRight, CalendarClock } from "lucide-react";
import { cancelPaymentSubmission } from "@/actions/payment-submission";
import { formatPHP } from "@/lib/finance/loan-calculator";
import {
  formatUtcDate,
  graceDeadlineCaption,
  type PaymentPillStatus,
} from "@/lib/finance/status-labels";
import type { PaymentTargetOption } from "@/lib/queries/member-payment-targets";
import type { MemberKinsenasYearMap } from "@/lib/queries/member-kinsenas-year";
import { KinsenasYearMap } from "@/components/finance/kinsenas-year-map";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { Money } from "@/components/ui/money";
import { FundCanvas } from "@/components/system/frames/fund-canvas";

export type DashboardRecentPayment = {
  id: string;
  label: string;
  amount: number;
  status: PaymentPillStatus;
  date: string;
  /** Period-scoped allocation lines (planned on submit / posted on verify). */
  allocations: string[];
  /** True while awaiting treasurer review — member may withdraw the proof. */
  canCancel: boolean;
};

export type NextKinsenasObligation = {
  kinsenaIndex: number;
  periodLabel: string;
  dueDate: string;
  graceDeadline: string;
  amountDue: number;
  penaltyAmount: number;
  daysDelayed: number;
  lateFeeBreakdown: string;
  isWithinGrace: boolean;
  isOverdue: boolean;
  isCatchUp: boolean;
  status: string;
  headsSnapshot: number;
  penaltyAccrualFrozen: boolean;
  pendingFreeze: boolean;
};

export type MemberDashboardData = {
  userId: string;
  memberName: string;
  memberEmail: string;
  headsCount: number;
  memberStatus: string;
  prepaidCredit: number;
  kinsenasDue: number;
  monthlyDue: number;
  /** Verified CONTRIBUTION_IN ledger total. */
  totalContributions: number;
  /** Member interest share (pro-rata heads × cycle INTEREST_INCOME_IN). */
  interestEarnings: number;
  /** contributions + interest earnings (year-end fund position). */
  yearEndFund: number;
  activeLoanBalance: number;
  nextKinsenas: NextKinsenasObligation | null;
  nextAmortization: {
    installmentNumber: number;
    dueDate: string;
    graceDeadline: string;
    amountDue: number;
    penaltyAmount: number;
    daysDelayed: number;
    lateFeeBreakdown: string;
    loanLabel: string;
  } | null;
  recentPayments: DashboardRecentPayment[];
  paymentTargets: PaymentTargetOption[];
  kinsenasYearMap: MemberKinsenasYearMap | null;
};

type DuesTone = "pending" | "late" | "catchup" | "grace" | "due" | "clear";

/** Aggregate tone from all open obligations — not just the next period. */
function duesTone(
  targets: PaymentTargetOption[],
  next: NextKinsenasObligation | null,
): { tone: DuesTone; label: string } {
  if (targets.length === 0 && !next) {
    return { tone: "clear", label: "Clear" };
  }

  const overdueCount = targets.filter((t) => t.isOverdue).length;
  const pending =
    Boolean(next?.pendingFreeze) ||
    targets.some((t) => t.penaltyAccrualFrozen);
  const anyPenalty = targets.some((t) => Number(t.penaltyAmount) > 0);
  const anyGrace = targets.some((t) => t.isWithinGrace && !t.isOverdue);
  const anyCatchUp = targets.some((t) => t.isCatchUp);

  if (pending) {
    return { tone: "pending", label: "Pending verification" };
  }
  if (overdueCount > 0 || anyPenalty || next?.isOverdue) {
    const n = overdueCount || (next?.isOverdue ? 1 : 0);
    return {
      tone: "late",
      label: n > 1 ? `${n} overdue` : "Overdue",
    };
  }
  if (anyCatchUp || next?.isCatchUp) {
    return { tone: "catchup", label: "Catch-up" };
  }
  if (anyGrace || next?.isWithinGrace) {
    return { tone: "grace", label: "Grace period" };
  }
  return { tone: "due", label: "Due soon" };
}

export function MemberDashboardClient({ data }: { data: MemberDashboardData }) {
  const router = useRouter();
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, startCancel] = useTransition();

  const {
    memberName,
    headsCount,
    prepaidCredit,
    kinsenasDue,
    monthlyDue,
    totalContributions,
    interestEarnings,
    yearEndFund,
    activeLoanBalance,
    nextKinsenas,
    nextAmortization,
    recentPayments,
    paymentTargets,
    kinsenasYearMap,
  } = data;

  function handleCancelPayment(submissionId: string) {
    if (confirmCancelId !== submissionId) {
      setConfirmCancelId(submissionId);
      setCancelError(null);
      return;
    }
    setPendingCancelId(submissionId);
    startCancel(async () => {
      const result = await cancelPaymentSubmission(submissionId);
      setPendingCancelId(null);
      setConfirmCancelId(null);
      if (!result.success) {
        setCancelError(result.error);
        return;
      }
      setCancelError(null);
      router.refresh();
    });
  }

  const firstName = memberName.split(" ")[0] ?? memberName;
  const currentDue = nextKinsenas
    ? nextKinsenas.amountDue + nextKinsenas.penaltyAmount
    : 0;
  const totalOpenDues = paymentTargets.reduce(
    (sum, t) => sum + (Number(t.suggestedAmount) || 0),
    0,
  );
  const openCount = paymentTargets.length;
  const mapOverdue = kinsenasYearMap?.counts.overdue ?? 0;
  const nextTargetId = nextKinsenas
    ? paymentTargets.find(
        (t) =>
          t.targetType === "CONTRIBUTION" &&
          t.dueDate === nextKinsenas.dueDate,
      )?.id
    : undefined;
  const payHref = nextTargetId ? `/pay?target=${nextTargetId}` : "/pay";
  const { tone, label: toneLabel } = duesTone(paymentTargets, nextKinsenas);

  return (
    <FundCanvas>
      <PageHeader
        title={`Welcome, ${firstName}`}
        description={`${headsCount} head${headsCount === 1 ? "" : "s"} · ${formatPHP(kinsenasDue)} / kinsenas · ${formatPHP(monthlyDue)} / month${mapOverdue > 0 ? ` · ${mapOverdue} overdue` : ""}`}
      />

      <div className="rl-dash-grid">
        {/* Primary: Status Summary — top on mobile; desktop grid places ledger under it. */}
        <div className="rl-dash-primary rl-fund-stack">
          <section
            aria-labelledby="next-due-heading"
            className="rl-vault-card"
          >
            {nextKinsenas ? (
              <div className="rl-vault-body">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <p
                    className="min-w-0 text-base font-semibold text-white"
                    id="next-due-heading"
                  >
                    Status Summary
                  </p>
                  {tone !== "due" && tone !== "clear" ? (
                    <span
                      className={`rl-vault-badge shrink-0 rl-vault-badge--${
                        tone === "late"
                          ? "late"
                          : tone === "grace" || tone === "pending"
                            ? "grace"
                            : tone === "catchup"
                              ? "catchup"
                              : "default"
                      }`}
                    >
                      {toneLabel}
                    </span>
                  ) : null}
                </div>

                <dl className="rl-vault-meta-grid rl-vault-meta-grid--dues">
                  <div className="rl-vault-meta-item">
                    <dt>Current due</dt>
                    <dd>{formatPHP(currentDue)}</dd>
                    <p className="rl-vault-meta-sub">
                      {nextKinsenas.penaltyAmount > 0
                        ? `${formatPHP(nextKinsenas.amountDue)} + ${formatPHP(nextKinsenas.penaltyAmount)} late`
                        : `${nextKinsenas.headsSnapshot} × ₱250`}
                    </p>
                  </div>
                  <div className="rl-vault-meta-item">
                    <dt>Total open</dt>
                    <dd>{formatPHP(totalOpenDues)}</dd>
                    <p className="rl-vault-meta-sub">
                      {openCount} period{openCount === 1 ? "" : "s"}
                      {mapOverdue > 0 ? ` · ${mapOverdue} overdue` : ""}
                    </p>
                  </div>
                </dl>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <Link
                    href={payHref}
                    className="rl-btn rl-btn-vault rl-btn-lg flex-1 sm:flex-initial"
                  >
                    Pay
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="rl-vault-body">
                <h2 className="text-xl font-bold text-white">
                  No open kinsenas
                </h2>
                <div className="pt-1">
                  <Link href="/pay" className="rl-btn rl-btn-vault">
                    Pay advance
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Year ledger — under Status Summary on mobile; under vault column on desktop. */}
        {kinsenasYearMap ? (
          <div className="rl-dash-ledger">
            <KinsenasYearMap map={kinsenasYearMap} />
          </div>
        ) : null}

        {/* Secondary: KPIs, loan installment, recent payments */}
        <div className="rl-dash-secondary rl-fund-stack">
          <section aria-label="Fund Position">
            <div className="rl-kpi-grid">
              <div className="rl-kpi-card">
                <p className="type-label">Total Contributions</p>
                <div>
                  <p className="rl-kpi-value">
                    {formatPHP(totalContributions)}
                  </p>
                  <p className="type-caption mt-1 tabular-nums">
                    {formatPHP(monthlyDue)} / month
                  </p>
                </div>
              </div>

              <div className="rl-kpi-card">
                <p className="type-label">Year-End Fund</p>
                <div>
                  <p className="rl-kpi-value">{formatPHP(yearEndFund)}</p>
                  <p className="type-caption mt-1 tabular-nums">
                    Contributions
                    {interestEarnings > 0
                      ? ` + ${formatPHP(interestEarnings)} interest`
                      : " + interest"}
                  </p>
                </div>
              </div>

              <div className="rl-kpi-card rl-kpi-card--span">
                <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="type-label">Active Loan</p>
                    <p className="rl-kpi-value mt-2">
                      {formatPHP(activeLoanBalance)}
                    </p>
                  </div>
                  <Link
                    href="/loans"
                    className="type-caption inline-flex shrink-0 items-center gap-0.5 font-semibold text-[var(--brand)] hover:underline"
                  >
                    {activeLoanBalance > 0 ? "View schedule" : "Check eligibility"}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
              </div>

              {prepaidCredit > 0 ? (
                <div className="rl-kpi-card rl-kpi-card--span">
                  <p className="type-label">Prepaid Credit</p>
                  <p className="rl-kpi-value text-[var(--success)]">
                    {formatPHP(prepaidCredit)}
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          {nextAmortization ? (
            <section
              className="rl-section"
              aria-labelledby="loan-installment-heading"
            >
              <Link href="/pay" className="rl-dash-loan-row">
                <span className="rl-dash-loan-icon" aria-hidden>
                  <CalendarClock className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <p
                      className="type-label min-w-0 truncate text-[var(--brand)]"
                      id="loan-installment-heading"
                    >
                      {nextAmortization.loanLabel} · Installment #
                      {nextAmortization.installmentNumber}
                    </p>
                    <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-[var(--ink)]">
                      <Money amount={nextAmortization.amountDue} />
                    </span>
                  </div>
                  <p className="type-caption mt-1">
                    Due {formatUtcDate(nextAmortization.dueDate)} ·{" "}
                    {graceDeadlineCaption(nextAmortization.graceDeadline, {
                      isOverdue: nextAmortization.penaltyAmount > 0,
                    })}
                    {nextAmortization.penaltyAmount > 0
                      ? ` · Late ${formatPHP(nextAmortization.penaltyAmount)}`
                      : ""}
                  </p>
                </div>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-[var(--ink-muted)]"
                  aria-hidden
                />
              </Link>
            </section>
          ) : null}

          <section
            className="rl-dash-panel"
            aria-labelledby="recent-payments-heading"
          >
            <div className="rl-section-head border-b border-[var(--border-subtle)] pb-3">
              <h2 className="type-title" id="recent-payments-heading">
                Recent payments
              </h2>
            </div>
            {cancelError ? (
              <p className="rl-alert rl-alert-error mt-3" role="alert">
                {cancelError}
              </p>
            ) : null}
            {recentPayments.length === 0 ? (
              <div className="rl-dash-empty">
                <p className="type-body-sm font-medium text-[var(--ink-secondary)]">
                  No recent payments
                </p>
              </div>
            ) : (
              <ul className="rl-dash-list mt-3">
                {recentPayments.map((payment) => (
                  <li key={payment.id} className="rl-dash-list-item !items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="type-body-sm min-w-0 font-semibold">
                          {payment.label}
                        </p>
                        <StatusPill
                          status={payment.status}
                          label={
                            payment.canCancel
                              ? "Submitted"
                              : payment.status === "PENDING"
                                ? "Pending"
                                : undefined
                          }
                        />
                      </div>
                      <p className="type-caption mt-0.5 font-mono tabular-nums">
                        {new Date(payment.date).toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        · {formatPHP(payment.amount)}
                      </p>
                      {payment.allocations.length > 0 ? (
                        <ul className="mt-1.5 space-y-0.5">
                          {payment.allocations.map((line) => (
                            <li
                              key={line}
                              className="type-caption font-mono tabular-nums text-[var(--ink-muted)]"
                            >
                              {line}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {payment.canCancel ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {confirmCancelId === payment.id ? (
                            <p className="type-caption text-[var(--ink-secondary)]">
                              Delete this submitted proof? It has not been
                              reviewed yet.
                            </p>
                          ) : null}
                          <button
                            type="button"
                            className={
                              confirmCancelId === payment.id
                                ? "rl-btn rl-btn-danger-outline rl-btn-sm"
                                : "rl-btn rl-btn-secondary rl-btn-sm"
                            }
                            disabled={
                              cancelling && pendingCancelId === payment.id
                            }
                            onClick={() => handleCancelPayment(payment.id)}
                          >
                            {cancelling && pendingCancelId === payment.id
                              ? "Deleting…"
                              : confirmCancelId === payment.id
                                ? "Confirm delete"
                                : "Delete submission"}
                          </button>
                          {confirmCancelId === payment.id ? (
                            <button
                              type="button"
                              className="rl-btn rl-btn-ghost rl-btn-sm"
                              disabled={cancelling}
                              onClick={() => setConfirmCancelId(null)}
                            >
                              Keep submitted
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </FundCanvas>
  );
}
