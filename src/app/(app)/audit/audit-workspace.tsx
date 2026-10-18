"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenCheck,
  CheckCircle2,
  Flag,
  Loader2,
} from "lucide-react";
import { auditPaymentSubmission } from "@/actions/audit";
import { fetchReceiptSignedUrl } from "@/actions/receipts";
import { formatPHP } from "@/lib/finance/loan-calculator";
import { OpsWorkstation } from "@/components/ui/ops-workstation";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import { ReceiptPreview } from "../verify/receipt-preview";

export type AuditQueueItem = {
  id: string;
  memberName: string;
  targetLabel: string;
  amount: number;
  referenceNumber: string;
  paymentChannel: string;
  verifiedAt: string | null;
  receiptStoragePath: string | null;
};

export function AuditWorkspace({ queue }: { queue: AuditQueueItem[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(queue[0]?.id ?? "");
  const [remarks, setRemarks] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  const selected = queue.find((q) => q.id === selectedId) ?? queue[0] ?? null;

  useEffect(() => {
    let cancelled = false;
    async function loadReceipt() {
      if (!selected?.receiptStoragePath) {
        setReceiptUrl(null);
        return;
      }
      const result = await fetchReceiptSignedUrl(selected.receiptStoragePath);
      if (cancelled) return;
      setReceiptUrl(result.success ? result.data.url : null);
    }
    void loadReceipt();
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.receiptStoragePath]);

  function decide(decision: "AUDITED" | "FLAGGED") {
    if (!selected) return;
    if (decision === "FLAGGED" && !remarks.trim()) {
      setToast("Remarks are required to flag.");
      return;
    }
    startTransition(async () => {
      const result = await auditPaymentSubmission({
        submissionId: selected.id,
        decision,
        remarks: remarks.trim() || undefined,
      });
      if (!result.success) {
        setToast(result.error);
        return;
      }
      setToast(result.message ?? "Saved.");
      setRemarks("");
      router.refresh();
    });
  }

  return (
    <OpsWorkstation
      title="Audit ledger"
      description="Verified payments"
      padded={false}
    >
      {toast ? (
        <p className="ui-alert ui-alert-info mx-[var(--page-pad-x)] mt-3" role="status">
          {toast}
        </p>
      ) : null}

      {queue.length === 0 ? (
        <EmptyState
          icon={<BookOpenCheck className="h-5 w-5" aria-hidden />}
          title="Audit queue empty"
          description="Nothing to audit."
          className="px-[var(--page-pad-x)]"
        />
      ) : (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(280px,320px)]">
          <div className="overflow-auto border-b border-[var(--border)] lg:border-b-0 lg:border-r">
            <ul className="ui-data-cards p-3">
              {queue.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`ui-data-card w-full text-left ${
                      selected?.id === item.id
                        ? "ring-2 ring-[var(--brand-accent)]"
                        : ""
                    }`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <p className="type-body-sm font-medium">{item.memberName}</p>
                    <p className="type-caption mt-1">{item.targetLabel}</p>
                    <p className="type-title mt-2 tabular-nums">
                      {formatPHP(item.amount)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
            <div className="ui-data-table">
              <table className="w-full text-left type-body-sm">
                <thead className="sticky top-0 bg-[var(--surface)] type-caption">
                  <tr className="border-b border-[var(--border)]">
                    <th className="px-4 py-3">Member</th>
                    <th className="px-4 py-3">Target</th>
                    <th className="px-4 py-3">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((item) => (
                    <tr
                      key={item.id}
                      className={`cursor-pointer border-b border-[var(--border)] ${
                        selected?.id === item.id ? "bg-[var(--brand-soft)]" : ""
                      }`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <td className="px-4 py-3 font-medium">{item.memberName}</td>
                      <td className="px-4 py-3">{item.targetLabel}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatPHP(item.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <section className="min-h-[220px] border-b border-[var(--border)] bg-[var(--surface)] lg:border-b-0 lg:border-r">
            {selected && receiptUrl ? (
              <ReceiptPreview
                src={receiptUrl}
                alt={`Receipt from ${selected.memberName}`}
                referenceNumber={selected.referenceNumber}
              />
            ) : selected && !selected.receiptStoragePath ? (
              <div className="ui-ops-empty">
                <p className="type-body-sm font-medium">No receipt image</p>
                <p className="type-caption">Cash or missing storage path.</p>
              </div>
            ) : (
              <div className="ui-ops-empty">
                <p className="type-caption">Loading receipt…</p>
              </div>
            )}
          </section>

          <aside className="p-4 ui-stack">
            {selected ? (
              <>
                <div>
                  <p className="type-label">Selected</p>
                  <h2 className="type-title mt-1">{selected.memberName}</h2>
                  <p className="type-caption mt-1">{selected.targetLabel}</p>
                  <p className="type-metric mt-3 tabular-nums">
                    {formatPHP(selected.amount)}
                  </p>
                  <p className="type-caption mt-2 font-mono">
                    {selected.referenceNumber}
                  </p>
                </div>
                <label className="ui-field">
                  <span className="ui-field-label">Remarks</span>
                  <textarea
                    rows={3}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="ui-textarea"
                    placeholder="Required to flag"
                  />
                </label>
                <button
                  type="button"
                  disabled={pending}
                  className="ui-btn ui-btn-success ui-btn-block"
                  onClick={() => decide("AUDITED")}
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Mark audited
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className="ui-btn ui-btn-danger ui-btn-block"
                  onClick={() => decide("FLAGGED")}
                >
                  <Flag className="h-4 w-4" />
                  Flag
                </button>
              </>
            ) : null}
          </aside>
        </div>
      )}
    </OpsWorkstation>
  );
}
