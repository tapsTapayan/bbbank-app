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
import { SplitView } from "@/components/system/frames/split-view";
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
      title="Verify"
      padded={false}
      actions={
        <>
          <span
            className={
              pendingItems.length > 0
                ? "rl-pill rl-pill-pending"
                : "rl-pill rl-pill-verified"
            }
          >
            {pendingItems.length} pending
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
      {/* Mobile Segmented Switcher (<768px) */}
      <div
        className="rl-ops-tabs lg:hidden"
        role="tablist"
        aria-label="Verification panes"
      >
        {(
          [
            ["queue", `Queue (${pendingItems.length})`],
            ["receipt", "Receipt"],
            ["decide", "Decision"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mobilePane === id}
            className="rl-ops-tab"
            onClick={() => setMobilePane(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <SplitView
        variant="triple"
        className="min-h-0 min-w-0 flex-1 overflow-auto lg:overflow-hidden"
      >
        {/* Pane 1: Pending Queue */}
        <aside
          className={clsx(
            "rl-ops-pane",
            mobilePane === "queue" ? "flex" : "hidden lg:flex",
          )}
        >
          <div className="rl-ops-toolbar">
            <p className="type-label">Queue</p>
            <span className="type-caption font-mono tabular-nums">
              {pendingItems.length} open
            </span>
          </div>
          <ul className="rl-ops-pane-scroll space-y-2 p-3">
            {pendingItems.length === 0 ? (
              <li className="rl-inset py-12 text-center type-body-sm type-muted">
                Queue clear
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
                    className={clsx("rl-ops-row", active && "is-selected")}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <p className="type-body-sm truncate font-semibold">
                        {item.memberName}
                      </p>
                      <span className="font-mono text-sm font-bold shrink-0 tabular-nums text-[var(--ink)]">
                        {formatPHP(item.amount)}
                      </span>
                    </div>
                    <p className="type-caption truncate">{item.targetLabel}</p>
                    <div className="mt-1.5 flex w-full items-center gap-2 type-caption">
                      <span className="inline-flex items-center gap-1 rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--ink-secondary)]">
                        <Icon className="h-3 w-3" aria-hidden />
                        {item.paymentChannel.replace("_", " ")}
                      </span>
                      <span className="ml-auto inline-flex items-center gap-1 font-mono text-[11px]">
                        <Clock className="h-3 w-3" aria-hidden />
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

        {/* Pane 2: High-Contrast Receipt Inspection */}
        <section
          className={clsx(
            "rl-ops-pane min-h-[320px] bg-[var(--surface)]",
            mobilePane === "receipt" ? "flex" : "hidden lg:flex",
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
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="type-title">Cash payment</p>
              <p className="type-metric tabular-nums">
                {new Date(selected.paidAt).toLocaleDateString("en-PH", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </p>
              <p className="type-caption max-w-xs">
                No receipt — confirm against cash logbook.
              </p>
            </div>
          ) : selected ? (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 type-body-sm type-muted">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--brand)]" />
              <span>Loading receipt…</span>
            </div>
          ) : (
            <div className="rl-ops-empty">
              <p className="type-title">Select a submission</p>
            </div>
          )}
        </section>

        {/* Pane 3: Verification Telemetry & Decision Controls */}
        <aside
          className={clsx(
            "rl-ops-pane",
            mobilePane === "decide" ? "flex" : "hidden lg:flex",
          )}
        >
          <div className="rl-ops-toolbar">
            <p className="type-label">Decision</p>
            {selected ? (
              <span className="type-caption font-mono">
                {selected.memberHeadsCount}H
              </span>
            ) : null}
          </div>

          {selected ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="rl-ops-pane-scroll rl-stack p-4">
                <div className="grid gap-3">
                  <AiMatchBadge item={selected} />
                  <CpePenaltyBadge item={selected} />
                </div>

                <dl className="grid grid-cols-2 gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3.5">
                  <div className="col-span-2">
                    <dt className="type-label">Member</dt>
                    <dd className="type-body-sm mt-0.5 font-semibold">
                      {selected.memberName}
                    </dd>
                    <dd className="type-caption">
                      {selected.memberEmail} · {selected.memberHeadsCount} head
                      {selected.memberHeadsCount === 1 ? "" : "s"}
                    </dd>
                  </div>
                  <div>
                    <dt className="type-label">Target</dt>
                    <dd className="type-body-sm mt-0.5 font-medium">
                      {selected.targetLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="type-label">Declared Date</dt>
                    <dd className="type-body-sm mt-0.5 font-mono font-semibold tabular-nums">
                      {new Date(selected.paidAt).toLocaleDateString("en-PH", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC",
                      })}
                    </dd>
                  </div>
                </dl>

                <label className="rl-field" htmlFor="credited-amount">
                  <span className="rl-field-label">Credited Amount (₱)</span>
                  <input
                    id="credited-amount"
                    type="text"
                    inputMode="decimal"
                    value={creditedAmount}
                    onChange={(e) => setCreditedAmount(e.target.value)}
                    className="rl-input font-mono text-base font-bold tabular-nums"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="rl-field" htmlFor="edit-channel">
                    <span className="rl-field-label">Channel</span>
                    <select
                      id="edit-channel"
                      value={editChannel}
                      onChange={(e) =>
                        setEditChannel(e.target.value as typeof editChannel)
                      }
                      className="rl-select"
                    >
                      <option value="GCASH">GCash</option>
                      <option value="MAYA">Maya / PayMaya</option>
                      <option value="BANK_TRANSFER">Bank transfer</option>
                      <option value="OTHER_DIGITAL">Other digital</option>
                      <option value="CASH">Cash</option>
                    </select>
                  </label>
                  <label className="rl-field" htmlFor="edit-ref">
                    <span className="rl-field-label">Reference No.</span>
                    <input
                      id="edit-ref"
                      type="text"
                      value={editReference}
                      onChange={(e) => setEditReference(e.target.value)}
                      className="rl-input font-mono text-sm"
                    />
                  </label>
                </div>

                <label className="rl-field" htmlFor="remarks">
                  <span className="rl-field-label">
                    Remarks (required to reject)
                  </span>
                  <textarea
                    id="remarks"
                    rows={2}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Reason for rejection or audit note…"
                    className="rl-textarea"
                  />
                </label>
              </div>

              <div className="sticky bottom-0 shrink-0 border-t border-[var(--border)] bg-[var(--surface-elevated)] p-4">
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => decide("VERIFIED")}
                    className="rl-btn rl-btn-success rl-btn-block"
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
                    className="rl-btn rl-btn-danger rl-btn-block"
                  >
                    <XCircle className="h-4 w-4" aria-hidden />
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center type-body-sm type-muted">
              No submission selected
            </div>
          )}
        </aside>
      </SplitView>
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
        "rounded-[var(--radius-md)] border p-3.5",
        overdue
          ? "border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning)]"
          : "border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--brand-strong)]",
      )}
    >
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
        {overdue ? (
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
        )}
        {item.isCatchUp ? "Catch-up late fee" : "Grace & late fee"}
      </div>
      <dl className="mt-2.5 space-y-1 text-xs">
        {item.obligationTotalRemaining != null ? (
          <div className="flex justify-between gap-2">
            <dt className="opacity-80">Obligation Due</dt>
            <dd className="font-mono font-bold tabular-nums text-[var(--ink)]">
              {formatPHP(item.obligationTotalRemaining)}
              {item.obligationBaseRemaining != null && item.penaltyAmount > 0
                ? ` (${formatPHP(item.obligationBaseRemaining)} + late)`
                : ""}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-2">
          <dt className="opacity-80">Due Date</dt>
          <dd className="font-mono font-medium text-[var(--ink)]">
            {formatDate(item.dueDate)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="opacity-80">
            {item.isWithinGrace ? "Grace ends" : "Grace lapsed"}
          </dt>
          <dd className="font-mono font-medium text-[var(--ink)]">
            {formatDate(item.graceDeadline)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="opacity-80">
            Late Penalty ({item.daysDelayed}d × ₱{item.penaltyRatePerHeadPerDay} ×{" "}
            {item.headsSnapshot ?? 1}H)
          </dt>
          <dd className="font-mono font-bold tabular-nums text-[var(--ink)]">
            {formatPHP(item.penaltyAmount)}
          </dd>
        </div>
      </dl>
      {item.penaltyAccrualFrozen ? (
        <p className="mt-2 text-[11px] font-semibold">
          Pass granted — late fee waived
        </p>
      ) : item.penaltyFrozenAtSubmit ? (
        <p className="mt-2 text-[11px] font-medium opacity-85">
          Frozen at payment date · reject resumes accrual
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
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3.5 py-2.5 type-caption">
        No OCR data on this submission
      </div>
    );
  }

  if (status.kind === "match") {
    return (
      <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--success-border)] bg-[var(--success-soft)] px-3.5 py-2.5 text-xs font-bold text-[var(--success)]">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
        OCR matches amount & reference
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--warning-border)] bg-[var(--warning-soft)] p-3.5 text-[var(--warning)]">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
        <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
        OCR differs from entry
      </div>
      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="opacity-80">Amount</dt>
          <dd className="text-right font-mono tabular-nums text-[var(--ink)]">
            <span className="opacity-70">
              OCR {status.aiAmount != null ? formatPHP(status.aiAmount) : "—"}
            </span>
            <span className="mx-1 opacity-50">→</span>
            <span className="font-bold">
              {formatPHP(status.submittedAmount)}
            </span>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="opacity-80">Reference</dt>
          <dd className="max-w-[65%] text-right font-mono break-all text-[var(--ink)]">
            <span className="opacity-70">OCR {status.aiRefNo ?? "—"}</span>
            <span className="mx-1 opacity-50">→</span>
            <span className="font-bold">{status.submittedRefNo}</span>
          </dd>
        </div>
      </dl>
      {item.aiConfidenceNote ? (
        <p className="mt-1.5 text-[11px] opacity-85">{item.aiConfidenceNote}</p>
      ) : null}
    </div>
  );
}
