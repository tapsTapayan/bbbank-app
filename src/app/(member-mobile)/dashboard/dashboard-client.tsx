"use client";

import { useState } from "react";
import {
  Upload,
  TrendingUp,
  CalendarClock,
  ChevronRight,
} from "lucide-react";
import { formatPHP } from "@/lib/finance/loan-calculator";
import type { PaymentTargetOption } from "@/lib/queries/member-payment-targets";
import { PaymentUploadDrawer } from "./payment-upload-drawer";

export type DashboardRecentPayment = {
  id: string;
  label: string;
  amount: number;
  status: "PENDING" | "VERIFIED" | "AUDITED" | "REJECTED";
  date: string;
};

export type MemberDashboardData = {
  userId: string;
  memberName: string;
  memberEmail: string;
  totalEquity: number;
  activeLoanBalance: number;
  nextAmortization: {
    installmentNumber: number;
    dueDate: string;
    amountDue: number;
    loanLabel: string;
  } | null;
  recentPayments: DashboardRecentPayment[];
  paymentTargets: PaymentTargetOption[];
};

const statusStyles: Record<DashboardRecentPayment["status"], string> = {
  PENDING: "bg-amber-50 text-amber-800 ring-amber-200",
  VERIFIED: "bg-sky-50 text-sky-800 ring-sky-200",
  AUDITED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  REJECTED: "bg-rose-50 text-rose-800 ring-rose-200",
};

function StatusPill({ status }: { status: DashboardRecentPayment["status"] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${statusStyles[status]}`}
    >
      {status}
    </span>
  );
}

export function MemberDashboardClient({ data }: { data: MemberDashboardData }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const {
    memberName,
    memberEmail,
    totalEquity,
    activeLoanBalance,
    nextAmortization,
    recentPayments,
    paymentTargets,
    userId,
  } = data;

  return (
    <div className="space-y-5">
      <section>
        <p className="text-sm text-[var(--ink-muted)]">Welcome back,</p>
        <h1 className="text-xl font-semibold tracking-tight text-[var(--ink)] md:text-2xl">
          {memberName}
        </h1>
      </section>

      <section
        id="equity"
        className="overflow-hidden rounded-2xl bg-[var(--brand)] p-5 text-white shadow-sm"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-white/75">
              Total Sinking Fund Equity
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums md:text-4xl">
              {formatPHP(totalEquity)}
            </p>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
            <TrendingUp className="h-5 w-5" />
          </span>
        </div>
        <p className="mt-3 text-xs text-white/65">
          Derived from verified ledger contributions
        </p>
      </section>

      <section
        id="loan"
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] p-5 shadow-sm"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--ink)]">
            Active Loan Balance
          </h2>
          {nextAmortization && (
            <span className="text-xs font-medium text-[var(--ink-muted)]">
              {nextAmortization.loanLabel}
            </span>
          )}
        </div>
        <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--ink)]">
          {formatPHP(activeLoanBalance)}
        </p>

        {nextAmortization ? (
          <div className="mt-4 flex items-start gap-3 rounded-xl bg-[var(--surface)] p-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
              <CalendarClock className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[var(--ink-muted)]">
                Next amortization due
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">
                Installment #{nextAmortization.installmentNumber} ·{" "}
                {formatPHP(nextAmortization.amountDue)}
              </p>
              <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                Due{" "}
                {new Date(nextAmortization.dueDate).toLocaleDateString("en-PH", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-[var(--ink-muted)]" />
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--ink-muted)]">
            No active loan amortization schedule.
          </p>
        )}
      </section>

      <section id="upload">
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--ink)] px-5 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 active:scale-[0.99]"
        >
          <Upload className="h-4.5 w-4.5" />
          Upload Proof of Payment
        </button>
        <p className="mt-2 text-center text-xs text-[var(--ink-muted)]">
          Attach GCash / Maya / bank receipt with reference number
        </p>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--ink)]">
            Recent payments
          </h2>
          <span className="text-xs text-[var(--ink-muted)]">Last 30 days</span>
        </div>
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)]">
          {recentPayments.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-[var(--ink-muted)]">
              No recent payment submissions
            </li>
          )}
          {recentPayments.map((payment) => (
            <li
              key={payment.id}
              className="flex items-center justify-between gap-3 px-4 py-3.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--ink)]">
                  {payment.label}
                </p>
                <p className="text-xs text-[var(--ink-muted)]">
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
      </section>

      <section id="profile" className="pb-2 text-center text-xs text-[var(--ink-muted)]">
        Signed in as {memberEmail}
      </section>

      <PaymentUploadDrawer
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        userId={userId}
        targets={paymentTargets}
      />
    </div>
  );
}
