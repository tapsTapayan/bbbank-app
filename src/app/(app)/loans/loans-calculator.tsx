"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Calculator,
  CheckCircle2,
  Loader2,
  XCircle,
  Wallet,
  CalendarClock,
  ShieldCheck,
  HandCoins,
} from "lucide-react";
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
  memberStatus,
  cycleName,
  interestRate,
  termMonths,
  totalMonthlyCollectibles,
  availableCashPool,
  policyCap,
  maxLoanable,
  limitedBy,
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
        eyebrow="Sinking Fund Credit Facility"
        title="Loan Calculator & Request"
        description={`Rule #2 Policy: ${(interestRate * 100).toFixed(0)}% flat interest · ${termMonths}-month term · Payable in 4 kinsenas or 2 monthly installments${cycleName ? ` (${cycleName})` : ""}`}
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
              <div className="flex items-center gap-2">
                <ShieldCheck
                  className="h-4 w-4 text-[var(--brand)]"
                  aria-hidden
                />
                <h2 className="type-title" id="eligibility-heading">
                  Rule #5 Borrowing Eligibility
                </h2>
              </div>
              <span
                className={`rl-pill ${
                  eligibility.eligible ? "rl-pill-verified" : "rl-pill-rejected"
                }`}
              >
                {eligibility.eligible ? "Eligible" : "Ineligible"}
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {[
                {
                  label: "Member Status",
                  ok: eligibility.statusOk,
                  detail: memberStatus,
                },
                {
                  label: "Kinsenas Dues",
                  ok: eligibility.noOverdueContributions,
                  detail: eligibility.noOverdueContributions
                    ? "Zero overdue"
                    : "Has overdue",
                },
                {
                  label: "Existing Loans",
                  ok: eligibility.noBlockingLoans,
                  detail: eligibility.noBlockingLoans
                    ? "No active loan"
                    : "Blocking loan",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rl-inset flex items-start gap-2.5"
                >
                  {item.ok ? (
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]"
                      aria-hidden
                    />
                  ) : (
                    <XCircle
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]"
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--ink)]">
                      {item.label}
                    </p>
                    <p className="type-caption mt-0.5">{item.detail}</p>
                  </div>
                </div>
              ))}
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
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3">
              <Calculator
                className="h-4 w-4 text-[var(--brand)]"
                aria-hidden
              />
              <h2 className="type-title" id="estimate-heading">
                Configure Principal & Repayment Schedule
              </h2>
            </div>

            <div className="rl-stack-sm">
              <label className="rl-field">
                <span className="rl-field-label">
                  Desired Principal Amount (PHP)
                </span>
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
                Repayment Frequency (2-Month Term)
              </legend>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    {
                      value: "KINSENAS",
                      title: "4 Kinsenas",
                      sub: "Every 15th & EOM",
                    },
                    {
                      value: "MONTHLY",
                      title: "2 Monthly",
                      sub: "End of each month",
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFrequency(opt.value)}
                    aria-pressed={frequency === opt.value}
                    className={`rl-chip flex flex-col items-start justify-center py-3 text-left ${
                      frequency === opt.value ? "rl-chip-selected" : ""
                    }`}
                  >
                    <span className="text-sm font-bold">{opt.title}</span>
                    <span className="text-[11px] font-normal opacity-80">
                      {opt.sub}
                    </span>
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
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-[var(--brand)]" aria-hidden />
                <h2 className="type-title" id="max-loanable-heading">
                  Rule #1 Loanable Cap Telemetry
                </h2>
              </div>
              <span className="type-caption font-mono">
                {headsCount} head{headsCount === 1 ? "" : "s"}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-3">
              {[
                {
                  label: "Monthly Pool Collectibles",
                  value: formatPHP(totalMonthlyCollectibles),
                  sub: "Active members × 2 kinsenas",
                },
                {
                  label: `Policy Cap (50% × ${headsCount})`,
                  value: formatPHP(policyCap),
                  sub: "Rule #1 head-weighted cap",
                },
                {
                  label: "Available Cash Pool",
                  value: formatPHP(availableCashPool),
                  sub: "Verified ledger cash balance",
                },
                {
                  label: "Binding Constraint",
                  value: formatPHP(maxLoanable),
                  sub:
                    limitedBy === "POLICY"
                      ? "Capped by policy limit"
                      : limitedBy === "CASH"
                        ? "Capped by cash pool"
                        : "Policy & cash aligned",
                },
              ].map((item) => (
                <div key={item.label} className="rl-inset">
                  <dt className="type-caption">{item.label}</dt>
                  <dd className="mt-1 font-mono text-sm font-bold text-[var(--ink)] tabular-nums">
                    {item.value}
                  </dd>
                  <dd className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
                    {item.sub}
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
                  <p className="rl-vault-eyebrow">Estimated Total Payable</p>
                  <p className="type-metric-lg mt-1 text-white">
                    {formatPHP(schedule ? schedule.totalPayable : 0)}
                  </p>
                </div>
                <span className="rl-vault-badge">
                  {(interestRate * 100).toFixed(0)}% Flat Interest
                </span>
              </div>

              <dl className="rl-vault-meta-grid">
                <div className="rl-vault-meta-item">
                  <dt>Principal</dt>
                  <dd>{formatPHP(principal)}</dd>
                </div>
                <div className="rl-vault-meta-item">
                  <dt>10% Interest</dt>
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
              <div className="flex items-center gap-2">
                <CalendarClock
                  className="h-4 w-4 text-[var(--brand)]"
                  aria-hidden
                />
                <h2 className="type-title" id="schedule-heading">
                  Projected Amortization Schedule
                </h2>
              </div>
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
                          2-day grace ends{" "}
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

                <p className="type-caption">
                  Rule #3 Late Penalty: Lapsed installments past the 2-day grace deadline incur{" "}
                  <span className="font-mono font-semibold text-[var(--ink)]">
                    ₱10 × {headsCount} head{headsCount === 1 ? "" : "s"}/day
                  </span>
                  . Payments allocate strictly to Penalties → Interest → Principal.
                </p>
              </>
            ) : (
              <p className="type-body-sm type-muted py-6 text-center">
                Enter a principal amount above to preview your repayment schedule.
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
                ? "Submitting Loan Request…"
                : eligibility.eligible
                  ? `Request ${formatPHP(principal)} Loan`
                  : "Not Eligible to Request Loan"}
            </button>
          </section>
        </div>
      </div>
    </FundCanvas>
  );
}
