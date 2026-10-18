"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenCheck,
  CheckCircle2,
  Flag,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { clsx } from "clsx";
import { auditPaymentSubmission } from "@/actions/audit";
import { fetchReceiptSignedUrl } from "@/actions/receipts";
import { formatPHP } from "@/lib/finance/loan-calculator";
import { OpsWorkstation } from "@/components/ui/ops-workstation";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import { SplitView, SplitPane } from "@/components/system/frames/split-view";
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
  const [mobilePane, setMobilePane] = useState<"queue" | "receipt" | "decide">(
    "queue",
  );

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
      setToast("Remarks are required to flag a record.");
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
      setToast(result.message ?? "Audit decision recorded.");
      setRemarks("");
      router.refresh();
    });
  }

  return (
    <OpsWorkstation
      title="Auditor Ledger Desk"
      description="Seal verified records as immutable AUDITED or flag discrepancies"
      padded={false}
      actions={
        <>
          <span className="rl-pill rl-pill-audited">
            {queue.length} awaiting audit
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
      {queue.length === 0 ? (
        <EmptyState
          icon={<BookOpenCheck className="h-5 w-5" aria-hidden />}
          title="Audit Queue Clear"
          description="All Treasurer-verified submissions have been audited."
          className="px-[var(--page-pad-x)]"
        />
      ) : (
        <>
          <div
            className="rl-ops-tabs md:hidden"
            role="tablist"
            aria-label="Audit panes"
          >
            {(
              [
                ["queue", `Queue (${queue.length})`],
                ["receipt", "Receipt"],
                ["decide", "Audit Seal"],
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

          <SplitView variant="triple" className="min-h-0 flex-1">
            <SplitPane
              className={clsx(
                mobilePane === "queue" ? "flex" : "hidden md:flex",
              )}
            >
              <div className="rl-ops-toolbar">
                <p className="type-label">Verified Submissions</p>
                <span className="type-caption font-mono">{queue.length}</span>
              </div>
              <ul className="rl-ops-pane-scroll space-y-2 p-3">
                {queue.map((item) => {
                  const active = selected?.id === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={clsx("rl-ops-row", active && "is-selected")}
                        onClick={() => {
                          setSelectedId(item.id);
                          setMobilePane("receipt");
                        }}
                      >
                        <div className="flex w-full items-start justify-between gap-2">
                          <p className="type-body-sm truncate font-semibold">
                            {item.memberName}
                          </p>
                          <span className="font-mono text-sm font-bold tabular-nums text-[var(--ink)]">
                            {formatPHP(item.amount)}
                          </span>
                        </div>
                        <p className="type-caption truncate">
                          {item.targetLabel}
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-[var(--ink-muted)]">
                          {item.paymentChannel.replace("_", " ")} · Ref:{" "}
                          {item.referenceNumber}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </SplitPane>

            <SplitPane
              className={clsx(
                "bg-[var(--surface)]",
                mobilePane === "receipt" ? "flex" : "hidden md:flex",
              )}
            >
              {selected && receiptUrl ? (
                <ReceiptPreview
                  src={receiptUrl}
                  alt={`Receipt from ${selected.memberName}`}
                  referenceNumber={selected.referenceNumber}
                />
              ) : selected && !selected.receiptStoragePath ? (
                <div className="rl-ops-empty">
                  <p className="type-title">Cash Attestation (No Image)</p>
                  <p className="type-caption max-w-xs">
                    Verified against physical cash logbook.
                  </p>
                </div>
              ) : (
                <div className="rl-ops-empty">
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--brand)]" />
                  <p className="type-caption">Loading receipt…</p>
                </div>
              )}
            </SplitPane>

            <SplitPane
              className={clsx(
                mobilePane === "decide" ? "flex" : "hidden md:flex",
              )}
            >
              <div className="rl-ops-toolbar">
                <p className="type-label">Auditor Sign-Off</p>
              </div>
              {selected ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="rl-ops-pane-scroll p-4 rl-stack">
                    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
                      <p className="type-label">Verified Record</p>
                      <h2 className="type-title mt-1">{selected.memberName}</h2>
                      <p className="type-caption mt-0.5">
                        {selected.targetLabel}
                      </p>
                      <p className="type-metric mt-3 tabular-nums">
                        <Money amount={selected.amount} metric />
                      </p>
                      <p className="mt-2 font-mono text-xs text-[var(--ink-secondary)]">
                        {selected.paymentChannel} · Ref:{" "}
                        {selected.referenceNumber}
                      </p>
                    </div>

                    <div className="rl-inset flex items-start gap-2.5">
                      <ShieldCheck
                        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]"
                        aria-hidden
                      />
                      <p className="type-caption leading-relaxed">
                        Once marked <strong className="font-semibold">AUDITED</strong>, this submission and its ledger entries are permanently sealed and immutable.
                      </p>
                    </div>

                    <label className="rl-field">
                      <span className="rl-field-label">
                        Auditor Remarks (Required to Flag)
                      </span>
                      <textarea
                        rows={3}
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        className="rl-textarea"
                        placeholder="Audit note or discrepancy details…"
                      />
                    </label>
                  </div>

                  <div className="sticky bottom-0 shrink-0 border-t border-[var(--border)] bg-[var(--surface-elevated)] p-4">
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        disabled={pending}
                        className="rl-btn rl-btn-success rl-btn-block"
                        onClick={() => decide("AUDITED")}
                      >
                        {pending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Seal Audited
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        className="rl-btn rl-btn-danger rl-btn-block"
                        onClick={() => decide("FLAGGED")}
                      >
                        <Flag className="h-4 w-4" />
                        Flag Record
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </SplitPane>
          </SplitView>
        </>
      )}
    </OpsWorkstation>
  );
}
