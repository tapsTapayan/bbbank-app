"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Settings2, Sparkles } from "lucide-react";
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
  cycles,
  currentYear,
}: {
  initial: CycleFormValues;
  cycles: { id: string; name: string; isActive: boolean }[];
  currentYear: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof CycleFormValues>(key: K, value: CycleFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function save(activate: boolean) {
    startTransition(async () => {
      const result = await upsertFundCycle({
        id: form.id,
        name: form.name,
        contributionAmount: form.contributionAmount,
        loanInterestRate: form.loanInterestRate,
        penaltyRate: form.penaltyRate,
        gracePeriodDays: form.gracePeriodDays,
        maxLoanablePoolRatio: form.maxLoanablePoolRatio,
        loanTermMonths: form.loanTermMonths,
        startDate: form.startDate,
        endDate: form.endDate,
        activate,
      });
      if (!result.success) {
        setToast(result.error);
        return;
      }
      setToast(result.message ?? "Saved.");
      if (!form.id && result.data?.id) {
        setForm((prev) => ({ ...prev, id: result.data.id }));
      }
      router.refresh();
    });
  }

  function startYear() {
    startTransition(async () => {
      const result = await startYearCycle({ year: currentYear });
      if (!result.success) {
        setToast(result.error);
        return;
      }
      setToast(result.message ?? "Year cycle started.");
      router.refresh();
    });
  }

  return (
    <OpsWorkstation
      title="Fund cycle"
      description={`${currentYear} cycle rules`}
      bodyClassName="ui-page max-w-3xl"
      actions={
        <Settings2 className="h-5 w-5 text-[var(--brand)]" aria-hidden />
      }
    >
      {toast ? (
        <p className="ui-alert ui-alert-info mb-4" role="status">
          {toast}
        </p>
      ) : null}

      <div className="ui-desk ui-desk-col">
        <section className="ui-desk-section">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--brand)]" aria-hidden />
            <h2 className="type-title">Start {currentYear} cycle</h2>
          </div>
          <p className="type-caption">
            CPE {currentYear} · Jan–Dec · opens this month + next period.
          </p>
          <button
            type="button"
            disabled={pending}
            className="ui-btn ui-btn-primary sm:w-auto"
            onClick={startYear}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Start CPE {currentYear} & open payments
          </button>
        </section>

        {cycles.length > 0 ? (
          <section className="ui-desk-section">
            <p className="type-label">Existing cycles</p>
            <ul className="divide-y divide-[var(--border)]">
              {cycles.map((c) => (
                <li
                  key={c.id}
                  className="flex min-h-12 items-center justify-between gap-3 py-2"
                >
                  <span className="type-body-sm font-medium">
                    {c.name}
                    {c.isActive ? " · active" : ""}
                  </span>
                  {!c.isActive ? (
                    <button
                      type="button"
                      disabled={pending}
                      className="ui-btn ui-btn-ghost"
                      onClick={() =>
                        startTransition(async () => {
                          const result = await activateFundCycle(c.id);
                          setToast(
                            result.success
                              ? (result.message ?? "Activated.")
                              : result.error,
                          );
                          router.refresh();
                        })
                      }
                    >
                      Activate & open dues
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="ui-desk-section">
        <h2 className="type-title">Advanced settings</h2>
        <label className="ui-field">
          <span className="ui-field-label">Name</span>
          <input
            className="ui-input"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="ui-field">
            <span className="ui-field-label">Contribution / head / kinsena</span>
            <input
              className="ui-input tabular-nums"
              value={form.contributionAmount}
              onChange={(e) => set("contributionAmount", e.target.value)}
            />
          </label>
          <label className="ui-field">
            <span className="ui-field-label">Penalty ₱ / head / day</span>
            <input
              className="ui-input tabular-nums"
              value={form.penaltyRate}
              onChange={(e) => set("penaltyRate", e.target.value)}
            />
          </label>
          <label className="ui-field">
            <span className="ui-field-label">Grace days</span>
            <input
              type="number"
              className="ui-input"
              value={form.gracePeriodDays}
              onChange={(e) => set("gracePeriodDays", Number(e.target.value))}
            />
          </label>
          <label className="ui-field">
            <span className="ui-field-label">Loan interest (e.g. 0.10)</span>
            <input
              className="ui-input tabular-nums"
              value={form.loanInterestRate}
              onChange={(e) => set("loanInterestRate", e.target.value)}
            />
          </label>
          <label className="ui-field">
            <span className="ui-field-label">Max loanable pool ratio</span>
            <input
              className="ui-input tabular-nums"
              value={form.maxLoanablePoolRatio}
              onChange={(e) => set("maxLoanablePoolRatio", e.target.value)}
            />
          </label>
          <label className="ui-field">
            <span className="ui-field-label">Loan term (months)</span>
            <input
              type="number"
              className="ui-input"
              value={form.loanTermMonths}
              onChange={(e) => set("loanTermMonths", Number(e.target.value))}
            />
          </label>
          <label className="ui-field">
            <span className="ui-field-label">Start date</span>
            <input
              type="date"
              className="ui-input"
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
            />
          </label>
          <label className="ui-field">
            <span className="ui-field-label">End date</span>
            <input
              type="date"
              className="ui-input"
              value={form.endDate}
              onChange={(e) => set("endDate", e.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            className="ui-btn ui-btn-primary"
            onClick={() => save(false)}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </button>
          <button
            type="button"
            disabled={pending}
            className="ui-btn ui-btn-ghost"
            onClick={() => save(true)}
          >
            Save & activate
          </button>
        </div>
        </section>
      </div>
    </OpsWorkstation>
  );
}
