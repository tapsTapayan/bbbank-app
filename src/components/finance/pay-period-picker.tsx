"use client";

import { useId, useMemo } from "react";
import { clsx } from "clsx";
import { formatPHP } from "@/lib/finance/loan-calculator";
import { formatKinsenaDueLabel } from "@/lib/finance/cpe-policy";
import type {
  KinsenaMapCell,
  KinsenaMapTone,
  MemberKinsenasYearMap,
} from "@/lib/queries/member-kinsenas-year";
import type { PaymentTargetOption } from "@/lib/queries/member-payment-targets";

const MONTHS = [
  "J",
  "F",
  "M",
  "A",
  "M",
  "J",
  "J",
  "A",
  "S",
  "O",
  "N",
  "D",
] as const;

const MONTH_FULL = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const TONE_LABEL: Record<KinsenaMapTone, string> = {
  paid: "Paid",
  pending: "Pending",
  partial: "Partial",
  due: "Due",
  overdue: "Overdue",
  upcoming: "Upcoming",
  empty: "Closed",
};

export const PERIOD_AUTO = "__auto__" as const;

type PayPeriodPickerProps = {
  map: MemberKinsenasYearMap;
  contributionTargets: PaymentTargetOption[];
  autoPeriodId: string;
  periodMode: "auto" | "manual";
  selectedPeriodId?: string;
  onPeriodModeChange: (mode: "auto" | "manual", periodId: string) => void;
};

function dayOrdinal(day: number) {
  const j = day % 10;
  const k = day % 100;
  if (j === 1 && k !== 11) return `${day}st`;
  if (j === 2 && k !== 12) return `${day}nd`;
  if (j === 3 && k !== 13) return `${day}rd`;
  return `${day}th`;
}

function halfLabel(cell: KinsenaMapCell) {
  if (cell.kinsenaIndex === 1) return "15th";
  if (cell.dueDate) {
    return dayOrdinal(new Date(cell.dueDate).getUTCDate());
  }
  return "EOM";
}

function periodRangeLabel(target: PaymentTargetOption): string {
  const due = new Date(target.dueDate);
  const month = due.toLocaleDateString("en-PH", {
    month: "short",
    timeZone: "UTC",
  });
  if (target.kinsenaIndex === 1) return `${month} 1–15`;
  const endDay = due.getUTCDate();
  return `${month} 16–${endDay}`;
}

function StatusCell({
  cell,
  highlighted,
  selectable,
  onSelect,
}: {
  cell: KinsenaMapCell;
  highlighted: boolean;
  selectable: boolean;
  onSelect: () => void;
}) {
  const title = `${MONTH_FULL[cell.monthIndex]} ${halfLabel(cell)} · ${TONE_LABEL[cell.tone]}`;
  const className = clsx(
    "pp-cell",
    `pp-cell--${cell.tone}`,
    highlighted && "is-selected",
    selectable && "pp-cell--interactive",
  );

  if (!selectable) {
    return (
      <span
        className={className}
        title={title}
        aria-label={title}
        aria-hidden={cell.tone === "empty" ? true : undefined}
      />
    );
  }

  return (
    <button
      type="button"
      className={className}
      title={`${title} — select period`}
      aria-label={`${title}. Select to preview remaining balance.`}
      aria-pressed={highlighted}
      onClick={onSelect}
    />
  );
}

function optionLabel(t: PaymentTargetOption) {
  const half =
    t.kinsenaIndex === 1 ? "15th" : t.kinsenaIndex === 2 ? "EOM" : "";
  const date = formatKinsenaDueLabel(new Date(t.dueDate));
  return `${date}${half ? ` · ${half}` : ""}`;
}

