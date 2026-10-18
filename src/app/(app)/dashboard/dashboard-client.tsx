"use client";

import Link from "next/link";
import {
  ChevronRight,
  AlertTriangle,
  HandCoins,
  CheckCircle2,
  ArrowRight,
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
  pending: "Receipt pending",
  late: "Late fee accruing",
  catchup: "Catch-up",
  grace: "In grace",
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
    <div className="ui-fund-frame ui-dash">
      <PageHeader
        eyebrow="Home"
        title={`Hi, ${firstName}`}
        description={`${headsCount} head${headsCount === 1 ? "" : "s"} · ${formatPHP(kinsenasDue)} per kinsenas${mapOverdue > 0 ? ` · ${mapOverdue} overdue` : ""}`}
      />

      <div
        className={`ui-desk ui-dash-desk${tone === "late" ? " ui-dash-desk--late" : ""}`}
      >
        {nextKinsenas && tone ? (
          <section
            aria-labelledby="next-due-heading"
            className={`ui-dash-due ui-dash-due--${tone}`}
          >
            <span
              className={`ui-dash-due-rail ui-dash-due-rail--${tone}`}
              aria-hidden
            />
            <div className="ui-dash-due-body">
              <div className="ui-dash-due-top">
                <div className="min-w-0">
                  <p className="type-label" id="next-due-heading">
                    Next kinsenas
                  </p>
                  <p className="type-body-sm mt-1 font-medium">
                    {nextKinsenas.periodLabel} ·{" "}
                    {nextKinsenas.kinsenaIndex === 1 ? "15th" : "EOM"}
                  </p>
                </div>
                <span
                  className={`ui-dash-due-badge ui-dash-due-badge--${tone}`}
                >
                  {TONE_LABEL[tone]}
                </span>
              </div>

              <p className="ui-dash-due-amount">
                <Money amount={obligationTotal} metric />
              </p>
              {nextKinsenas.penaltyAmount > 0 ? (
                <p className="type-caption mt-1 tabular-nums">
                  {formatPHP(nextKinsenas.amountDue)} base +{" "}
                  {formatPHP(nextKinsenas.penaltyAmount)} late
                </p>
              ) : null}

              <dl className="ui-dash-due-dates">
                <div>
                  <dt>Due</dt>
                  <dd>{formatUtcDate(nextKinsenas.dueDate)}</dd>
                </div>
                <div>
                  <dt>
                    {nextKinsenas.isCatchUp
                      ? "Policy grace ended"
                      : "Grace ends"}
                  </dt>
                  <dd>{formatUtcDate(nextKinsenas.graceDeadline)}</dd>
                </div>
              </dl>

              {(nextKinsenas.isOverdue || nextKinsenas.penaltyAmount > 0) && (
                <div className="ui-dash-due-alert" role="status">
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden
                  />
                  <div>
                    <p className="type-body-sm font-medium">
                      Late fee {formatPHP(nextKinsenas.penaltyAmount)}
                    </p>
                    <p className="type-caption mt-1">
                      {nextKinsenas.lateFeeBreakdown}
                    </p>
                  </div>
                </div>
              )}

              <Link
                href={payHref}
                className="ui-btn ui-btn-primary ui-btn-lg ui-btn-block mt-auto"
              >
                Pay now
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </section>
        ) : (
          <section className="ui-dash-due ui-dash-due--clear" aria-live="polite">
            <div className="ui-dash-due-body ui-dash-clear">
              <CheckCircle2
                className="h-6 w-6 shrink-0 text-[var(--success)]"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="type-title">You&apos;re caught up</p>
                <p className="type-caption mt-1">No open kinsenas.</p>
                <Link
                  href="/pay"
                  className="ui-btn ui-btn-secondary mt-4 sm:w-auto"
                >
                  Go to Pay
                </Link>
              </div>
            </div>
          </section>
        )}

        <section className="ui-dash-balances" aria-label="Balances">
          <div className="ui-dash-balance">
            <p className="type-label">Equity</p>
            <p className="ui-dash-balance-value">{formatPHP(totalEquity)}</p>
            <p className="type-caption mt-1 tabular-nums">
              {formatPHP(monthlyDue)} / month
            </p>
          </div>
          <div className="ui-dash-balance">
            <p className="type-label">Active loan</p>
            <p className="ui-dash-balance-value">
              {formatPHP(activeLoanBalance)}
            </p>
            <Link
              href="/loans"
              className="type-caption mt-1 inline-flex min-h-11 items-center gap-0.5 font-medium text-[var(--brand)]"
            >
              Loans
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
          {prepaidCredit > 0 ? (
            <div className="ui-dash-balance">
              <p className="type-label">Prepaid</p>
              <p className="ui-dash-balance-value">
                {formatPHP(prepaidCredit)}
              </p>
            </div>
          ) : null}
        </section>
      </div>

      <div className="ui-fund-stack">
        {nextAmortization ? (
          <section className="ui-section" aria-labelledby="loan-installment-heading">
            <Link href="/loans" className="ui-dash-loan-row">
              <span className="ui-dash-loan-icon" aria-hidden>
                <HandCoins className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="type-caption" id="loan-installment-heading">
                  Next loan installment
                </p>
                <p className="type-body-sm mt-0.5 font-medium tabular-nums">
                  #{nextAmortization.installmentNumber} ·{" "}
                  {formatPHP(nextAmortization.amountDue)}
                </p>
                <p className="type-caption mt-0.5">
                  Due {formatUtcDate(nextAmortization.dueDate)}
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

        {kinsenasYearMap ? (
          <KinsenasYearMap map={kinsenasYearMap} variant="ledger" />
        ) : null}

        <section
          className="ui-dash-panel"
          aria-labelledby="recent-payments-heading"
        >
          <div className="ui-section-head">
            <h2 className="type-title" id="recent-payments-heading">
              Recent payments
            </h2>
            <span className="type-caption">Last 30 days</span>
          </div>
          {recentPayments.length === 0 ? (
            <p className="ui-dash-empty type-body-sm type-muted">
              No submissions yet.
            </p>
          ) : (
            <ul className="ui-dash-list mt-3">
              {recentPayments.map((payment) => (
                <li key={payment.id} className="ui-dash-list-item">
                  <div className="min-w-0">
                    <p className="type-body-sm truncate font-medium">
                      {payment.label}
                    </p>
                    <p className="type-caption mt-0.5 tabular-nums">
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
  );
}
