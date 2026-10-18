"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  HandCoins,
  Loader2,
  XCircle,
} from "lucide-react";
import {
  approveLoan,
  disburseLoan,
  rejectLoan,
} from "@/actions/loans";
import { formatPHP } from "@/lib/finance/loan-calculator";
import { OpsWorkstation } from "@/components/ui/ops-workstation";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";

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

  const selected = loans.find((l) => l.id === selectedId) ?? loans[0] ?? null;

  function run(
    action: () => Promise<{ success: boolean; error?: string; message?: string }>,
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
      title="Loan requests"
      description="Approve and disburse member loans against policy caps"
      padded={false}
    >
      {toast ? (
        <p className="ui-alert ui-alert-info mx-[var(--page-pad-x)] mt-3" role="status">
          {toast}
        </p>
      ) : null}

      {loans.length === 0 ? (
        <EmptyState
          icon={<HandCoins className="h-5 w-5" aria-hidden />}
          title="No open loan requests"
          description="Pending and approved member requests will list here."
          className="px-[var(--page-pad-x)]"
        />
      ) : (
        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="min-h-0 overflow-auto border-b border-[var(--border)] lg:border-b-0 lg:border-r">
            <ul className="ui-data-cards p-3">
              {loans.map((loan) => (
                <li key={loan.id}>
                  <button
                    type="button"
                    className={`ui-data-card w-full text-left ${
                      selected?.id === loan.id
                        ? "ring-2 ring-[var(--brand-accent)]"
                        : ""
                    }`}
                    onClick={() => setSelectedId(loan.id)}
                  >
                    <p className="type-body-sm font-medium">{loan.borrowerName}</p>
                    <p className="type-caption mt-1">{loan.borrowerEmail}</p>
                    <p className="mt-2">
                      <Money amount={loan.principalAmount} className="type-title" />
                    </p>
                    <p className="type-caption mt-1">{loan.status}</p>
                  </button>
                </li>
              ))}
            </ul>
            <div className="ui-data-table">
              <table className="w-full text-left type-body-sm">
                <thead className="sticky top-0 bg-[var(--surface)] type-caption">
                  <tr className="border-b border-[var(--border)]">
                    <th className="px-4 py-3 font-medium">Member</th>
                    <th className="px-4 py-3 font-medium">Principal</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((loan) => (
                    <tr
                      key={loan.id}
                      className={`cursor-pointer border-b border-[var(--border)] ${
                        selected?.id === loan.id ? "bg-[var(--brand-soft)]" : ""
                      }`}
                      onClick={() => setSelectedId(loan.id)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">{loan.borrowerName}</p>
                        <p className="type-caption">{loan.borrowerEmail}</p>
                      </td>
                      <td className="px-4 py-3 tabular-nums font-medium">
                        {formatPHP(loan.principalAmount)}
                      </td>
                      <td className="px-4 py-3">{loan.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="p-4 ui-stack">
            {selected ? (
              <>
                <div>
                  <p className="type-label">Selected</p>
                  <h2 className="type-title mt-1">{selected.borrowerName}</h2>
                  <p className="type-caption mt-1">
                    {selected.headsSnapshot} head
                    {selected.headsSnapshot === 1 ? "" : "s"} ·{" "}
                    {(selected.interestRate * 100).toFixed(0)}% ·{" "}
                    {selected.termMonths} mo · {selected.repaymentFrequency}
                  </p>
                  <p className="type-metric mt-3 tabular-nums">
                    {formatPHP(selected.principalAmount)}
                  </p>
                  <p className="type-caption mt-2">
                    Interest{" "}
                    {formatPHP(
                      selected.principalAmount * selected.interestRate,
                    )}{" "}
                    · Total payable{" "}
                    {formatPHP(
                      selected.principalAmount *
                        (1 + selected.interestRate),
                    )}
                    {selected.repaymentFrequency === "KINSENAS"
                      ? " · 4 kinsenas"
                      : " · 2 monthly"}
                  </p>
                </div>
                <div className="ui-stack-sm">
                  {(selected.status === "PENDING"
                    ? (
                        <>
                          <button
                            type="button"
                            disabled={pending}
                            className="ui-btn ui-btn-success ui-btn-block"
                            onClick={() =>
                              run(() => approveLoan(selected.id))
                            }
                          >
                            {pending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4" />
                            )}
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            className="ui-btn ui-btn-danger ui-btn-block"
                            onClick={() =>
                              run(() => rejectLoan(selected.id))
                            }
                          >
                            <XCircle className="h-4 w-4" />
                            Reject
                          </button>
                        </>
                      )
                    : null)}
                  {selected.status === "APPROVED" ||
                  selected.status === "PENDING" ? (
                    <button
                      type="button"
                      disabled={pending || selected.status === "PENDING"}
                      className="ui-btn ui-btn-primary ui-btn-block"
                      onClick={() => run(() => disburseLoan(selected.id))}
                      title={
                        selected.status === "PENDING"
                          ? "Approve before disbursing"
                          : undefined
                      }
                    >
                      {pending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <HandCoins className="h-4 w-4" />
                      )}
                      Disburse
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
          </aside>
        </div>
      )}
    </OpsWorkstation>
  );
}
