"use client";

import Link from "next/link";
import {
  ChevronRight,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
} from "lucide-react";
import { formatPHP } from "@/lib/finance/loan-calculator";
import {
  formatUtcDate,
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
  totalEquity: number;
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

function obligationTone(next: NextKinsenasObligation) {
  if (next.pendingFreeze) return "pending" as const;
  if (next.isOverdue || next.penaltyAmount > 0) return "late" as const;
  if (next.isCatchUp) return "catchup" as const;
  if (next.isWithinGrace) return "grace" as const;
  return "due" as const;
}

const TONE_LABEL = {
  pending: "Pending verification",
  late: "Late fee",
  catchup: "Catch-up",
  grace: "Grace period",
  due: "Due soon",
} as const;

export function MemberDashboardClient({ data }: { data: MemberDashboardData }) {
  const {
    memberName,
    headsCount,
    prepaidCredit,
    kinsenasDue,
    monthlyDue,
    totalEquity,
    activeLoanBalance,
    nextKinsenas,
    nextAmortization,
    recentPayments,
    paymentTargets,
    kinsenasYearMap,
  } = data;

  const firstName = memberName.split(" ")[0] ?? memberName;
  const obligationTotal = nextKinsenas
    ? nextKinsenas.amountDue + nextKinsenas.penaltyAmount
    : 0;
  const mapOverdue = kinsenasYearMap?.counts.overdue ?? 0;
  const nextTargetId = nextKinsenas
    ? paymentTargets.find(
        (t) =>
          t.targetType === "CONTRIBUTION" &&
          t.dueDate === nextKinsenas.dueDate,
      )?.id
    : undefined;
  const payHref = nextTargetId ? `/pay?target=${nextTargetId}` : "/pay";
  const tone = nextKinsenas ? obligationTone(nextKinsenas) : null;

  return (
    <FundCanvas>
      <PageHeader
        title={`Welcome, ${firstName}`}
        description={`${headsCount} head${headsCount === 1 ? "" : "s"} · ${formatPHP(kinsenasDue)} / kinsenas · ${formatPHP(monthlyDue)} / month${mapOverdue > 0 ? ` · ${mapOverdue} overdue` : ""}`}
        actions={
          <Link href={payHref} className="rl-btn rl-btn-primary">
            Pay
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        }
      />

      <div className="rl-dash-grid">
        {/* Left / Primary Column: Sovereign Obligation Hero + 24-Slot Kinsenas Year Matrix */}
        <div className="rl-fund-stack">
          <section
            aria-labelledby="next-due-heading"
            className="rl-vault-card"
          >
            {nextKinsenas && tone ? (
              <div className="rl-vault-body">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-white" id="next-due-heading">
                      {nextKinsenas.periodLabel} ·{" "}
                      {nextKinsenas.kinsenaIndex === 1
                        ? "1st Kinsenas (15th)"
                        : "2nd Kinsenas (EOM)"}
                    </p>
                  </div>
                  {tone !== "due" ? (
                    <span
                      className={`rl-vault-badge rl-vault-badge--${
                        tone === "late"
                          ? "late"
                          : tone === "grace" || tone === "pending"
                            ? "grace"
                            : "default"
                      }`}
                    >
                      {TONE_LABEL[tone]}
                    </span>
                  ) : null}
                </div>

                <div>
                  <p className="type-metric-lg text-white">
                    {formatPHP(obligationTotal)}
                  </p>
                  <p className="mt-1.5 font-mono text-xs text-white/75 tabular-nums">
                    {nextKinsenas.penaltyAmount > 0
                      ? `${formatPHP(nextKinsenas.amountDue)} due + ${formatPHP(nextKinsenas.penaltyAmount)} late`
                      : `${formatPHP(nextKinsenas.amountDue)} (${nextKinsenas.headsSnapshot} × ₱250)`}
                  </p>
                </div>

                <dl className="rl-vault-meta-grid">
                  <div className="rl-vault-meta-item">
                    <dt>Due Date</dt>
                    <dd>{formatUtcDate(nextKinsenas.dueDate)}</dd>
                  </div>
                  <div className="rl-vault-meta-item">
                    <dt>
                      Grace ends
                    </dt>
                    <dd>{formatUtcDate(nextKinsenas.graceDeadline)}</dd>
                  </div>
                </dl>

                {(nextKinsenas.isOverdue || nextKinsenas.penaltyAmount > 0) && (
                  <div
                    className="flex items-start gap-3 rounded-[var(--radius-md)] border border-red-300/30 bg-red-950/45 px-3.5 py-3 text-white"
                    role="status"
                  >
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-red-300"
                      aria-hidden
                    />
                    <p className="min-w-0 text-xs font-semibold text-red-100">
                      Late fee: {formatPHP(nextKinsenas.penaltyAmount)}
                    </p>
                  </div>
                )}

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

          {kinsenasYearMap ? (
            <KinsenasYearMap map={kinsenasYearMap} variant="ledger" />
          ) : null}
        </div>

        {/* Right / Secondary Column: Portfolio Telemetry, Active Loan Installment, Recent Ledger */}
        <div className="rl-fund-stack">
          <section aria-label="Fund Position">
            <div
              className={`rl-kpi-grid${prepaidCredit > 0 ? " rl-kpi-grid--3" : ""}`}
            >
              <div className="rl-kpi-card">
                <p className="type-label">Equity</p>
                <div>
                  <p className="rl-kpi-value">{formatPHP(totalEquity)}</p>
                  <p className="type-caption mt-1 tabular-nums">
                    {formatPHP(monthlyDue)} / month
                  </p>
                </div>
              </div>

              <div className="rl-kpi-card">
                <p className="type-label">Active Loan</p>
                <div>
                  <p className="rl-kpi-value">{formatPHP(activeLoanBalance)}</p>
                  <Link
                    href="/loans"
                    className="type-caption mt-1 inline-flex items-center gap-0.5 font-semibold text-[var(--brand)] hover:underline"
                  >
                    {activeLoanBalance > 0 ? "View schedule" : "Check eligibility"}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
              </div>

              {prepaidCredit > 0 ? (
                <div className="rl-kpi-card col-span-2 sm:col-span-1">
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
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className="type-label text-[var(--brand)]"
                      id="loan-installment-heading"
                    >
                      {nextAmortization.loanLabel} · Installment #
                      {nextAmortization.installmentNumber}
                    </p>
                    <span className="font-mono text-sm font-bold tabular-nums text-[var(--ink)]">
                      <Money amount={nextAmortization.amountDue} />
                    </span>
                  </div>
                  <p className="type-caption mt-1">
                    Due {formatUtcDate(nextAmortization.dueDate)} · Grace ends{" "}
                    {formatUtcDate(nextAmortization.graceDeadline)}
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
            {recentPayments.length === 0 ? (
              <div className="rl-dash-empty">
                <p className="type-body-sm font-medium text-[var(--ink-secondary)]">
                  No recent payments
                </p>
              </div>
            ) : (
              <ul className="rl-dash-list mt-3">
                {recentPayments.map((payment) => (
                  <li key={payment.id} className="rl-dash-list-item">
                    <div className="min-w-0">
                      <p className="type-body-sm truncate font-semibold">
                        {payment.label}
                      </p>
                      <p className="type-caption mt-0.5 font-mono tabular-nums">
                        {new Date(payment.date).toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        · {formatPHP(payment.amount)}
                      </p>
                    </div>
                    <StatusPill status={payment.status} />
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
