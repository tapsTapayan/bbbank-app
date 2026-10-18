"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  History,
  Loader2,
  ShieldCheck,
  TicketCheck,
} from "lucide-react";
import {
  waivePenaltyAll,
  waivePenaltyBulk,
  waivePenaltySingle,
} from "@/actions/penalty-waivers";
import { formatPHP } from "@/lib/finance/loan-calculator";
import { OpsWorkstation } from "@/components/ui/ops-workstation";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";

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
  batchId: string | null;
  memberName: string;
  label: string;
  amountWaived: number;
  reason: string;
  scope: string;
  issuedBy: string;
  createdAt: string;
};

function keyOf(row: PassTargetRow) {
  return `${row.targetType}:${row.targetId}`;
}

export function PassesWorkspace({
  targets,
  history,
}: {
  targets: PassTargetRow[];
  history: PassHistoryRow[];
}) {
  const router = useRouter();
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [toast, setToast] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [pending, startTransition] = useTransition();

  const selectedItems = useMemo(
    () => targets.filter((t) => selectedKeys.has(keyOf(t))),
    [targets, selectedKeys],
  );

  const totalSelectedWaived = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.penaltyAmount, 0),
    [selectedItems],
  );

  function toggleOne(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    if (selectedItems.length === targets.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(targets.map(keyOf)));
    }
  }

  function requireReason(): string | null {
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setToast({
        type: "err",
        text: "Enter a brief reason (at least 3 characters) before granting a pass.",
      });
      return null;
    }
    return trimmed;
  }

  function grantSingle(row: PassTargetRow) {
    const r = requireReason();
    if (!r) return;
    startTransition(async () => {
      const res = await waivePenaltySingle({
        targetType: row.targetType,
        targetId: row.targetId,
        reason: r,
      });
      if (!res.success) {
        setToast({ type: "err", text: res.error });
        return;
      }
      setToast({ type: "ok", text: res.message ?? "Pass granted." });
      router.refresh();
    });
  }

  function grantSelected() {
    const r = requireReason();
    if (!r || selectedItems.length === 0) return;
    startTransition(async () => {
      const res = await waivePenaltyBulk({
        targets: selectedItems.map((i) => ({
          targetType: i.targetType,
          targetId: i.targetId,
        })),
        reason: r,
      });
      if (!res.success) {
        setToast({ type: "err", text: res.error });
        return;
      }
      setToast({ type: "ok", text: res.message ?? "Bulk pass granted." });
      setSelectedKeys(new Set());
      router.refresh();
    });
  }

  function grantAll() {
    const r = requireReason();
    if (!r) return;
    startTransition(async () => {
      const res = await waivePenaltyAll({
        reason: r,
        includeContributions: true,
        includeLoans: true,
      });
      if (!res.success) {
        setToast({ type: "err", text: res.error });
        return;
      }
      setToast({ type: "ok", text: res.message ?? "All late fees waived." });
      setSelectedKeys(new Set());
      router.refresh();
    });
  }

  return (
    <OpsWorkstation
      title="Penalty Passes & Waivers"
      description="Grant authorized CPE Rule #3 late-fee waivers and freeze accrual"
      actions={
        <>
          <span className="rl-pill rl-pill-pending">
            {targets.length} open late fees
          </span>
          {history.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowHistory((s) => !s)}
              className="rl-btn rl-btn-secondary rl-btn-sm"
            >
              <History className="h-3.5 w-3.5" aria-hidden />
              {showHistory ? "Hide" : "Pass History"} ({history.length})
            </button>
          ) : null}
        </>
      }
    >
      <div className="rl-stack">
        {/* Action Bar: Reason Input + Bulk Waiver Action */}
        <section className="rl-desk rl-desk-section">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <label className="rl-field">
              <span className="rl-field-label">
                Waiver Reason (Recorded on Pass Audit Log)
              </span>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Approved payroll delay / medical excuse"
                className="rl-input"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {targets.length > 0 ? (
                <button
                  type="button"
                  onClick={toggleAll}
                  className="rl-btn rl-btn-secondary"
                >
                  {selectedItems.length === targets.length
                    ? "Clear Selection"
                    : `Select All (${targets.length})`}
                </button>
              ) : null}
              <button
                type="button"
                disabled={pending || selectedItems.length === 0}
                onClick={grantSelected}
                className="rl-btn rl-btn-primary"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <TicketCheck className="h-4 w-4" />
                )}
                Grant Selected ({selectedItems.length} ·{" "}
                {formatPHP(totalSelectedWaived)})
              </button>
              {targets.length > 0 ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={grantAll}
                  className="rl-btn rl-btn-secondary"
                >
                  Waive All Open
                </button>
              ) : null}
            </div>
          </div>

          {toast ? (
            <p
              className={`rl-alert ${
                toast.type === "ok" ? "rl-alert-ok" : "rl-alert-error"
              }`}
              role="status"
            >
              {toast.text}
            </p>
          ) : null}
        </section>

        {targets.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
            title="Zero Late Penalties"
            description="No unpaid obligations currently have accrued late penalties."
          />
        ) : (
          <>
            {/* Mobile Card List */}
            <div className="space-y-2.5 md:hidden">
              {targets.map((row) => {
                const k = keyOf(row);
                const checked = selectedKeys.has(k);
                return (
                  <div key={k} className="rl-card rl-card-pad">
                    <div className="flex items-start justify-between gap-2">
                      <label className="flex min-w-0 items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(k)}
                          className="mt-1 h-4 w-4 rounded border-[var(--border)] accent-[var(--brand)]"
                        />
                        <div className="min-w-0">
                          <p className="type-body-sm truncate font-semibold">
                            {row.memberName}
                          </p>
                          <p className="type-caption truncate">{row.label}</p>
                        </div>
                      </label>
                      <span className="rl-pill rl-pill-rejected font-mono">
                        +{formatPHP(row.penaltyAmount)}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
                      <span className="type-caption font-mono">
                        Due{" "}
                        {new Date(row.dueDate).toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          timeZone: "UTC",
                        })}
                      </span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => grantSingle(row)}
                        className="rl-btn rl-btn-secondary rl-btn-sm"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Grant Pass
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Data Table */}
            <div className="hidden overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-elevated)] shadow-[var(--shadow-card)] md:block">
              <table className="rl-table">
                <thead>
                  <tr>
                    <th className="w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all open late penalties"
                        checked={
                          targets.length > 0 &&
                          selectedItems.length === targets.length
                        }
                        onChange={toggleAll}
                        className="h-4 w-4 rounded border-[var(--border)] accent-[var(--brand)]"
                      />
                    </th>
                    <th>Member</th>
                    <th>Obligation</th>
                    <th>Due Date</th>
                    <th className="text-right">Late Penalty</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {targets.map((row) => {
                    const k = keyOf(row);
                    const checked = selectedKeys.has(k);
                    return (
                      <tr key={k}>
                        <td>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOne(k)}
                            aria-label={`Select ${row.memberName} ${row.label}`}
                            className="h-4 w-4 rounded border-[var(--border)] accent-[var(--brand)]"
                          />
                        </td>
                        <td className="font-semibold text-[var(--ink)]">
                          {row.memberName}
                        </td>
                        <td className="font-medium text-[var(--ink)]">
                          {row.label}
                        </td>
                        <td className="font-mono text-xs text-[var(--ink-secondary)]">
                          {new Date(row.dueDate).toLocaleDateString("en-PH", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            timeZone: "UTC",
                          })}
                        </td>
                        <td className="text-right">
                          <Money
                            amount={row.penaltyAmount}
                            className="font-bold text-[var(--danger)]"
                          />
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => grantSingle(row)}
                            className="rl-btn rl-btn-secondary rl-btn-sm"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Pass
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {showHistory && history.length > 0 ? (
          <section className="rl-desk rl-desk-section">
            <h2 className="type-label">Recent Penalty Passes</h2>
            <ul className="divide-y divide-[var(--border-subtle)]">
              {history.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs"
                >
                  <div>
                    <span className="font-semibold text-[var(--ink)]">
                      {p.memberName}
                    </span>
                    <span className="text-[var(--ink-muted)]">
                      {" "}
                      · {p.label}
                    </span>
                    <p className="type-caption">
                      “{p.reason}” — by {p.issuedBy}
                    </p>
                  </div>
                  <div className="text-right font-mono">
                    <span className="font-bold text-[var(--success)]">
                      −{formatPHP(p.amountWaived)}
                    </span>
                    <p className="type-caption">
                      {new Date(p.createdAt).toLocaleDateString("en-PH", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </OpsWorkstation>
  );
}
