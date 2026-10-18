"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelPaymentSubmission } from "@/actions/payment-submission";
import type { MemberPendingSubmission } from "@/lib/queries/member-pending-submissions";

type PendingSubmissionCancelListProps = {
  submissions: MemberPendingSubmission[];
  /** Compact for embed under Pay / Dashboard. */
  compact?: boolean;
};

/**
 * Member self-service: withdraw unreviewed payment proofs.
 * Only the submitting member can cancel; server enforces ownership + PENDING.
 */
export function PendingSubmissionCancelList({
  submissions,
  compact = false,
}: PendingSubmissionCancelListProps) {
  const router = useRouter();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (submissions.length === 0) return null;

  function cancel(submissionId: string) {
    if (confirmId !== submissionId) {
      setConfirmId(submissionId);
      setError(null);
      return;
    }
    setBusyId(submissionId);
    startTransition(async () => {
      const result = await cancelPaymentSubmission(submissionId);
      setBusyId(null);
      setConfirmId(null);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  return (
    <section
      className={
        compact
          ? "rl-panel"
          : "rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4"
      }
      aria-labelledby="pending-proofs-heading"
    >
      <div className="mb-3">
        <h2 className="type-title" id="pending-proofs-heading">
          Awaiting verification
        </h2>
        <p className="type-caption mt-1 text-[var(--ink-secondary)]">
          Submitted proofs are not reviewed yet — you can delete them anytime
          before the treasurer acts.
        </p>
      </div>

      {error ? (
        <p className="rl-alert rl-alert-error mb-3" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {submissions.map((row) => {
          const confirming = confirmId === row.id;
          const busy = pending && busyId === row.id;
          return (
            <li
              key={row.id}
              className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface)] p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="type-body-sm font-semibold text-[var(--ink)]">
                    {row.label}
                  </p>
                  <p className="type-caption mt-0.5 font-mono tabular-nums text-[var(--ink-muted)]">
                    {row.channelLabel} · ref {row.referenceNumber}
                  </p>
                </div>
                <p className="shrink-0 font-mono text-sm font-bold tabular-nums text-[var(--ink)]">
                  {row.amountLabel}
                </p>
              </div>

              {confirming ? (
                <p className="type-caption mt-2 text-[var(--ink-secondary)]">
                  Delete this submitted proof? Late fees resume if the period is
                  past grace. You can submit again afterward.
                </p>
              ) : null}

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={
                    confirming
                      ? "rl-btn rl-btn-danger-outline rl-btn-sm"
                      : "rl-btn rl-btn-secondary rl-btn-sm"
                  }
                  disabled={busy}
                  onClick={() => cancel(row.id)}
                >
                  {busy
                    ? "Deleting…"
                    : confirming
                      ? "Confirm delete"
                      : "Delete submission"}
                </button>
                {confirming ? (
                  <button
                    type="button"
                    className="rl-btn rl-btn-ghost rl-btn-sm"
                    disabled={busy}
                    onClick={() => setConfirmId(null)}
                  >
                    Keep submitted
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
