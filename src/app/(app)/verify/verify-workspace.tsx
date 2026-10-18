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
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CalendarClock,
} from "lucide-react";
import { clsx } from "clsx";
import { verifyPaymentSubmission } from "@/actions/treasurer-verification";
import { fetchReceiptSignedUrl } from "@/actions/receipts";
import type { VerifyQueueItem } from "@/lib/queries/pending-submissions";
import { formatPHP } from "@/lib/finance/loan-calculator";
import { evaluateAiMatch } from "@/lib/finance/ai-match";
import { OpsWorkstation } from "@/components/ui/ops-workstation";
import { ReceiptPreview } from "./receipt-preview";

const channelIcon = {
  GCASH: Smartphone,
  MAYA: Smartphone,
  BANK_TRANSFER: Building2,
  OTHER_DIGITAL: Smartphone,
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
  const [creditedAmount, setCreditedAmount] = useState("");
  const [editChannel, setEditChannel] = useState<
    "GCASH" | "MAYA" | "BANK_TRANSFER" | "OTHER_DIGITAL" | "CASH"
  >("GCASH");
  const [editReference, setEditReference] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [mobilePane, setMobilePane] = useState<"queue" | "receipt" | "decide">(
    "queue",
  );

  const pendingItems = useMemo(
    () => queue.filter((s) => s.status === "PENDING_VERIFICATION"),
    [queue],
  );

  const selected =
    queue.find((s) => s.id === selectedId) ?? pendingItems[0] ?? null;

  async function selectItem(item: VerifyQueueItem) {
    setSelectedId(item.id);
    setRemarks("");
    setCreditedAmount(item.amount.toFixed(2));
    setEditChannel(item.paymentChannel);
    setEditReference(item.referenceNumber);
    setToast(null);
    setMobilePane("receipt");
    if (item.receiptSignedUrl) {
      setReceiptUrl(item.receiptSignedUrl);
      return;
    }
    setReceiptUrl(null);
    if (!item.receiptStoragePath) {
      return;
    }
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
        creditedAmount:
          decision === "VERIFIED" ? creditedAmount.trim() : undefined,
        paymentChannel: decision === "VERIFIED" ? editChannel : undefined,
        referenceNumber:
          decision === "VERIFIED" ? editReference.trim() : undefined,
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
    <OpsWorkstation
      title="Verify payments"
      description="Pending receipts"
      padded={false}
      actions={
        <>
          <span className="ui-pill ui-pill-verified">
            {pendingItems.length} pending
          </span>
          {toast ? (
            <p className="ui-alert ui-alert-info !py-2 type-caption" role="status">
              {toast}
            </p>
          ) : null}
        </>
      }
    >
      <div
        className="flex shrink-0 gap-1 border-b border-[var(--border)] bg-[var(--surface-elevated)] p-2 md:hidden"
        role="tablist"
        aria-label="Verify panes"
      >
        {(
          [
            ["queue", "Queue"],
            ["receipt", "Receipt"],
            ["decide", "Decide"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mobilePane === id}
            className={clsx(
              "ui-btn ui-btn-sm flex-1 type-caption",
              mobilePane === id ? "ui-btn-ink" : "ui-btn-ghost",
            )}
            onClick={() => setMobilePane(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="ui-ops-split ui-ops-split--triple min-h-0 flex-1 overflow-auto md:overflow-hidden">
        <aside
          className={clsx(
            "ui-ops-pane",
            mobilePane === "queue" ? "flex" : "hidden md:flex",
          )}
        >
          <div className="ui-ops-toolbar">
            <p className="type-label">Queue</p>
          </div>
          <ul className="ui-ops-pane-scroll space-y-2 p-2">
            {pendingItems.length === 0 ? (
              <li className="ui-inset py-10 text-center type-body-sm type-muted">
                Queue clear — no pending receipts.
              </li>
            ) : null}
            {pendingItems.map((item) => {
              const Icon = channelIcon[item.paymentChannel];
              const active = item.id === selected?.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void selectItem(item)}
                    aria-current={active ? "true" : undefined}
                    className={clsx("ui-ops-row", active && "is-selected")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="type-body-sm truncate font-medium">
                        {item.memberName}
                      </p>
                      <span className="type-caption shrink-0 font-semibold tabular-nums text-[var(--ink)]">
                        {formatPHP(item.amount)}
                      </span>
                    </div>
                    <p className="type-caption mt-1 truncate">
                      {item.targetLabel}
                    </p>
                    <div className="mt-2 flex items-center gap-2 type-caption">
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                      <span>{item.paymentChannel.replace("_", " ")}</span>
                      <Clock className="ml-auto h-3.5 w-3.5" aria-hidden />
                      <span>
                        {new Date(item.submittedAt).toLocaleTimeString(
                          "en-PH",
                          {
                            hour: "numeric",
                            minute: "2-digit",
                          },
                        )}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section
          className={clsx(
            "ui-ops-pane min-h-[280px] bg-[var(--surface)] sm:min-h-[360px]",
            mobilePane === "receipt" ? "flex" : "hidden md:flex",
          )}
        >
          {selected && receiptUrl ? (
            <ReceiptPreview
              src={receiptUrl}
              alt={`Receipt from ${selected.memberName}`}
              referenceNumber={selected.referenceNumber}
              aiExtractedRefNo={selected.aiExtractedRefNo}
            />
          ) : selected && !selected.receiptStoragePath ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="ui-ops-empty-icon">
                <Building2 className="h-5 w-5" aria-hidden />
              </div>
              <p className="type-body-sm font-medium">
                Cash · no receipt image
              </p>
              <p className="type-metric tabular-nums tracking-tight">
                {new Date(selected.paidAt).toLocaleDateString("en-PH", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </p>
              <p className="type-caption max-w-xs">
                Member attested this payment date. Confirm with your cash log
                before verifying.
              </p>
            </div>
          ) : selected ? (
            <div className="flex h-full min-h-[240px] items-center justify-center type-body-sm type-muted">
              Loading signed receipt…
            </div>
          ) : (
            <div className="ui-ops-empty">
              <div className="ui-ops-empty-icon">
                <CheckCircle2 className="h-5 w-5" aria-hidden />
              </div>
              <p className="type-body-sm font-medium">Select a submission</p>
              <p className="type-caption max-w-xs">
                Choose a pending receipt from the queue to review side by side.
              </p>
            </div>
          )}
        </section>

        <aside
          className={clsx(
            "ui-ops-pane",
            mobilePane === "decide" ? "flex" : "hidden md:flex",
          )}
        >
          <div className="ui-ops-toolbar">
            <p className="type-label">Decision</p>
          </div>

          {selected ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="ui-ops-pane-scroll ui-stack p-4">
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1">
                  <AiMatchBadge item={selected} />
                  <CpePenaltyBadge item={selected} />
                </div>

                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <div>
                    <dt className="type-caption">Member</dt>
                    <dd className="type-body-sm mt-1 font-medium">
                      {selected.memberName}
                    </dd>
                    <dd className="type-caption mt-1">
                      {selected.memberEmail} · {selected.memberHeadsCount} head
                      {selected.memberHeadsCount === 1 ? "" : "s"}
                    </dd>
                  </div>
                  <div>
                    <dt className="type-caption">Target</dt>
                    <dd className="type-body-sm mt-1 font-medium">
                      {selected.targetLabel}
                    </dd>
                    <dd className="type-caption mt-1">
                      {selected.targetType.replace("_", " ")}
                    </dd>
                  </div>
                  <div>
                    <dt className="type-caption">Submitted amount</dt>
                    <dd className="type-body-sm mt-1 tabular-nums font-medium">
                      {formatPHP(selected.amount)}
                    </dd>
                    {selected.aiExtractedAmount != null ? (
                      <dd className="type-caption mt-1">
                        OCR {formatPHP(selected.aiExtractedAmount)}
                        {Math.abs(
                          selected.amount - selected.aiExtractedAmount,
                        ) > 0.009
                          ? " · mismatch"
                          : ""}
                      </dd>
                    ) : null}
                  </div>
                  <div>
                    <dt className="type-caption">Payment date</dt>
                    <dd className="type-body-sm mt-1 font-medium tabular-nums">
                      {new Date(selected.paidAt).toLocaleDateString("en-PH", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC",
                      })}
                    </dd>
                    <dd className="type-caption mt-1">
                      {selected.paymentChannel === "CASH" &&
                      !selected.receiptStoragePath
                        ? "Cash attestation · no receipt image"
                        : "Declared by member"}
                    </dd>
                  </div>
                </dl>

                <label className="ui-field" htmlFor="credited-amount">
                  <span className="ui-field-label">Credited amount (₱)</span>
                  <input
                    id="credited-amount"
                    type="text"
                    inputMode="decimal"
                    value={creditedAmount}
                    onChange={(e) => setCreditedAmount(e.target.value)}
                    className="ui-input tabular-nums"
                  />
                  <span className="type-caption">
                    Treasurer may correct OCR / receipt amount before approve.
                    Partial and advance credits are allowed.
                  </span>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="ui-field" htmlFor="edit-channel">
                    <span className="ui-field-label">Channel</span>
                    <select
                      id="edit-channel"
                      value={editChannel}
                      onChange={(e) =>
                        setEditChannel(
                          e.target.value as typeof editChannel,
                        )
                      }
                      className="ui-select"
                    >
                      <option value="GCASH">GCash</option>
                      <option value="MAYA">Maya / PayMaya</option>
                      <option value="BANK_TRANSFER">Bank transfer</option>
                      <option value="OTHER_DIGITAL">Other digital</option>
                      <option value="CASH">Cash</option>
                    </select>
                  </label>
                  <label className="ui-field" htmlFor="edit-ref">
                    <span className="ui-field-label">Reference</span>
                    <input
                      id="edit-ref"
                      type="text"
                      value={editReference}
                      onChange={(e) => setEditReference(e.target.value)}
                      className="ui-input font-mono"
                    />
                  </label>
                </div>

                <label className="ui-field" htmlFor="remarks">
                  <span className="ui-field-label">Remarks</span>
                  <textarea
                    id="remarks"
                    rows={3}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Required to reject"
                    className="ui-textarea"
                  />
                </label>
              </div>

              <div className="sticky bottom-0 shrink-0 border-t border-[var(--border)] bg-[var(--surface-elevated)] p-4 sm:static">
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => decide("VERIFIED")}
                    className="ui-btn ui-btn-success ui-btn-block"
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                    )}
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => decide("REJECTED")}
                    className="ui-btn ui-btn-danger ui-btn-block"
                  >
                    <XCircle className="h-4 w-4" aria-hidden />
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center type-body-sm type-muted">
              Nothing selected
            </div>
          )}
        </aside>
      </div>
    </OpsWorkstation>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function CpePenaltyBadge({ item }: { item: VerifyQueueItem }) {
  if (!item.dueDate || !item.graceDeadline) {
    return null;
  }

  const overdue = item.isOverdue || item.penaltyAmount > 0;

  return (
    <div
      className={clsx(
        "rounded-[var(--radius)] px-3 py-2.5 ring-1",
        overdue
          ? "bg-[var(--warning-soft)] text-[var(--warning)] ring-[color-mix(in_oklab,var(--warning)_28%,transparent)]"
          : item.isCatchUp
            ? "bg-[var(--brand-soft)] text-[var(--brand)] ring-[color-mix(in_oklab,var(--brand-accent)_35%,transparent)]"
            : item.isWithinGrace
              ? "bg-[var(--brand-soft)] text-[var(--brand)] ring-[color-mix(in_oklab,var(--brand-accent)_35%,transparent)]"
              : "bg-[var(--surface)] text-[var(--ink)] ring-[var(--border)]",
      )}
    >
      <div className="flex items-center gap-2 type-body-sm font-semibold">
        {overdue ? (
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
        )}
        {item.isCatchUp ? "Catch-up late fee check" : "Late fee check"}
      </div>
      <dl className="mt-2 space-y-1 type-caption">
        {item.obligationTotalRemaining != null ? (
          <div className="flex justify-between gap-2">
            <dt className="opacity-80">Obligation due</dt>
            <dd className="font-semibold tabular-nums text-[var(--ink)]">
              {formatPHP(item.obligationTotalRemaining)}
              {item.obligationBaseRemaining != null && item.penaltyAmount > 0
                ? ` (${formatPHP(item.obligationBaseRemaining)} + late)`
                : ""}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-2">
          <dt className="opacity-80">Submitted</dt>
          <dd className="font-medium tabular-nums text-[var(--ink)]">
            {formatPHP(item.amount)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="opacity-80">Due date</dt>
          <dd className="font-medium text-[var(--ink)]">
            {formatDate(item.dueDate)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="opacity-80">
            {item.gracePeriodDays}-day grace ends
          </dt>
          <dd className="font-medium text-[var(--ink)]">
            {formatDate(item.graceDeadline)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="opacity-80">Heads snapshot</dt>
          <dd className="font-medium text-[var(--ink)]">
            {item.headsSnapshot ?? "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="opacity-80">Chargeable days</dt>
          <dd className="font-medium tabular-nums text-[var(--ink)]">
            {item.daysDelayed}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="opacity-80">
            ₱{item.penaltyRatePerHeadPerDay}/head/day
          </dt>
          <dd className="font-semibold tabular-nums text-[var(--ink)]">
            {formatPHP(item.penaltyAmount)}
          </dd>
        </div>
      </dl>
      <p className="type-caption mt-2 opacity-80">{item.lateFeeBreakdown}</p>
      {item.penaltyAccrualFrozen ? (
        <p className="type-caption mt-1 font-medium opacity-90">
          Pass granted — late fee waived
        </p>
      ) : item.penaltyFrozenAtSubmit ? (
        <p className="type-caption mt-1 font-medium opacity-90">
          Frozen at submit · reject resumes accrual
        </p>
      ) : null}
    </div>
  );
}

function AiMatchBadge({ item }: { item: VerifyQueueItem }) {
  const status = evaluateAiMatch({
    amount: item.amount,
    referenceNumber: item.referenceNumber,
    aiExtractedAmount: item.aiExtractedAmount,
    aiExtractedRefNo: item.aiExtractedRefNo,
  });

  if (status.kind === "none") {
    return (
      <div className="rounded-[var(--radius)] bg-[var(--surface)] px-3 py-2 type-caption text-[var(--ink-muted)] ring-1 ring-[var(--border)]">
        No AI scan
      </div>
    );
  }

  if (status.kind === "match") {
    return (
      <div className="flex items-center gap-2 rounded-[var(--radius)] bg-[var(--success-soft)] px-3 py-2.5 type-body-sm font-semibold text-[var(--success)] ring-1 ring-[color-mix(in_oklab,var(--success)_28%,transparent)]">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
        AI match
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius)] bg-[var(--warning-soft)] px-3 py-2.5 text-[var(--warning)] ring-1 ring-[color-mix(in_oklab,var(--warning)_28%,transparent)]">
      <div className="flex items-center gap-2 type-body-sm font-semibold">
        <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
        Manual override
      </div>
      <dl className="mt-2 space-y-1.5 type-caption">
        <div className="flex justify-between gap-2">
          <dt className="opacity-80">Amount</dt>
          <dd className="text-right tabular-nums text-[var(--ink)]">
            <span className="opacity-70">
              AI {status.aiAmount != null ? formatPHP(status.aiAmount) : "—"}
            </span>
            <span className="mx-1 opacity-50">→</span>
            <span className="font-semibold">
              {formatPHP(status.submittedAmount)}
            </span>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="opacity-80">Reference</dt>
          <dd className="max-w-[65%] text-right font-mono break-all text-[var(--ink)]">
            <span className="opacity-70">AI {status.aiRefNo ?? "—"}</span>
            <span className="mx-1 opacity-50">→</span>
            <span className="font-semibold">{status.submittedRefNo}</span>
          </dd>
        </div>
      </dl>
      {item.aiConfidenceNote ? (
        <p className="type-caption mt-2 opacity-80">{item.aiConfidenceNote}</p>
      ) : null}
    </div>
  );
}
