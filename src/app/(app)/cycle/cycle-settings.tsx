"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Save, Zap } from "lucide-react";
import {
  activateFundCycle,
  startYearCycle,
  upsertFundCycle,
} from "@/actions/fund-cycle";
import { OpsWorkstation } from "@/components/ui/ops-workstation";

export type CycleFormValues = {
  id?: string;
  name: string;
  contributionAmount: string;
  loanInterestRate: string;
  penaltyRate: string;
  gracePeriodDays: number;
  maxLoanablePoolRatio: string;
  loanTermMonths: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

export function CycleSettings({
  initial,
  currentYear,
  cycles,
}: {
  initial: CycleFormValues;
  currentYear: number;
  cycles: Array<{ id: string; name: string; isActive: boolean }>;
}) {
  const router = useRouter();
  const [form, setForm] = useState<CycleFormValues>(initial);
  const [activate, setActivate] = useState(initial.isActive);
  const [toast, setToast] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function quickStartYear(year: number) {
    startTransition(async () => {
      const result = await startYearCycle({ year });
      if (!result.success) {
        setToast({ type: "err", text: result.error });
        return;
      }
      setToast({
        type: "ok",
        text: result.message ?? `Activated ${year} cycle.`,
      });
      router.refresh();
    });
  }

  function makeActive(cycleId: string) {
    startTransition(async () => {
      const result = await activateFundCycle(cycleId);
      if (!result.success) {
        setToast({ type: "err", text: result.error });
        return;
      }
      setToast({
        type: "ok",
        text: result.message ?? "Cycle activated.",
      });
      router.refresh();
    });
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await upsertFundCycle({
        id: form.id,
        name: form.name,
        contributionAmount: form.contributionAmount,
        loanInterestRate: form.loanInterestRate,
        penaltyRate: form.penaltyRate,
        gracePeriodDays: Number(form.gracePeriodDays),
        maxLoanablePoolRatio: form.maxLoanablePoolRatio,
        loanTermMonths: Number(form.loanTermMonths),
        startDate: form.startDate,
        endDate: form.endDate,
        activate,
      });
      if (!result.success) {
        setToast({ type: "err", text: result.error });
        return;
      }
      setToast({
        type: "ok",
        text: result.message ?? "Fund cycle saved.",
      });
      router.refresh();
    });
  }

  const activeCycle = cycles.find((c) => c.isActive);

  return (
    <OpsWorkstation
      title="Cycle settings"
      actions={
        <>
          <span
            className={
              activeCycle
                ? "rl-pill rl-pill-verified"
                : "rl-pill rl-pill-pending"
            }
          >
            {activeCycle ? `Active: ${activeCycle.name}` : "No Active Cycle"}
          </span>
          {toast ? (
            <p
              className={`rl-alert !py-1.5 !px-3 type-caption ${
                toast.type === "ok" ? "rl-alert-ok" : "rl-alert-error"
              }`}
              role="status"
            >
              {toast.text}
            </p>
          ) : null}
        </>
      }
    >
      <div className="rl-dash-grid">
        {/* Left Column: Quick Start + Existing Cycles */}
        <div className="rl-fund-stack">
          <section className="rl-vault-card">
            <div className="rl-vault-body">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Quick start {currentYear}
                  </h2>
                  <p className="mt-1 text-xs text-white/80">
                    ₱250/head · 2-day grace · ₱10/head/day late · 10% 2-mo loan
                  </p>
                </div>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => quickStartYear(currentYear)}
                  className="rl-btn rl-btn-vault"
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  Activate {currentYear}
                </button>
              </div>
            </div>
          </section>

          {cycles.length > 0 ? (
            <section className="rl-desk rl-desk-section">
              <h2 className="type-title">Configured Cycles</h2>
              <ul className="space-y-2">
                {cycles.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3.5 py-2.5"
                  >
                    <span className="font-semibold text-[var(--ink)]">
                      {c.name}
                    </span>
                    {c.isActive ? (
                      <span className="rl-pill rl-pill-verified">
                        <CheckCircle2 className="h-3 w-3" />
                        Active
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => makeActive(c.id)}
                        className="rl-btn rl-btn-secondary rl-btn-sm"
                      >
                        Activate
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {/* Right Column: Fine-Grained Policy Rules Form */}
        <form onSubmit={save} className="rl-desk rl-desk-section">
          <h2 className="type-title">
            {form.id ? "Edit cycle" : "New cycle"}
          </h2>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <label className="rl-field sm:col-span-2">
              <span className="rl-field-label">Cycle Name</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="rl-input"
              />
            </label>
            <label className="rl-field">
              <span className="rl-field-label">Start Date</span>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) =>
                  setForm({ ...form, startDate: e.target.value })
                }
                className="rl-input font-mono"
              />
            </label>
            <label className="rl-field">
              <span className="rl-field-label">End Date</span>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="rl-input font-mono"
              />
            </label>
            <label className="rl-field">
              <span className="rl-field-label">
                Contribution / Head / Kinsenas (₱)
              </span>
              <input
                type="text"
                value={form.contributionAmount}
                onChange={(e) =>
                  setForm({ ...form, contributionAmount: e.target.value })
                }
                className="rl-input font-mono"
              />
            </label>
            <label className="rl-field">
              <span className="rl-field-label">
                Penalty / Head / Day After Grace (₱)
              </span>
              <input
                type="text"
                value={form.penaltyRate}
                onChange={(e) =>
                  setForm({ ...form, penaltyRate: e.target.value })
                }
                className="rl-input font-mono"
              />
            </label>
            <label className="rl-field">
              <span className="rl-field-label">Grace Period (Days)</span>
              <input
                type="number"
                value={form.gracePeriodDays}
                onChange={(e) =>
                  setForm({
                    ...form,
                    gracePeriodDays: Number(e.target.value) || 0,
                  })
                }
                className="rl-input font-mono"
              />
            </label>
            <label className="rl-field">
              <span className="rl-field-label">
                Flat Loan Interest Rate (0.10 = 10%)
              </span>
              <input
                type="text"
                value={form.loanInterestRate}
                onChange={(e) =>
                  setForm({ ...form, loanInterestRate: e.target.value })
                }
                className="rl-input font-mono"
              />
            </label>
            <label className="rl-field">
              <span className="rl-field-label">
                Loanable Pool Ratio / Head (0.50 = 50%)
              </span>
              <input
                type="text"
                value={form.maxLoanablePoolRatio}
                onChange={(e) =>
                  setForm({ ...form, maxLoanablePoolRatio: e.target.value })
                }
                className="rl-input font-mono"
              />
            </label>
            <label className="rl-field">
              <span className="rl-field-label">Loan Term (Months)</span>
              <input
                type="number"
                value={form.loanTermMonths}
                onChange={(e) =>
                  setForm({
                    ...form,
                    loanTermMonths: Number(e.target.value) || 1,
                  })
                }
                className="rl-input font-mono"
              />
            </label>
          </div>

          <label className="flex items-center gap-2.5 rounded-[var(--radius-md)] bg-[var(--surface-subtle)] px-3.5 py-2.5 text-sm font-medium text-[var(--ink)]">
            <input
              type="checkbox"
              checked={activate}
              onChange={(e) => setActivate(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--border)] accent-[var(--brand)]"
            />
            Activate and open kinsenas
          </label>

          <button
            type="submit"
            disabled={pending}
            className="rl-btn rl-btn-primary rl-btn-block"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </button>
        </form>
      </div>
    </OpsWorkstation>
  );
}
