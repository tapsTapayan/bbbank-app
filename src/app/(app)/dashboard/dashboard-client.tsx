"use client";

import Link from "next/link";
import {
  ChevronRight,
  AlertTriangle,
  HandCoins,
  CheckCircle2,
  ArrowRight,
  Wallet,
  CalendarClock,
  ReceiptText,
  Sparkles,
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
  pending: "Verification Pending",
  late: "Late Fee Accruing",
  catchup: "Catch-up Period",
  grace: "Within 2-Day Grace",
  due: "Upcoming Obligation",
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
        eyebrow="Personal Sinking Fund"
        title={`Welcome, ${firstName}`}
        description={`${headsCount} active head${headsCount === 1 ? "" : "s"} · ${formatPHP(kinsenasDue)} per kinsenas (${formatPHP(monthlyDue)} / month)${mapOverdue > 0 ? ` · ${mapOverdue} overdue period${mapOverdue === 1 ? "" : "s"}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <Link href={payHref} className="rl-btn rl-btn-primary">
              Pay Dues
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/loans" className="rl-btn rl-btn-secondary">
              Loan Calculator
            </Link>
          </div>
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
                    <p className="rl-vault-eyebrow" id="next-due-heading">
                      Next Kinsenas Obligation
                    </p>
                    <p className="mt-1 text-base font-semibold text-white">
                      {nextKinsenas.periodLabel} ·{" "}
                      {nextKinsenas.kinsenaIndex === 1
                        ? "1st Kinsenas (15th)"
                        : "2nd Kinsenas (EOM)"}
                    </p>
                  </div>
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
                </div>

                <div>
                  <p className="type-metric-lg text-white">
                    {formatPHP(obligationTotal)}
                  </p>
                  <p className="mt-1.5 font-mono text-xs text-white/75 tabular-nums">
                    {nextKinsenas.penaltyAmount > 0
                      ? `${formatPHP(nextKinsenas.amountDue)} principal due + ${formatPHP(nextKinsenas.penaltyAmount)} late penalty`
                      : `${formatPHP(nextKinsenas.amountDue)} base contribution (${nextKinsenas.headsSnapshot} head${nextKinsenas.headsSnapshot === 1 ? "" : "s"} × ₱250)`}
                  </p>
                </div>

                <dl className="rl-vault-meta-grid">
                  <div className="rl-vault-meta-item">
                    <dt>Due Date</dt>
                    <dd>{formatUtcDate(nextKinsenas.dueDate)}</dd>
                  </div>
                  <div className="rl-vault-meta-item">
                    <dt>
                      {nextKinsenas.isCatchUp
                        ? "Policy Grace Ended"
                        : "2-Day Grace Ends"}
                    </dt>
                    <dd>{formatUtcDate(nextKinsenas.graceDeadline)}</dd>
                  </div>
                  <div className="rl-vault-meta-item col-span-2 sm:col-span-1">
                    <dt>Allocation</dt>
                    <dd>
                      {nextKinsenas.headsSnapshot} Head
                      {nextKinsenas.headsSnapshot === 1 ? "" : "s"}
                    </dd>
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
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-red-100">
                        Rule #3 Late Fee: {formatPHP(nextKinsenas.penaltyAmount)}
                      </p>
                      <p className="mt-0.5 text-xs text-red-200/85">
                        {nextKinsenas.lateFeeBreakdown}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <Link
                    href={payHref}
                    className="rl-btn rl-btn-vault rl-btn-lg flex-1 sm:flex-initial"
                  >
                    Settle this period
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                  <span className="text-xs text-white/65">
                    Penalty freezes immediately upon receipt upload
                  </span>
                </div>
              </div>
            ) : (
              <div className="rl-vault-body">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="rl-vault-eyebrow">Obligation Status</p>
                    <h2 className="mt-1 text-xl font-bold text-white">
                      All Open Kinsenas Settled
                    </h2>
                  </div>
                  <span className="rl-vault-badge rl-vault-badge--clear">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    In Good Standing
                  </span>
                </div>
                <p className="max-w-lg text-sm leading-relaxed text-white/80">
                  You have no outstanding kinsenas obligations due right now. You can review your annual contribution matrix below or submit an advance payment.
                </p>
                <div className="pt-1">
                  <Link href="/pay" className="rl-btn rl-btn-vault">
                    Open Payment Desk
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
                <div className="flex items-center justify-between gap-2">
                  <p className="type-label">Verified Equity</p>
                  <Wallet
                    className="h-4 w-4 text-[var(--brand)]"
                    aria-hidden
                  />
                </div>
                <div>
                  <p className="rl-kpi-value">{formatPHP(totalEquity)}</p>
                  <p className="type-caption mt-1 tabular-nums">
                    {formatPHP(monthlyDue)} / mo commitment
                  </p>
                </div>
              </div>

              <div className="rl-kpi-card">
                <div className="flex items-center justify-between gap-2">
                  <p className="type-label">Active Loan</p>
                  <HandCoins
                    className="h-4 w-4 text-[var(--brand)]"
                    aria-hidden
                  />
                </div>
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
                  <div className="flex items-center justify-between gap-2">
                    <p className="type-label">Prepaid Credit</p>
                    <Sparkles
                      className="h-4 w-4 text-[var(--success)]"
                      aria-hidden
                    />
                  </div>
                  <div>
                    <p className="rl-kpi-value text-[var(--success)]">
                      {formatPHP(prepaidCredit)}
                    </p>
                    <p className="type-caption mt-1">Auto-applied to dues</p>
                  </div>
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
              <div className="flex items-center gap-2">
                <ReceiptText
                  className="h-4 w-4 text-[var(--brand)]"
                  aria-hidden
                />
                <h2 className="type-title" id="recent-payments-heading">
                  Recent Submissions
                </h2>
              </div>
              <span className="type-caption">Last 30 days</span>
            </div>
            {recentPayments.length === 0 ? (
              <div className="rl-dash-empty">
                <p className="type-body-sm font-medium text-[var(--ink-secondary)]">
                  No submissions in the last 30 days
                </p>
                <p className="type-caption mt-1">
                  Uploaded receipts and cash attestations will appear here.
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
