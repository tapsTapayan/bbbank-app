"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  Smartphone,
  Loader2,
} from "lucide-react";
import { clsx } from "clsx";
import { verifyPaymentSubmission } from "@/actions/treasurer-verification";
import { fetchReceiptSignedUrl } from "@/actions/receipts";
import type { VerifyQueueItem } from "@/lib/queries/pending-submissions";
import { formatPHP } from "@/lib/finance/loan-calculator";
import { ReceiptPreview } from "./receipt-preview";

const channelIcon = {
  GCASH: Smartphone,
  MAYA: Smartphone,
  BANK_TRANSFER: Building2,
  CASH: Building2,
};

export function VerifyWorkspace({
  initialQueue,
}: {
  initialQueue: VerifyQueueItem[];
}) {
  const router = useRouter();
  const [queue, setQueue] = useState(initialQueue);
  const [selectedId, setSelectedId] = useState(initialQueue[0]?.id ?? "");
  const [remarks, setRemarks] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pendingItems = useMemo(
    () => queue.filter((s) => s.status === "PENDING_VERIFICATION"),
    [queue],
  );

  const selected =
    queue.find((s) => s.id === selectedId) ?? pendingItems[0] ?? null;

  async function selectItem(item: VerifyQueueItem) {
    setSelectedId(item.id);
    setRemarks("");
    setToast(null);
    if (item.receiptSignedUrl) {
      setReceiptUrl(item.receiptSignedUrl);
      return;
    }
    setReceiptUrl(null);
    const result = await fetchReceiptSignedUrl(item.receiptStoragePath);
    if (result.success) {
      setReceiptUrl(result.data.url);
      setQueue((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? { ...row, receiptSignedUrl: result.data.url }
            : row,
        ),
      );
    } else {
      setToast(result.error);
    }
  }

  useEffect(() => {
    setQueue(initialQueue);
    const first = initialQueue[0];
    if (!first) {
      setSelectedId("");
      setReceiptUrl(null);
      return;
    }
    void selectItem(first);
    // Re-sync when the server refreshes the queue after a decision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQueue]);

  function decide(decision: "VERIFIED" | "REJECTED") {
    if (!selected) return;
    if (decision === "REJECTED" && !remarks.trim()) {
      setToast("Remarks are required to reject a submission.");
      return;
    }

    startTransition(async () => {
      const result = await verifyPaymentSubmission({
        submissionId: selected.id,
        decision,
        remarks: remarks.trim() || undefined,
      });

      if (!result.success) {
        setToast(result.error);
        return;
      }

      setQueue((prev) => prev.filter((item) => item.id !== selected.id));
      setToast(
        decision === "VERIFIED"
          ? `Verified ${selected.referenceNumber}`
          : `Rejected ${selected.referenceNumber}`,
      );
      setRemarks("");

      const next = pendingItems.find((p) => p.id !== selected.id);
      if (next) {
        await selectItem(next);
      } else {
        setSelectedId("");
        setReceiptUrl(null);
      }

      router.refresh();
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-elevated)] px-5">
        <div>
          <h1 className="text-sm font-semibold text-[var(--ink)]">
            Treasurer Verification
          </h1>
          <p className="text-xs text-[var(--ink-muted)]">
            {pendingItems.length} pending · maker-checker queue
          </p>
        </div>
        {toast && (
          <p className="rounded-lg bg-[var(--brand-soft)] px-3 py-1.5 text-xs font-medium text-[var(--brand)]">
            {toast}
          </p>
        )}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <aside className="flex min-h-0 flex-col border-r border-[var(--border)] bg-[var(--surface-elevated)]">
          <div className="border-b border-[var(--border)] px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              Pending verification
            </p>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto p-2">
            {pendingItems.length === 0 && (
              <li className="rounded-lg bg-[var(--surface)] px-3 py-6 text-center text-sm text-[var(--ink-muted)]">
                Queue clear — no pending submissions
              </li>
            )}
            {pendingItems.map((item) => {
              const Icon = channelIcon[item.paymentChannel];
              const active = item.id === selected?.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void selectItem(item)}
                    className={clsx(
                      "mb-1 w-full rounded-lg px-3 py-2.5 text-left transition-colors",
                      active
                        ? "bg-[var(--brand-soft)] ring-1 ring-[var(--brand)]/30"
                        : "hover:bg-[var(--surface)]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-medium text-[var(--ink)]">
                        {item.memberName}
                      </p>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--ink)]">
                        {formatPHP(item.amount)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-[var(--ink-muted)]">
                      {item.targetLabel}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--ink-muted)]">
                      <Icon className="h-3 w-3" />
                      <span>{item.paymentChannel.replace("_", " ")}</span>
                      <Clock className="ml-auto h-3 w-3" />
                      <span>
                        {new Date(item.submittedAt).toLocaleTimeString("en-PH", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="min-h-[420px] min-w-0 border-r border-[var(--border)] bg-[var(--surface-elevated)] lg:min-h-0">
          {selected && receiptUrl ? (
            <ReceiptPreview
              src={receiptUrl}
              alt={`Receipt from ${selected.memberName}`}
              referenceNumber={selected.referenceNumber}
            />
          ) : selected ? (
            <div className="flex h-full items-center justify-center text-sm text-[var(--ink-muted)]">
              Loading signed receipt URL…
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--ink-muted)]">
              Select a submission to preview its receipt
            </div>
          )}
        </section>

        <aside className="flex min-h-0 flex-col bg-[var(--surface-elevated)]">
          <div className="border-b border-[var(--border)] px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              Decision
            </p>
          </div>

          {selected ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-[var(--ink-muted)]">Member</dt>
                  <dd className="font-medium text-[var(--ink)]">
                    {selected.memberName}
                  </dd>
                  <dd className="text-xs text-[var(--ink-muted)]">
                    {selected.memberEmail}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--ink-muted)]">Target</dt>
                  <dd className="font-medium text-[var(--ink)]">
                    {selected.targetLabel}
                  </dd>
                  <dd className="text-xs text-[var(--ink-muted)]">
                    {selected.targetType.replace("_", " ")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--ink-muted)]">Amount</dt>
                  <dd className="text-lg font-semibold tabular-nums text-[var(--ink)]">
                    {formatPHP(selected.amount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--ink-muted)]">Channel</dt>
                  <dd className="font-medium text-[var(--ink)]">
                    {selected.paymentChannel.replace("_", " ")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--ink-muted)]">Reference</dt>
                  <dd className="font-mono text-sm font-semibold text-[var(--ink)]">
                    {selected.referenceNumber}
                  </dd>
                </div>
              </dl>

              <div>
                <label
                  htmlFor="remarks"
                  className="text-xs font-medium text-[var(--ink-muted)]"
                >
                  Remarks
                </label>
                <textarea
                  id="remarks"
                  rows={4}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Optional for approve; required for reject…"
                  className="mt-1.5 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
                />
              </div>

              <div className="mt-auto space-y-2 pt-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => decide("VERIFIED")}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Approve · VERIFIED
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => decide("REJECTED")}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                >
                  <XCircle className="h-4 w-4" />
                  Reject · REJECTED
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[var(--ink-muted)]">
              Nothing selected
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
