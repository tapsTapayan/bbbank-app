"use client";

import { useId } from "react";
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

function StatusCell({
  cell,
  highlighted,
}: {
  cell: KinsenaMapCell;
  highlighted: boolean;
}) {
  const title = `${MONTH_FULL[cell.monthIndex]} ${halfLabel(cell)} · ${TONE_LABEL[cell.tone]}`;
  return (
    <span
      className={clsx(
        "pp-cell",
        `pp-cell--${cell.tone}`,
        highlighted && "is-selected",
      )}
      title={title}
      aria-label={title}
      role="img"
    />
  );
}

function optionLabel(t: PaymentTargetOption) {
  const half =
    t.kinsenaIndex === 1 ? "15th" : t.kinsenaIndex === 2 ? "EOM" : "";
  const date = formatKinsenaDueLabel(new Date(t.dueDate));
  const status = t.isOverdue ? " · Overdue" : "";
  return `${date}${half ? ` · ${half}` : ""}${status} · ${formatPHP(t.suggestedAmount)}`;
}

/** Compact year status grid + period selector (Auto / specific). Grid is not interactive. */
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
        role="img"
        aria-label={`Kinsenas status for ${map.cycleName}`}
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
          />
        ))}

        <div className="pp-rowhead">EO</div>
        {rowEom.map((cell) => (
          <StatusCell
            key={`2-${cell.monthIndex}`}
            cell={cell}
            highlighted={Boolean(highlightId && cell.id === highlightId)}
          />
        ))}
      </div>

      <label className="rl-field mt-3" htmlFor={selectId}>
        <span className="rl-field-label">Period</span>
        <select
          id={selectId}
          className="rl-select"
          value={selectValue}
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
            {autoTarget
              ? ` · ${formatKinsenaDueLabel(new Date(autoTarget.dueDate))}${
                  autoTarget.kinsenaIndex === 1
                    ? " 15th"
                    : autoTarget.kinsenaIndex === 2
                      ? " EOM"
                      : ""
                }${autoTarget.isOverdue ? " · Overdue" : ""} · ${formatPHP(autoTarget.suggestedAmount)}`
              : ""}
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
