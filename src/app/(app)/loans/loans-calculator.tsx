"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, XCircle, HandCoins } from "lucide-react";
import { formatPHP } from "@/lib/finance/loan-calculator";
import {
  generate2MonthLoanSchedule,
  type RepaymentFrequency,
} from "@/lib/finance/cpe-policy";
import { requestLoan } from "@/actions/loans";
import { PageHeader } from "@/components/ui/page-header";
import { Money } from "@/components/ui/money";
import { FundCanvas } from "@/components/system/frames/fund-canvas";

type Eligibility = {
  eligible: boolean;
  reasons: string[];
  statusOk: boolean;
  noOverdueContributions: boolean;
  noBlockingLoans: boolean;
};

type LoansCalculatorProps = {
  headsCount: number;
  memberStatus: string;
  cycleName: string | null;
  interestRate: number;
  termMonths: number;
  totalMonthlyCollectibles: number;
  availableCashPool: number;
  policyCap: number;
  maxLoanable: number;
  limitedBy: "POLICY" | "CASH" | "BOTH";
  eligibility: Eligibility;
};

export function LoansCalculator({
  headsCount,
  memberStatus: _memberStatus,
  cycleName,
  interestRate,
  termMonths,
  totalMonthlyCollectibles,
  availableCashPool,
  policyCap,
  maxLoanable,
  limitedBy: _limitedBy,
  eligibility,
}: LoansCalculatorProps) {
  const router = useRouter();
  const [principalInput, setPrincipalInput] = useState(
    maxLoanable > 0 ? String(Math.min(maxLoanable, 20000)) : "0",
  );
  const [frequency, setFrequency] = useState<RepaymentFrequency>("KINSENAS");
  const [toast, setToast] = useState<{
    type: "ok" | "err";
    message: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const principal = Number(principalInput) || 0;
  const overCap = principal > maxLoanable + 0.001;
  const canRequest =
    eligibility.eligible && !overCap && principal > 0 && !pending;

  function submitRequest() {
    if (!canRequest) return;
    startTransition(async () => {
      const result = await requestLoan({
        principalAmount: principal.toFixed(2),
        repaymentFrequency: frequency,
      });
      if (!result.success) {
        setToast({ type: "err", message: result.error });
        return;
      }
      setToast({
        type: "ok",
        message: result.message ?? "Loan request submitted for Treasurer approval.",
      });
      router.refresh();
    });
  }

  const schedule = useMemo(() => {
    if (principal <= 0) return null;
    try {
      return generate2MonthLoanSchedule(principal, new Date(), frequency, {
        interestRate,
        termMonths,
      });
    } catch {
      return null;
    }
  }, [principal, frequency, interestRate, termMonths]);

  const presets = useMemo(() => {
    if (maxLoanable <= 0) return [];
    const ratios = [0.25, 0.5, 0.75, 1];
    return ratios.map((r) => ({
      label: r === 1 ? "Max Cap" : `${Math.round(r * 100)}%`,
      amount: Math.floor((maxLoanable * r) / 100) * 100 || maxLoanable,
    }));
  }, [maxLoanable]);

  return (
    <FundCanvas>
      <PageHeader
        title="Loans"
        description={`${(interestRate * 100).toFixed(0)}% flat · ${termMonths} months · 4 kinsenas or 2 monthly${cycleName ? ` · ${cycleName}` : ""}`}
      />

      <div className="rl-dash-grid">
        {/* Left Column: Eligibility (Rule #5) + Loan Configurator + Pool Telemetry (Rule #1) */}
        <div className="rl-fund-stack">
          {/* Rule #5 Eligibility Checklist */}
          <section
            className="rl-panel rl-stack-sm"
            aria-labelledby="eligibility-heading"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="type-title" id="eligibility-heading">
                Eligibility
              </h2>
              <span
                className={`rl-pill ${
                  eligibility.eligible ? "rl-pill-verified" : "rl-pill-rejected"
                }`}
              >
                {eligibility.eligible ? "Eligible" : "Ineligible"}
              </span>
            </div>

            {!eligibility.eligible && eligibility.reasons.length > 0 ? (
              <div className="rl-alert rl-alert-error">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <ul className="list-inside list-disc text-xs">
                  {eligibility.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {/* Interactive Loan Configurator */}
          <section
            className="rl-panel rl-stack"
            aria-labelledby="estimate-heading"
          >
            <div className="border-b border-[var(--border-subtle)] pb-3">
              <h2 className="type-title" id="estimate-heading">
                Amount & schedule
              </h2>
            </div>

            <div className="rl-stack-sm">
              <label className="rl-field">
                <span className="rl-field-label">Principal (₱)</span>
                <div className="relative">
                  <span
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-base font-bold text-[var(--ink-muted)]"
                    aria-hidden
                  >
                    ₱
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={principalInput}
                    onChange={(e) => setPrincipalInput(e.target.value)}
                    className="rl-input pl-8 font-mono text-lg font-bold tabular-nums"
                  />
                </div>
              </label>

              {maxLoanable > 0 ? (
                <div className="space-y-2 pt-1">
                  <input
                    type="range"
                    min={0}
                    max={maxLoanable}
                    step={500}
                    value={Math.min(principal, maxLoanable)}
                    onChange={(e) => setPrincipalInput(e.target.value)}
                    aria-label="Principal amount slider"
                    className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-[var(--border)] accent-[var(--brand)]"
                  />
                  <div className="flex flex-wrap gap-2">
                    {presets.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => setPrincipalInput(String(p.amount))}
                        className={`rl-chip flex-1 ${
                          Math.abs(principal - p.amount) < 1
                            ? "rl-chip-selected"
                            : ""
                        }`}
                      >
                        {p.label} ({formatPHP(p.amount)})
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {overCap ? (
                <p
                  className="rl-alert rl-alert-error text-xs font-medium"
                  role="alert"
                >
                  Principal exceeds your maximum loanable limit of{" "}
                  {formatPHP(maxLoanable)}.
                </p>
              ) : null}
            </div>

            <fieldset className="rl-field">
              <legend className="rl-field-label mb-1.5">
                Repayment
              </legend>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { value: "KINSENAS", title: "4 Kinsenas" },
                    { value: "MONTHLY", title: "2 Monthly" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFrequency(opt.value)}
                    aria-pressed={frequency === opt.value}
                    className={`rl-chip ${
                      frequency === opt.value ? "rl-chip-selected" : ""
                    }`}
                  >
                    {opt.title}
                  </button>
                ))}
              </div>
            </fieldset>
          </section>

          {/* Rule #1 Loanable Cap Telemetry */}
          <section
            className="rl-panel rl-stack-sm"
            aria-labelledby="max-loanable-heading"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="type-title" id="max-loanable-heading">
                Loan cap
              </h2>
              <span className="type-caption font-mono">
                {headsCount} head{headsCount === 1 ? "" : "s"}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-3">
              {[
                {
                  label: "Pool / mo",
                  value: formatPHP(totalMonthlyCollectibles),
                },
                {
                  label: `Policy cap (${headsCount}H)`,
                  value: formatPHP(policyCap),
                },
                {
                  label: "Cash",
                  value: formatPHP(availableCashPool),
                },
                {
                  label: "Max loanable",
                  value: formatPHP(maxLoanable),
                },
              ].map((item) => (
                <div key={item.label} className="rl-inset">
                  <dt className="type-caption">{item.label}</dt>
                  <dd className="mt-1 font-mono text-sm font-bold text-[var(--ink)] tabular-nums">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        {/* Right Column: Sovereign Summary & Amortization Schedule */}
        <div className="rl-fund-stack">
          <section className="rl-vault-card" aria-label="Loan summary">
            <div className="rl-vault-body">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="rl-vault-eyebrow">Total payable</p>
                  <p className="type-metric-lg mt-1 text-white">
                    {formatPHP(schedule ? schedule.totalPayable : 0)}
                  </p>
                </div>
                <span className="rl-vault-badge">
                  {(interestRate * 100).toFixed(0)}% interest
                </span>
              </div>

              <dl className="rl-vault-meta-grid">
                <div className="rl-vault-meta-item">
                  <dt>Principal</dt>
                  <dd>{formatPHP(principal)}</dd>
                </div>
                <div className="rl-vault-meta-item">
                  <dt>Interest</dt>
                  <dd>
                    {formatPHP(schedule ? schedule.interestTotal : 0)}
                  </dd>
                </div>
                <div className="rl-vault-meta-item col-span-2 sm:col-span-1">
                  <dt>Per Installment</dt>
                  <dd>
                    {schedule && schedule.installments[0]
                      ? formatPHP(schedule.installments[0].totalDue)
                      : formatPHP(0)}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <section
            className="rl-panel rl-stack"
            aria-labelledby="schedule-heading"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
              <h2 className="type-title" id="schedule-heading">
                Schedule
              </h2>
              <span className="type-caption">
                {schedule ? `${schedule.installmentCount} installments` : "—"}
              </span>
            </div>

            {schedule ? (
              <>
                <ul className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
                  {schedule.installments.map((row) => (
                    <li
                      key={row.installmentNumber}
                      className="flex items-center justify-between gap-3 bg-[var(--surface-elevated)] px-4 py-3.5"
                    >
                      <div>
                        <p className="type-body-sm font-semibold">
                          Installment #{row.installmentNumber} ·{" "}
                          {row.dueDate.toLocaleDateString("en-PH", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                        <p className="type-caption mt-0.5 font-mono">
                          Grace{" "}
                          {row.graceDeadline.toLocaleDateString("en-PH", {
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm font-bold text-[var(--ink)] tabular-nums">
                          <Money amount={row.totalDue.toString()} />
                        </p>
                        <p className="type-caption font-mono">
                          {formatPHP(row.principalComponent)} +{" "}
                          {formatPHP(row.interestComponent)} int
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>

              </>
            ) : (
              <p className="type-caption py-6 text-center">
                Enter a principal to preview.
              </p>
            )}

            {toast ? (
              <p
                className={`rl-alert ${
                  toast.type === "ok" ? "rl-alert-ok" : "rl-alert-error"
                }`}
                role="status"
              >
                {toast.message}
              </p>
            ) : null}

            <button
              type="button"
              disabled={!canRequest}
              onClick={submitRequest}
              className="rl-btn rl-btn-primary rl-btn-lg rl-btn-block"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <HandCoins className="h-4 w-4" aria-hidden />
              )}
              {pending
                ? "Submitting…"
                : eligibility.eligible
                  ? `Request ${formatPHP(principal)}`
                  : "Not eligible"}
            </button>
          </section>
        </div>
      </div>
    </FundCanvas>
  );
}
