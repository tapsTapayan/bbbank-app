"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  CheckCircle2,
  History,
  Loader2,
  ShieldCheck,
  TicketCheck,
  Users,
} from "lucide-react";
import {
  extendGraceForPeriod,
  waivePenaltyAll,
  waivePenaltyBulk,
  waivePenaltyForPeriod,
  waivePenaltySingle,
} from "@/actions/penalty-waivers";
import { formatPHP } from "@/lib/finance/loan-calculator";
import { OpsWorkstation } from "@/components/ui/ops-workstation";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";

export type PassTargetRow = {
  targetType: "CONTRIBUTION" | "LOAN_AMORTIZATION";
  targetId: string;
  memberId: string;
  memberName: string;
  label: string;
  penaltyAmount: number;
  dueDate: string;
  graceDeadline: string;
  periodKey: string | null;
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

export type PassPeriodOption = {
  key: string;
  periodMonth: string;
  kinsenaIndex: 1 | 2;
  label: string;
  dueDate: string;
  openCount: number;
  lateFeeCount: number;
};

export type PassMemberOption = {
  id: string;
  name: string;
};

type PassMode = "obligations" | "period" | "history";

function keyOf(row: PassTargetRow) {
  return `${row.targetType}:${row.targetId}`;
}

function modeDescription(mode: PassMode) {
  switch (mode) {
    case "obligations":
      return "Grant passes on specific late-fee obligations";
    case "period":
      return "Waive or extend grace for a kinsenas cohort";
    case "history":
      return "Review recently issued penalty passes";
  }
}

function formatWaiverScope(scope: string) {
  switch (scope) {
    case "SINGLE":
      return "Single";
    case "BULK":
      return "Bulk";
    case "ALL":
      return "All open";
    default:
      return scope;
  }
}

export function PassesWorkspace({
  targets,
  history,
  periods,
  members,
}: {
  targets: PassTargetRow[];
  history: PassHistoryRow[];
  periods: PassPeriodOption[];
  members: PassMemberOption[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<PassMode>("obligations");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [obligationReason, setObligationReason] = useState("");
  const [periodReason, setPeriodReason] = useState("");
  const [toast, setToast] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const [periodScope, setPeriodScope] = useState<"all" | "selected">("all");
  const [selectedPeriodKeys, setSelectedPeriodKeys] = useState<Set<string>>(
    new Set(),
  );
  const [memberScope, setMemberScope] = useState<"all" | "selected">("all");
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(
    new Set(),
  );
  const [extraDays, setExtraDays] = useState(2);
  const [includeLoans, setIncludeLoans] = useState(true);

  const selectedPeriods = useMemo(
    () => periods.filter((p) => selectedPeriodKeys.has(p.key)),
    [periods, selectedPeriodKeys],
  );

  const periodActionReady =
    periodScope === "all"
      ? periods.length > 0
      : selectedPeriods.length > 0;

  const selectedItems = useMemo(
    () => targets.filter((t) => selectedKeys.has(keyOf(t))),
    [targets, selectedKeys],
  );

  const totalSelectedWaived = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.penaltyAmount, 0),
    [selectedItems],
  );

  function switchMode(next: PassMode) {
    setMode(next);
    setToast(null);
  }

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

  function toggleMember(id: string) {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePeriod(key: string) {
    setSelectedPeriodKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAllPeriods() {
    if (selectedPeriodKeys.size === periods.length) {
      setSelectedPeriodKeys(new Set());
    } else {
      setSelectedPeriodKeys(new Set(periods.map((p) => p.key)));
    }
  }

  function periodPayload(): {
    allPeriods: boolean;
    periods: Array<{ periodMonth: string; kinsenaIndex: 1 | 2 }>;
  } {
    if (periodScope === "all") {
      return { allPeriods: true, periods: [] };
    }
    return {
      allPeriods: false,
      periods: selectedPeriods.map((p) => ({
        periodMonth: p.periodMonth,
        kinsenaIndex: p.kinsenaIndex,
      })),
    };
  }

  function requireReason(value: string): string | null {
    const trimmed = value.trim();
    if (trimmed.length < 3) {
      setToast({
        type: "err",
        text: "Enter a brief reason (at least 3 characters).",
      });
      return null;
    }
    return trimmed;
  }

  function afterSuccess(message: string) {
    setToast({ type: "ok", text: message });
    setSelectedKeys(new Set());
    router.refresh();
  }

  function grantSingle(row: PassTargetRow) {
    const r = requireReason(obligationReason);
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
      if (!res.data.waived) {
        setToast({
          type: "err",
          text: res.message ?? "Nothing to waive.",
        });
        router.refresh();
        return;
      }
      afterSuccess(res.message ?? "Pass granted.");
    });
  }

  function grantSelected() {
    const r = requireReason(obligationReason);
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
      if (!res.data.waived) {
        setToast({
          type: "err",
          text: res.message ?? "Nothing to waive.",
        });
        router.refresh();
        return;
      }
      afterSuccess(res.message ?? "Bulk pass granted.");
    });
  }

  function grantAll() {
    const r = requireReason(obligationReason);
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
      if (!res.data.waived) {
        setToast({
          type: "err",
          text: res.message ?? "No open late fees to waive.",
        });
        router.refresh();
        return;
      }
      afterSuccess(res.message ?? "All late fees waived.");
    });
  }

  function periodMemberIds(): string[] | undefined {
    if (memberScope !== "selected") return undefined;
    return Array.from(selectedMemberIds);
  }

  function waivePeriod() {
    const r = requireReason(periodReason);
    if (!r || !periodActionReady) {
      if (!periodActionReady) {
        setToast({
          type: "err",
          text: "Select at least one kinsenas period, or choose All periods.",
        });
      }
      return;
    }
    if (memberScope === "selected" && selectedMemberIds.size === 0) {
      setToast({
        type: "err",
        text: "Select at least one member, or switch to All members.",
      });
      return;
    }
    startTransition(async () => {
      const res = await waivePenaltyForPeriod({
        ...periodPayload(),
        memberIds: periodMemberIds(),
        reason: r,
        includeLoans,
      });
      if (!res.success) {
        setToast({ type: "err", text: res.error });
        return;
      }
      if (!res.data.waived) {
        setToast({
          type: "err",
          text: res.message ?? "Nothing to waive in the selected period(s).",
        });
        router.refresh();
        return;
      }
      afterSuccess(res.message ?? "Period pass granted.");
    });
  }

  function extendGrace() {
    const r = requireReason(periodReason);
    if (!r || !periodActionReady) {
      if (!periodActionReady) {
        setToast({
          type: "err",
          text: "Select at least one kinsenas period, or choose All periods.",
        });
      }
      return;
    }
    if (memberScope === "selected" && selectedMemberIds.size === 0) {
      setToast({
        type: "err",
        text: "Select at least one member, or switch to All members.",
      });
      return;
    }
    startTransition(async () => {
      const res = await extendGraceForPeriod({
        ...periodPayload(),
        memberIds: periodMemberIds(),
        extraDays,
        reason: r,
        includeLoans,
      });
      if (!res.success) {
        setToast({ type: "err", text: res.error });
        return;
      }
      if (!res.data.updated) {
        setToast({
          type: "err",
          text: res.message ?? "No obligations updated.",
        });
        router.refresh();
        return;
      }
      afterSuccess(res.message ?? "Grace extended.");
    });
  }

  return (
    <OpsWorkstation
      title="Penalty passes"
      description={modeDescription(mode)}
      actions={
        <span className="rl-pill rl-pill-pending">
          {targets.length} open late fees
        </span>
      }
    >
      <div className="rl-stack">
        <div
          className="flex flex-wrap gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-1"
          role="tablist"
          aria-label="Penalty pass mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "obligations"}
            onClick={() => switchMode("obligations")}
            className={`rl-btn rl-btn-sm flex-1 sm:flex-none ${
              mode === "obligations"
                ? "rl-btn-primary"
                : "rl-btn-secondary border-transparent bg-transparent shadow-none"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            By obligation
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "period"}
            onClick={() => switchMode("period")}
            className={`rl-btn rl-btn-sm flex-1 sm:flex-none ${
              mode === "period"
                ? "rl-btn-primary"
                : "rl-btn-secondary border-transparent bg-transparent shadow-none"
            }`}
          >
            <Users className="h-3.5 w-3.5" aria-hidden />
            By period / members
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "history"}
            onClick={() => switchMode("history")}
            className={`rl-btn rl-btn-sm flex-1 sm:flex-none ${
              mode === "history"
                ? "rl-btn-primary"
                : "rl-btn-secondary border-transparent bg-transparent shadow-none"
            }`}
          >
            <History className="h-3.5 w-3.5" aria-hidden />
            Pass history
            {history.length > 0 ? (
              <span className="tabular-nums">({history.length})</span>
            ) : null}
          </button>
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

        {mode === "obligations" ? (
          <section
            className="rl-desk rl-desk-section rl-stack"
            aria-label="Obligation passes"
            role="tabpanel"
          >
            <div>
              <h2 className="type-label">Obligation passes</h2>
              <p className="type-caption mt-1 text-[var(--ink-muted)]">
                Select rows below, or pass one obligation at a time. Does not
                change grace deadlines.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <label className="rl-field">
                <span className="rl-field-label">Reason for this pass</span>
                <input
                  type="text"
                  value={obligationReason}
                  onChange={(e) => setObligationReason(e.target.value)}
                  placeholder="e.g. Receipt verified · medical excuse"
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
                      ? "Clear selection"
                      : `Select all (${targets.length})`}
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
                  Grant selected ({selectedItems.length} ·{" "}
                  {formatPHP(totalSelectedWaived)})
                </button>
                {targets.length > 0 ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={grantAll}
                    className="rl-btn rl-btn-secondary"
                  >
                    Waive all open
                  </button>
                ) : null}
              </div>
            </div>

            {targets.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
                title="No late fees"
                description="No accrued penalties on open obligations."
              />
            ) : (
              <>
                <div className="max-h-[min(28rem,55vh)] space-y-2.5 overflow-y-auto overscroll-contain md:hidden">
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
                              <p className="type-caption truncate">
                                {row.label}
                              </p>
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
                            Grant pass
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="rl-table-wrap hidden max-h-[min(28rem,55vh)] shadow-[var(--shadow-card)] md:block">
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
                              {new Date(row.dueDate).toLocaleDateString(
                                "en-PH",
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  timeZone: "UTC",
                                },
                              )}
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
          </section>
        ) : null}

        {mode === "period" ? (
          <section
            className="rl-desk rl-desk-section rl-stack"
            aria-label="Period and member tools"
            role="tabpanel"
          >
            <div>
              <h2 className="type-label">Period & member tools</h2>
              <p className="type-caption mt-1 text-[var(--ink-muted)]">
                Apply a cohort action across one or more kinsenas periods —
                waive late fees or push grace forward.
              </p>
            </div>

            {periods.length === 0 ? (
              <EmptyState
                icon={<Users className="h-5 w-5" aria-hidden />}
                title="No open periods"
                description="Open a kinsenas period before using cohort tools."
              />
            ) : (
              <>
                <label className="rl-field">
                  <span className="rl-field-label">Reason for this action</span>
                  <input
                    type="text"
                    value={periodReason}
                    onChange={(e) => setPeriodReason(e.target.value)}
                    placeholder="e.g. Payroll delay · typhoon relief"
                    className="rl-input"
                  />
                </label>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="rl-field">
                    <span className="rl-field-label">Period scope</span>
                    <select
                      value={periodScope}
                      onChange={(e) =>
                        setPeriodScope(e.target.value as "all" | "selected")
                      }
                      className="rl-input"
                    >
                      <option value="all">
                        All open periods ({periods.length})
                      </option>
                      <option value="selected">Selected periods only</option>
                    </select>
                  </label>

                  <label className="rl-field">
                    <span className="rl-field-label">Member scope</span>
                    <select
                      value={memberScope}
                      onChange={(e) =>
                        setMemberScope(e.target.value as "all" | "selected")
                      }
                      className="rl-input"
                    >
                      <option value="all">All members in period(s)</option>
                      <option value="selected">Selected members only</option>
                    </select>
                  </label>
                </div>

                {periodScope === "selected" ? (
                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="rl-field-label mb-0">
                        Periods ({selectedPeriodKeys.size} selected)
                      </p>
                      <button
                        type="button"
                        onClick={toggleAllPeriods}
                        className="rl-btn rl-btn-secondary rl-btn-sm"
                      >
                        {selectedPeriodKeys.size === periods.length
                          ? "Clear periods"
                          : "Select all periods"}
                      </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-elevated)] p-2">
                      <div className="grid gap-1 sm:grid-cols-2">
                        {periods.map((p) => (
                          <label
                            key={p.key}
                            className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-[var(--surface-muted)]"
                          >
                            <input
                              type="checkbox"
                              checked={selectedPeriodKeys.has(p.key)}
                              onChange={() => togglePeriod(p.key)}
                              className="h-4 w-4 rounded border-[var(--border)] accent-[var(--brand)]"
                            />
                            <span className="type-body-sm min-w-0 truncate">
                              {p.label}
                              <span className="text-[var(--ink-muted)]">
                                {" "}
                                · {p.lateFeeCount} late / {p.openCount} open
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {memberScope === "selected" ? (
                  <div>
                    <p className="rl-field-label mb-2">
                      Members ({selectedMemberIds.size} selected)
                    </p>
                    <div className="max-h-48 overflow-y-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-elevated)] p-2">
                      <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                        {members.map((m) => (
                          <label
                            key={m.id}
                            className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-[var(--surface-muted)]"
                          >
                            <input
                              type="checkbox"
                              checked={selectedMemberIds.has(m.id)}
                              onChange={() => toggleMember(m.id)}
                              className="h-4 w-4 rounded border-[var(--border)] accent-[var(--brand)]"
                            />
                            <span className="type-body-sm truncate">
                              {m.name}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={includeLoans}
                    onChange={(e) => setIncludeLoans(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--border)] accent-[var(--brand)]"
                  />
                  <span className="type-caption text-[var(--ink-secondary)]">
                    Also include loan installments due on the same calendar
                    day(s) as the selected kinsenas
                  </span>
                </label>

                <div className="grid gap-4 border-t border-[var(--border-subtle)] pt-4 md:grid-cols-2">
                  <div className="rl-stack rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3">
                    <div>
                      <p className="type-label">Waive late fees</p>
                      <p className="type-caption mt-1 text-[var(--ink-muted)]">
                        Zero and freeze accrued penalties for the cohort. Grace
                        dates stay as-is.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={pending || !periodActionReady}
                      onClick={waivePeriod}
                      className="rl-btn rl-btn-primary"
                    >
                      {pending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <TicketCheck className="h-4 w-4" />
                      )}
                      Waive period late fees
                    </button>
                  </div>

                  <div className="rl-stack rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3">
                    <div>
                      <p className="type-label">Extend grace</p>
                      <p className="type-caption mt-1 text-[var(--ink-muted)]">
                        Push grace deadlines forward. Fees recalculate; accrual
                        can resume after the new grace ends.
                      </p>
                    </div>
                    <label className="rl-field">
                      <span className="rl-field-label">Extra days</span>
                      <select
                        value={extraDays}
                        onChange={(e) => setExtraDays(Number(e.target.value))}
                        className="rl-input"
                      >
                        {[1, 2, 3, 5, 7, 14].map((d) => (
                          <option key={d} value={d}>
                            +{d} day{d === 1 ? "" : "s"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={pending || !periodActionReady}
                      onClick={extendGrace}
                      className="rl-btn rl-btn-secondary"
                    >
                      {pending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CalendarPlus className="h-4 w-4" />
                      )}
                      Extend grace +{extraDays}d
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        ) : null}

        {mode === "history" ? (
          <section
            className="rl-desk rl-desk-section rl-stack"
            aria-label="Pass history"
            role="tabpanel"
          >
            <div>
              <h2 className="type-label">Pass history</h2>
              <p className="type-caption mt-1 text-[var(--ink-muted)]">
                Recently issued penalty passes and who granted them.
              </p>
            </div>

            {history.length === 0 ? (
              <EmptyState
                icon={<History className="h-5 w-5" aria-hidden />}
                title="No passes yet"
                description="Granted passes will show up here with reason and issuer."
              />
            ) : (
              <>
                <div className="max-h-[min(28rem,55vh)] space-y-2.5 overflow-y-auto overscroll-contain md:hidden">
                  {history.map((p) => (
                    <div key={p.id} className="rl-card rl-card-pad">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="type-body-sm truncate font-semibold">
                            {p.memberName}
                          </p>
                          <p className="type-caption truncate">{p.label}</p>
                        </div>
                        <span className="font-mono text-sm font-bold text-[var(--success)]">
                          −{formatPHP(p.amountWaived)}
                        </span>
                      </div>
                      <p className="type-caption mt-2">
                        “{p.reason}” — by {p.issuedBy}
                      </p>
                      <p className="type-caption mt-1 font-mono text-[var(--ink-muted)]">
                        {new Date(p.createdAt).toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                        {p.scope ? ` · ${formatWaiverScope(p.scope)}` : ""}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="rl-table-wrap hidden max-h-[min(28rem,55vh)] shadow-[var(--shadow-card)] md:block">
                  <table className="rl-table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Member</th>
                        <th>Obligation</th>
                        <th>Scope</th>
                        <th>Reason</th>
                        <th>Issued by</th>
                        <th className="text-right">Waived</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((p) => (
                        <tr key={p.id}>
                          <td className="font-mono text-xs text-[var(--ink-secondary)]">
                            {new Date(p.createdAt).toLocaleDateString("en-PH", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </td>
                          <td className="font-semibold text-[var(--ink)]">
                            {p.memberName}
                          </td>
                          <td className="font-medium text-[var(--ink)]">
                            {p.label}
                          </td>
                          <td className="text-[var(--ink-secondary)]">
                            {formatWaiverScope(p.scope)}
                          </td>
                          <td className="text-[var(--ink-secondary)]">
                            {p.reason}
                          </td>
                          <td className="text-[var(--ink-secondary)]">
                            {p.issuedBy}
                          </td>
                          <td className="text-right font-mono font-bold text-[var(--success)]">
                            −{formatPHP(p.amountWaived)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        ) : null}
      </div>
    </OpsWorkstation>
  );
}
