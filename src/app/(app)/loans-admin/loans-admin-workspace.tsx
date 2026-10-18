"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  HandCoins,
  Loader2,
  XCircle,
  CalendarClock,
} from "lucide-react";
import { clsx } from "clsx";
import {
  approveLoan,
  disburseLoan,
  rejectLoan,
} from "@/actions/loans";
import { formatPHP } from "@/lib/finance/loan-calculator";
import { OpsWorkstation } from "@/components/ui/ops-workstation";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import { SplitView, SplitPane } from "@/components/system/frames/split-view";

export type LoanDeskRow = {
  id: string;
  borrowerName: string;
  borrowerEmail: string;
  principalAmount: number;
  interestRate: number;
  termMonths: number;
  repaymentFrequency: string;
  headsSnapshot: number;
  status: string;
  createdAt: string;
};

export function LoansAdminWorkspace({ loans }: { loans: LoanDeskRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(loans[0]?.id ?? "");
  const [mobilePane, setMobilePane] = useState<"queue" | "detail">("queue");

  const selected = loans.find((l) => l.id === selectedId) ?? loans[0] ?? null;

  function run(
    action: () => Promise<{
      success: boolean;
      error?: string;
      message?: string;
    }>,
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setToast(result.error ?? "Action failed.");
        return;
      }
      setToast(result.message ?? "Done.");
      router.refresh();
    });
  }

  return (
    <OpsWorkstation
      title="Treasurer Loan Desk"
      description="Review, approve, and disburse member loan requests"
      padded={false}
      actions={
        <>
          <span
            className={
              loans.length > 0
                ? "rl-pill rl-pill-pending"
                : "rl-pill rl-pill-verified"
            }
          >
            {loans.length} open
          </span>
          {toast ? (
            <p
              className="rl-alert rl-alert-info !py-1.5 !px-3 type-caption"
              role="status"
            >
              {toast}
            </p>
          ) : null}
        </>
      }
    >
      {loans.length === 0 ? (
        <EmptyState
          icon={<HandCoins className="h-5 w-5" aria-hidden />}
          title="No Open Loan Requests"
          description="Pending and approved loan applications awaiting disbursement will appear here."
          className="px-[var(--page-pad-x)]"
        />
      ) : (
        <>
          <div
            className="rl-ops-tabs md:hidden"
            role="tablist"
            aria-label="Loan desk panes"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mobilePane === "queue"}
              className="rl-ops-tab"
              onClick={() => setMobilePane("queue")}
            >
              Requests ({loans.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobilePane === "detail"}
              className="rl-ops-tab"
              onClick={() => setMobilePane("detail")}
            >
              Review & Disburse
            </button>
          </div>

          <SplitView variant="dual" className="min-h-0 flex-1">
            <SplitPane
              className={clsx(
                mobilePane === "queue" ? "flex" : "hidden md:flex",
              )}
            >
              <div className="rl-ops-toolbar">
                <p className="type-label">Loan Applications</p>
                <span className="type-caption font-mono">{loans.length}</span>
              </div>
              <ul className="rl-ops-pane-scroll space-y-2 p-3">
                {loans.map((loan) => {
                  const active = selected?.id === loan.id;
                  return (
                    <li key={loan.id}>
                      <button
                        type="button"
                        className={clsx("rl-ops-row", active && "is-selected")}
                        onClick={() => {
                          setSelectedId(loan.id);
                          setMobilePane("detail");
                        }}
                      >
                        <div className="flex w-full items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="type-body-sm truncate font-semibold">
                              {loan.borrowerName}
                            </p>
                            <p className="type-caption truncate">
                              {loan.borrowerEmail}
                            </p>
                          </div>
                          <span
                            className={
                              loan.status === "APPROVED"
                                ? "rl-pill rl-pill-verified"
                                : "rl-pill rl-pill-pending"
                            }
                          >
                            {loan.status}
                          </span>
                        </div>
                        <div className="mt-2 flex w-full items-center justify-between border-t border-[var(--border-subtle)] pt-2">
                          <span className="type-caption font-mono">
                            {loan.headsSnapshot}H ·{" "}
                            {loan.repaymentFrequency === "KINSENAS"
                              ? "4 Kinsenas"
                              : "2 Monthly"}
                          </span>
                          <span className="font-mono text-sm font-bold tabular-nums text-[var(--ink)]">
                            {formatPHP(loan.principalAmount)}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </SplitPane>

            <SplitPane
              className={clsx(
                mobilePane === "detail" ? "flex" : "hidden md:flex",
              )}
            >
              <div className="rl-ops-toolbar">
                <p className="type-label">Application Telemetry & Action</p>
              </div>
              <div className="rl-ops-pane-scroll p-5 sm:p-6">
                {selected ? (
                  <div className="mx-auto max-w-2xl rl-stack">
                    <div className="rl-vault-card">
                      <div className="rl-vault-body">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="rl-vault-eyebrow">
                              Borrower Application
                            </p>
                            <h2 className="mt-1 text-xl font-bold text-white">
                              {selected.borrowerName}
                            </h2>
                            <p className="text-xs text-white/75">
                              {selected.borrowerEmail}
                            </p>
                          </div>
                          <span className="rl-vault-badge">
                            {selected.status}
                          </span>
                        </div>

                        <div>
                          <p className="rl-vault-eyebrow">Requested Principal</p>
                          <p className="type-metric mt-1 text-white">
                            <Money
                              amount={selected.principalAmount}
                              metric
                              className="!text-white"
                            />
                          </p>
                        </div>

                        <dl className="rl-vault-meta-grid">
                          <div className="rl-vault-meta-item">
                            <dt>
                              Flat Interest (
                              {(selected.interestRate * 100).toFixed(0)}%)
                            </dt>
                            <dd>
                              {formatPHP(
                                selected.principalAmount *
                                  selected.interestRate,
                              )}
                            </dd>
                          </div>
                          <div className="rl-vault-meta-item">
                            <dt>Total Payable</dt>
                            <dd>
                              {formatPHP(
                                selected.principalAmount *
                                  (1 + selected.interestRate),
                              )}
                            </dd>
                          </div>
                          <div className="rl-vault-meta-item col-span-2 sm:col-span-1">
                            <dt>Schedule</dt>
                            <dd>
                              {selected.repaymentFrequency === "KINSENAS"
                                ? "4 Kinsenas"
                                : "2 Monthly"}{" "}
                              ({selected.headsSnapshot}H)
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </div>

                    <div className="rl-inset flex items-center gap-2.5">
                      <CalendarClock
                        className="h-4 w-4 shrink-0 text-[var(--brand)]"
                        aria-hidden
                      />
                      <p className="type-caption">
                        Submitted on{" "}
                        {new Date(selected.createdAt).toLocaleDateString(
                          "en-PH",
                          {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          },
                        )}
                        . Disbursing records an immutable{" "}
                        <code className="font-mono">LOAN_DISBURSEMENT_OUT</code>{" "}
                        ledger entry and generates the amortization schedule.
                      </p>
                    </div>

                    <div className="grid gap-3 pt-2 sm:grid-cols-2">
                      {selected.status === "PENDING" ? (
                        <>
                          <button
                            type="button"
                            disabled={pending}
                            className="rl-btn rl-btn-success rl-btn-lg rl-btn-block"
                            onClick={() => run(() => approveLoan(selected.id))}
                          >
                            {pending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4" />
                            )}
                            1. Approve Application
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            className="rl-btn rl-btn-danger rl-btn-lg rl-btn-block"
                            onClick={() => run(() => rejectLoan(selected.id))}
                          >
                            <XCircle className="h-4 w-4" />
                            Reject Request
                          </button>
                        </>
                      ) : null}

                      {(selected.status === "APPROVED" ||
                        selected.status === "PENDING") && (
                        <button
                          type="button"
                          disabled={pending || selected.status === "PENDING"}
                          className="rl-btn rl-btn-primary rl-btn-lg rl-btn-block sm:col-span-2"
                          onClick={() => run(() => disburseLoan(selected.id))}
                        >
                          {pending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <HandCoins className="h-4 w-4" />
                          )}
                          {selected.status === "PENDING"
                            ? "2. Disburse Funds (Approve First)"
                            : `Disburse ${formatPHP(selected.principalAmount)} Now`}
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </SplitPane>
          </SplitView>
        </>
      )}
    </OpsWorkstation>
  );
}
