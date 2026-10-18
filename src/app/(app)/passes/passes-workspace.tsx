"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, TicketCheck } from "lucide-react";
import {
  waivePenaltyAll,
  waivePenaltyBulk,
  waivePenaltySingle,
} from "@/actions/penalty-waivers";
import { formatPHP } from "@/lib/finance/loan-calculator";
import { OpsWorkstation } from "@/components/ui/ops-workstation";
import { EmptyState } from "@/components/ui/empty-state";

export type PassTargetRow = {
  targetType: "CONTRIBUTION" | "LOAN_AMORTIZATION";
  targetId: string;
  memberName: string;
  label: string;
  penaltyAmount: number;
  dueDate: string;
};

export type PassHistoryRow = {
  id: string;
  batchId: string;
  memberName: string;
  label: string;
  amountWaived: number;
  reason: string;
  scope: string;
  issuedBy: string;
  createdAt: string;
};

export function PassesWorkspace({
  targets,
  history,
}: {
  targets: PassTargetRow[];
  history: PassHistoryRow[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showHistory, setShowHistory] = useState(false);

  const keyOf = (t: PassTargetRow) => `${t.targetType}:${t.targetId}`;

  const totalSelected = useMemo(() => {
    return targets
      .filter((t) => selected.has(keyOf(t)))
      .reduce((s, t) => s + t.penaltyAmount, 0);
  }, [targets, selected]);

  function toggle(row: PassTargetRow) {
    const key = keyOf(row);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function requireReason(): boolean {
    if (reason.trim().length < 3) {
      setToast("Enter a reason (e.g. payroll delayed).");
      return false;
    }
    return true;
  }

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
        setToast(result.error ?? "Failed.");
        return;
      }
      setToast(result.message ?? "Pass granted.");
      setSelected(new Set());
      setReason("");
      router.refresh();
    });
  }

  return (
    <OpsWorkstation
      title="Penalty passes"
      description="Waive late fees"
      bodyClassName="ui-stack"
      actions={
        <button
          type="button"
          className="ui-btn ui-btn-ghost"
          onClick={() => setShowHistory((v) => !v)}
        >
          {showHistory ? "Hide history" : "Show history"}
        </button>
      }
    >
      {toast ? (
        <p className="ui-alert ui-alert-info mb-4" role="status">
          {toast}
        </p>
      ) : null}

      <div className="ui-desk ui-desk-col mb-4">
        <section className="ui-desk-section">
          <label className="ui-field max-w-xl">
            <span className="ui-field-label">Reason (required)</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Payroll delayed — March 15 kinsena"
              className="ui-input"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || selected.size === 0}
              className="ui-btn ui-btn-primary"
              onClick={() => {
                if (!requireReason()) return;
                const list = targets.filter((t) => selected.has(keyOf(t)));
                if (list.length === 1) {
                  run(() =>
                    waivePenaltySingle({
                      targetType: list[0]!.targetType,
                      targetId: list[0]!.targetId,
                      reason,
                    }),
                  );
                } else {
                  run(() =>
                    waivePenaltyBulk({
                      targets: list.map((t) => ({
                        targetType: t.targetType,
                        targetId: t.targetId,
                      })),
                      reason,
                    }),
                  );
                }
              }}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Grant pass on selected ({selected.size}) ·{" "}
              {formatPHP(totalSelected)}
            </button>
            <button
              type="button"
              disabled={pending || targets.length === 0}
              className="ui-btn ui-btn-ghost"
              onClick={() => {
                if (!requireReason()) return;
                if (
                  !window.confirm(
                    `Waive late fees on all ${targets.length} open obligations?`,
                  )
                ) {
                  return;
                }
                run(() =>
                  waivePenaltyAll({
                    reason,
                    includeContributions: true,
                    includeLoans: true,
                  }),
                );
              }}
            >
              Grant pass on all ({targets.length})
            </button>
          </div>
        </section>
      </div>

      {targets.length === 0 ? (
        <EmptyState
          icon={<TicketCheck className="h-5 w-5" aria-hidden />}
          title="No open late fees"
        />
      ) : (
        <div className="ui-desk ui-desk-col min-h-0 flex-1 overflow-auto">
          <ul className="ui-data-cards mb-4 p-3 md:p-4">
            {targets.map((row) => {
              const key = keyOf(row);
              const checked = selected.has(key);
              return (
                <li key={key}>
                  <label className="ui-data-card flex cursor-pointer gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5"
                      checked={checked}
                      onChange={() => toggle(row)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="type-body-sm font-medium block">
                        {row.memberName}
                      </span>
                      <span className="type-caption mt-1 block">{row.label}</span>
                      <span className="type-title mt-2 block tabular-nums">
                        {formatPHP(row.penaltyAmount)}
                      </span>
                      <span className="type-caption mt-1 block">
                        Due{" "}
                        {new Date(row.dueDate).toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                          timeZone: "UTC",
                        })}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="ui-data-table">
          <table className="w-full text-left type-body-sm">
            <thead className="sticky top-0 bg-[var(--surface)] type-caption">
              <tr className="border-b border-[var(--border)]">
                <th className="px-2 py-3 w-12">
                  <span className="sr-only">Select</span>
                </th>
                <th className="px-2 py-3 font-medium">Member</th>
                <th className="px-2 py-3 font-medium">Obligation</th>
                <th className="px-2 py-3 font-medium">Due</th>
                <th className="px-2 py-3 font-medium">Late fee</th>
                <th className="px-2 py-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {targets.map((row) => {
                const key = keyOf(row);
                return (
                  <tr key={key} className="border-b border-[var(--border)]">
                    <td className="px-2 py-3">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={selected.has(key)}
                        onChange={() => toggle(row)}
                        aria-label={`Select ${row.memberName}`}
                      />
                    </td>
                    <td className="px-2 py-3 font-medium">{row.memberName}</td>
                    <td className="px-2 py-3">{row.label}</td>
                    <td className="px-2 py-3 type-caption">
                      {new Date(row.dueDate).toLocaleDateString("en-PH")}
                    </td>
                    <td className="px-2 py-3 tabular-nums font-semibold">
                      {formatPHP(row.penaltyAmount)}
                    </td>
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        disabled={pending}
                        className="ui-btn ui-btn-ghost"
                        onClick={() => {
                          if (!requireReason()) return;
                          run(() =>
                            waivePenaltySingle({
                              targetType: row.targetType,
                              targetId: row.targetId,
                              reason,
                            }),
                          );
                        }}
                      >
                        Pass
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {showHistory ? (
        <div className="border-t border-[var(--border)] px-[var(--page-pad-x)] py-4">
          <h2 className="type-title">Pass history</h2>
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {history.length === 0 ? (
              <li className="type-caption py-3">No passes yet.</li>
            ) : (
              history.map((h) => (
                <li key={h.id} className="py-3 type-body-sm">
                  <p className="font-medium">
                    {h.memberName} · {formatPHP(h.amountWaived)} · {h.scope}
                  </p>
                  <p className="type-caption mt-1">{h.label}</p>
                  <p className="type-caption mt-1">
                    {h.reason} · {h.issuedBy} ·{" "}
                    {new Date(h.createdAt).toLocaleString("en-PH")}
                  </p>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </OpsWorkstation>
  );
}
