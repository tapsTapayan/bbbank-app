"use client";

import { useId } from "react";
import { clsx } from "clsx";
import type {
  KinsenaMapCell,
  KinsenaMapTone,
  MemberKinsenasYearMap,
} from "@/lib/queries/member-kinsenas-year";

const MONTHS = [
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

const LEGEND: KinsenaMapTone[] = [
  "paid",
  "pending",
  "partial",
  "due",
  "overdue",
  "upcoming",
];

type KinsenasYearMapProps = {
  map: MemberKinsenasYearMap;
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

function MatrixCell({ cell }: { cell: KinsenaMapCell }) {
  const title = `${MONTHS[cell.monthIndex]} ${halfLabel(cell)} · ${TONE_LABEL[cell.tone]}`;
  return (
    <span
      className={clsx("km-mark", `km-mark--${cell.tone}`)}
      title={title}
      aria-label={title}
      role="img"
    />
  );
}

/** Dashboard year ledger — read-only status overview of the 24 kinsenas slots. */
export function KinsenasYearMap({ map }: KinsenasYearMapProps) {
  const headingId = useId();
  const paid = map.counts.paid;
  const openCount =
    map.counts.due +
    map.counts.overdue +
    map.counts.partial +
    map.counts.pending;
  const tracked = map.cells.filter((c) => c.tone !== "empty").length;
  const progress = tracked > 0 ? Math.round((paid / tracked) * 100) : 0;

  const row15 = MONTHS.map((_, monthIndex) =>
    map.cells.find(
      (c) => c.monthIndex === monthIndex && c.kinsenaIndex === 1,
    )!,
  );
  const row30 = MONTHS.map((_, monthIndex) =>
    map.cells.find(
      (c) => c.monthIndex === monthIndex && c.kinsenaIndex === 2,
    )!,
  );

  return (
    <section
      className="km-ledger"
      aria-labelledby={headingId}
      aria-describedby={`${headingId}-summary`}
    >
      <div className="km-ledger-head">
        <div className="min-w-0">
          <p className="type-label" id={headingId}>
            Year ledger
          </p>
          <p className="type-title mt-1">{map.cycleName}</p>
        </div>
        <div className="km-ledger-stat" id={`${headingId}-summary`}>
          <p className="type-caption">Paid</p>
          <p className="type-body-sm font-semibold tabular-nums mt-0.5">
            {tracked === 0 ? "—" : `${paid} / ${tracked}`}
          </p>
        </div>
      </div>

      {tracked > 0 ? (
        <div
          className="km-progress"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${progress}% of opened kinsenas paid`}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
      ) : null}

      <div className="km-matrix-wrap">
        <table className="km-matrix">
          <caption className="sr-only">
            Kinsenas status by month for {map.cycleName}. Rows are the 15th and
            end-of-month dues.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="km-matrix-corner">
                <span className="sr-only">Slot</span>
              </th>
              {MONTHS.map((name) => (
                <th key={name} scope="col" className="km-matrix-month">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="km-matrix-rowhead">
                15
              </th>
              {row15.map((cell) => (
                <td key={`1-${cell.monthIndex}`}>
                  <MatrixCell cell={cell} />
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="km-matrix-rowhead">
                EOM
              </th>
              {row30.map((cell) => (
                <td key={`2-${cell.monthIndex}`}>
                  <MatrixCell cell={cell} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <ul className="km-legend" aria-label="Status legend">
        {LEGEND.map((tone) => (
          <li key={tone}>
            <span className={clsx("km-mark", `km-mark--${tone}`)} aria-hidden />
            {TONE_LABEL[tone]}
          </li>
        ))}
      </ul>

      {openCount > 0 ? (
        <p className="type-caption mt-3">
          {openCount} open
          {map.counts.overdue > 0 ? ` · ${map.counts.overdue} overdue` : ""}
        </p>
      ) : tracked > 0 ? (
        <p className="type-caption mt-3">All paid.</p>
      ) : (
        <p className="type-caption mt-3">No periods opened yet.</p>
      )}
    </section>
  );
}
