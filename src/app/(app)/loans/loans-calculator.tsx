"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Calculator,
  CheckCircle2,
  Loader2,
  XCircle,
  Wallet,
} from "lucide-react";
import { formatPHP } from "@/lib/finance/loan-calculator";
import {
  generate2MonthLoanSchedule,
  type RepaymentFrequency,
} from "@/lib/finance/cpe-policy";
import { requestLoan } from "@/actions/loans";
import { PageHeader } from "@/components/ui/page-header";
import { Money } from "@/components/ui/money";

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
  const [toast, setToast] = useState<string | null>(null);
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
        setToast(result.error);
        return;
      }
      setToast(result.message ?? "Loan request submitted.");
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

  return (
    <div className="ui-fund-frame">
      <PageHeader
        eyebrow="Loans"
        title="Calculator"
        description={
          cycleName
            ? `${(interestRate * 100).toFixed(0)}% · ${termMonths} mo · ${cycleName}`
            : `${(interestRate * 100).toFixed(0)}% · ${termMonths} mo`
        }
      />

      <div className="ui-fund-stack">
        <section
          className={
            eligibility.eligible
              ? "ui-alert ui-alert-ok flex items-start gap-2"
              : "ui-alert ui-alert-error flex items-start gap-2"
          }
          role="status"
        >
          {eligibility.eligible ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          <div>
            <p className="font-medium">
              {eligibility.eligible
                ? "Eligible to request a loan"
                : "Not currently eligible"}
            </p>
            <p className="type-caption mt-1">
              {headsCount} head{headsCount === 1 ? "" : "s"} · {memberStatus}
            </p>
            {!eligibility.eligible ? (
              <ul className="mt-2 list-inside list-disc type-caption">
                {eligibility.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>

        <div className="ui-desk ui-desk-col">
          <div className="ui-desk-split">
            <section aria-labelledby="max-loanable-heading">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-[var(--brand)]" aria-hidden />
                <h2 className="type-title" id="max-loanable-heading">
                  Max loanable
                </h2>
              </div>
              <p className="mt-1">
                <Money amount={maxLoanable} metric />
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-3">
                {(
                  [
                    ["Monthly pool", formatPHP(totalMonthlyCollectibles)],
                    ["Policy cap", formatPHP(policyCap)],
                    ["Cash pool", formatPHP(availableCashPool)],
                    [
                      "Limited by",
                      limitedBy === "POLICY"
                        ? "Policy cap"
                        : limitedBy === "CASH"
                          ? "Available cash"
                          : "Policy & cash",
                    ],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="ui-inset">
                    <dt className="type-caption">{label}</dt>
                    <dd className="type-body-sm mt-1 font-medium tabular-nums">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section aria-labelledby="estimate-heading">
              <div className="flex items-center gap-2">
                <Calculator
                  className="h-4 w-4 text-[var(--brand)]"
                  aria-hidden
                />
                <h2 className="type-title" id="estimate-heading">
                  Estimate schedule
                </h2>
              </div>

              <label className="ui-field">
                <span className="ui-field-label">Principal (₱)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={principalInput}
                  onChange={(e) => setPrincipalInput(e.target.value)}
                  className="ui-input tabular-nums"
                />
              </label>
              {overCap ? (
                <p
                  className="type-caption font-medium text-[var(--danger)]"
                  role="alert"
                >
                  Exceeds max loanable {formatPHP(maxLoanable)}.
                </p>
              ) : null}

              <fieldset className="ui-field">
                <legend className="ui-field-label">Repayment frequency</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["KINSENAS", "4 kinsenas"],
                      ["MONTHLY", "2 monthly"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFrequency(value)}
                      aria-pressed={frequency === value}
                      className={`ui-chip flex h-11 items-center justify-center type-body-sm font-medium ${
                        frequency === value ? "ui-chip-selected" : ""
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {schedule ? (
                <div className="ui-stack-sm">
                  <dl className="grid grid-cols-3 gap-2 text-center">
                    {(
                      [
                        ["Interest", formatPHP(schedule.interestTotal)],
                        ["Total", formatPHP(schedule.totalPayable)],
                        [
                          "Installments",
                          `${schedule.installmentCount} (est. from today)`,
                        ],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label} className="ui-inset">
                        <dt className="type-caption">{label}</dt>
                        <dd className="type-body-sm mt-1 font-semibold tabular-nums">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius)] border border-[var(--border)]">
                    {schedule.installments.map((row) => (
                      <li
                        key={row.installmentNumber}
                        className="flex min-h-14 items-center justify-between gap-3 px-3 py-3"
                      >
                        <div>
                          <p className="type-body-sm font-medium">
                            #{row.installmentNumber} ·{" "}
                            {row.dueDate.toLocaleDateString("en-PH", {
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                          <p className="type-caption mt-1">
                            Grace ends{" "}
                            {row.graceDeadline.toLocaleDateString("en-PH", {
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                        </div>
                        <p className="type-body-sm font-semibold tabular-nums">
                          {formatPHP(row.totalDue)}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <p className="type-caption">
                    Late ₱10 × {headsCount}/head/day after grace.
                  </p>
                </div>
              ) : null}

              {toast ? (
                <p className="ui-alert ui-alert-info" role="status">
                  {toast}
                </p>
              ) : null}

              <button
                type="button"
                disabled={!canRequest}
                onClick={submitRequest}
                className="ui-btn ui-btn-primary ui-btn-lg ui-btn-block mt-auto"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                {pending
                  ? "Submitting…"
                  : eligibility.eligible
                    ? "Request loan"
                    : "Not eligible"}
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