/** Compact year status grid + period selector. Squares set period + preview dues. */
export function PayPeriodPicker({
  map,
  contributionTargets,
  autoPeriodId,
  periodMode,
  selectedPeriodId,
  onPeriodModeChange,
}: PayPeriodPickerProps) {
  const headingId = useId();
  const selectId = useId();
  const previewId = useId();

  const targetsById = useMemo(() => {
    const m = new Map<string, PaymentTargetOption>();
    for (const t of contributionTargets) m.set(t.id, t);
    return m;
  }, [contributionTargets]);

  const row15 = MONTHS.map((_, monthIndex) =>
    map.cells.find(
      (c) => c.monthIndex === monthIndex && c.kinsenaIndex === 1,
    )!,
  );
  const rowEom = MONTHS.map((_, monthIndex) =>
    map.cells.find(
      (c) => c.monthIndex === monthIndex && c.kinsenaIndex === 2,
    )!,
  );

  const openCount =
    map.counts.due +
    map.counts.overdue +
    map.counts.partial +
    map.counts.pending;

  const highlightId =
    selectedPeriodId ??
    (periodMode === "auto" ? autoPeriodId : undefined);

  const selectValue =
    periodMode === "auto" ? PERIOD_AUTO : (selectedPeriodId ?? PERIOD_AUTO);

  const autoTarget = contributionTargets.find((t) => t.id === autoPeriodId);
  const previewTarget = highlightId
    ? targetsById.get(highlightId)
    : undefined;

  function selectCell(cell: KinsenaMapCell) {
    if (!cell.id || !targetsById.has(cell.id)) return;
    onPeriodModeChange("manual", cell.id);
  }

  return (
    <section className="pp-picker" aria-labelledby={headingId}>
      <div className="pp-head">
        <p className="type-label" id={headingId}>
          Year status
        </p>
        <p className="type-caption tabular-nums shrink-0">
          {openCount > 0 ? `${openCount} open` : "Clear"}
        </p>
      </div>

      <div
        className="pp-grid"
        role="group"
        aria-label={`Kinsenas status for ${map.cycleName}. Tap an open square to select that period.`}
      >
        <div className="pp-corner" aria-hidden />
        {MONTHS.map((letter, i) => (
          <div key={`${letter}-${i}`} className="pp-month">
            {letter}
          </div>
        ))}

        <div className="pp-rowhead">15</div>
        {row15.map((cell) => (
          <StatusCell
            key={`1-${cell.monthIndex}`}
            cell={cell}
            highlighted={Boolean(highlightId && cell.id === highlightId)}
            selectable={Boolean(cell.id && targetsById.has(cell.id))}
            onSelect={() => selectCell(cell)}
          />
        ))}

        <div className="pp-rowhead">EO</div>
        {rowEom.map((cell) => (
          <StatusCell
            key={`2-${cell.monthIndex}`}
            cell={cell}
            highlighted={Boolean(highlightId && cell.id === highlightId)}
            selectable={Boolean(cell.id && targetsById.has(cell.id))}
            onSelect={() => selectCell(cell)}
          />
        ))}
      </div>

      {previewTarget ? (
        <div
          className="pp-preview"
          id={previewId}
          aria-live="polite"
        >
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <p className="type-caption font-semibold text-[var(--ink)]">
              {periodRangeLabel(previewTarget)}
              {previewTarget.isOverdue
                ? " · Overdue"
                : previewTarget.isWithinGrace
                  ? " · In grace"
                  : previewTarget.isAdvance
                    ? " · Advance"
                    : ""}
            </p>
            <p className="font-mono text-sm font-bold tabular-nums text-[var(--ink)]">
              {formatPHP(previewTarget.suggestedAmount)}
            </p>
          </div>
          <p className="type-caption mt-0.5 font-mono tabular-nums text-[var(--ink-muted)]">
            {Number(previewTarget.penaltyAmount) > 0 ? (
              <>
                {formatPHP(previewTarget.baseRemaining)} base +{" "}
                {formatPHP(previewTarget.penaltyAmount)} late
              </>
            ) : (
              <>Remaining balance · no late fee</>
            )}
          </p>
        </div>
      ) : null}

      <label className="rl-field mt-3" htmlFor={selectId}>
        <span className="rl-field-label">Period</span>
        <select
          id={selectId}
          className="rl-select"
          value={selectValue}
          aria-describedby={previewTarget ? previewId : undefined}
          onChange={(e) => {
            const value = e.target.value;
            if (value === PERIOD_AUTO) {
              onPeriodModeChange("auto", autoPeriodId);
              return;
            }
            onPeriodModeChange("manual", value);
          }}
        >
          <option value={PERIOD_AUTO}>
            Auto
            {autoTarget ? ` · ${optionLabel(autoTarget)}` : ""}
          </option>
          {contributionTargets.map((t) => (
            <option key={t.id} value={t.id}>
              {optionLabel(t)}
            </option>
          ))}
        </select>
      </label>

      <ul className="pp-key" aria-label="Status key">
        <li>
          <span className="pp-cell pp-cell--due" aria-hidden />
          Open
        </li>
        <li>
          <span className="pp-cell pp-cell--overdue" aria-hidden />
          Late
        </li>
        <li>
          <span className="pp-cell pp-cell--pending" aria-hidden />
          Pending
        </li>
        <li>
          <span className="pp-cell pp-cell--paid" aria-hidden />
          Paid
        </li>
      </ul>
    </section>
  );
}
