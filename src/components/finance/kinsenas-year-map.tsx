"use client";

import Link from "next/link";
import { useId, useMemo } from "react";
import { clsx } from "clsx";
import { formatPHP } from "@/lib/finance/loan-calculator";
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

const TONE_PRIORITY: Record<KinsenaMapTone, number> = {
  overdue: 0,
  due: 1,
  partial: 2,
  pending: 3,
  upcoming: 4,
  paid: 5,
  empty: 6,
};

export type OpenPeriodMeta = {
  amount: number;
  penalty: number;
};

type KinsenasYearMapProps = {
  map: MemberKinsenasYearMap;
  variant?: "ledger" | "open";
  onSelectPeriod?: (contributionId: string) => void;
  selectedPeriodId?: string;
  /** Pay desk: remaining totals keyed by contribution id. */
  periodMeta?: Record<string, OpenPeriodMeta>;
};

function isActionable(tone: KinsenaMapTone) {
  return (
    tone === "due" ||
    tone === "overdue" ||
    tone === "partial" ||
    tone === "pending" ||
    tone === "upcoming"
  );
}

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
  const payHref = cell.id ? `/pay?target=${cell.id}` : "/pay";
  const markClass = clsx("km-mark", `km-mark--${cell.tone}`);

  if (cell.tone === "empty") {
    return <span className={markClass} title={title} aria-label={title} />;
  }

  if (isActionable(cell.tone)) {
    return (
      <Link
        href={payHref}
        className={markClass}
        title={title}
        aria-label={title}
      />
    );
  }

  return (
    <span
      className={markClass}
      title={title}
      aria-label={title}
      role="img"
    />
  );
}

function OpenPeriodList({
  cells,
  onSelectPeriod,
  selectedPeriodId,
  periodMeta,
}: {
  cells: KinsenaMapCell[];
  onSelectPeriod?: (contributionId: string) => void;
  selectedPeriodId?: string;
  periodMeta?: Record<string, OpenPeriodMeta>;
}) {
  const groups = useMemo(() => {
    const open = cells
      .filter((c) => isActionable(c.tone) && c.id)
      .sort((a, b) => {
        const p = TONE_PRIORITY[a.tone] - TONE_PRIORITY[b.tone];
        if (p !== 0) return p;
        if (a.monthIndex !== b.monthIndex) return a.monthIndex - b.monthIndex;
        return a.kinsenaIndex - b.kinsenaIndex;
      });

    const byMonth: { monthIndex: number; items: KinsenaMapCell[] }[] = [];
    for (const cell of open) {
      const last = byMonth[byMonth.length - 1];
      if (last && last.monthIndex === cell.monthIndex) {
        last.items.push(cell);
      } else {
        byMonth.push({ monthIndex: cell.monthIndex, items: [cell] });
      }
    }
    return byMonth;
  }, [cells]);

  if (groups.length === 0) {
    return (
      <p className="type-body-sm type-muted px-1 py-3">All caught up for now.</p>
    );
  }

  return (
    <ul className="km-period-list">
      {groups.map((group) => (
        <li key={group.monthIndex} className="km-period-group">
          <p className="km-period-month">{MONTHS[group.monthIndex]}</p>
          <ul className="km-period-group-rows">
            {group.items.map((cell) => {
              const selected = Boolean(
                selectedPeriodId && cell.id === selectedPeriodId,
              );
              const meta = cell.id ? periodMeta?.[cell.id] : undefined;
              const label = `${MONTHS[cell.monthIndex]} ${halfLabel(cell)}`;

              const row = (
                <>
                  <span
                    className={clsx(
                      "km-period-rail",
                      `km-period-rail--${cell.tone}`,
                    )}
                    aria-hidden
                  />
                  <span className="km-period-main">
                    <span className="km-period-date">{label}</span>
                    <span
                      className={clsx(
                        "km-period-status",
                        `km-period-status--${cell.tone}`,
                      )}
                    >
                      {TONE_LABEL[cell.tone]}
                      {meta && meta.penalty > 0
                        ? ` · ${formatPHP(meta.penalty)} late`
                        : ""}
                    </span>
                  </span>
                  {meta ? (
                    <span className="km-period-amount">
                      {formatPHP(meta.amount)}
                    </span>
                  ) : null}
                </>
              );

              return (
                <li key={`${cell.monthIndex}-${cell.kinsenaIndex}`}>
                  {onSelectPeriod && cell.id ? (
                    <button
                      type="button"
                      className={clsx(
                        "km-period-row",
                        `km-period-row--${cell.tone}`,
                        selected && "is-selected",
                      )}
                      aria-pressed={selected}
                      onClick={() => onSelectPeriod(cell.id!)}
                    >
                      {row}
                    </button>
                  ) : (
                    <Link
                      href={cell.id ? `/pay?target=${cell.id}` : "/pay"}
                      className={clsx(
                        "km-period-row",
                        `km-period-row--${cell.tone}`,
                      )}
                    >
                      {row}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function KinsenasYearMap({
  map,
  variant = "ledger",
  onSelectPeriod,
  selectedPeriodId,
  periodMeta,
}: KinsenasYearMapProps) {
  const headingId = useId();
  const paid = map.counts.paid;
  const openCount =
    map.counts.due +
    map.counts.overdue +
    map.counts.partial +
    map.counts.pending;
  const tracked = map.cells.filter((c) => c.tone !== "empty").length;
  const progress = tracked > 0 ? Math.round((paid / tracked) * 100) : 0;

  if (variant === "open") {
    return (
      <section className="km-open" aria-labelledby={headingId}>
        <div className="km-open-head">
          <div>
            <p className="type-label" id={headingId}>
              Choose a period
            </p>
            <p className="type-caption mt-1">
              Overdue first · then current · then advance
            </p>
          </div>
          <p className="type-caption tabular-nums shrink-0">
            {openCount > 0 ? `${openCount} left` : "Clear"}
          </p>
        </div>
        <OpenPeriodList
          cells={map.cells}
          onSelectPeriod={onSelectPeriod}
          selectedPeriodId={selectedPeriodId}
          periodMeta={periodMeta}
        />
      </section>
    );
  }

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
                15th
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
          {openCount} still open
          {map.counts.overdue > 0 ? ` · ${map.counts.overdue} overdue` : ""}.
          Tap a cell to pay.
        </p>
      ) : tracked > 0 ? (
        <p className="type-caption mt-3">All opened periods are paid.</p>
      ) : (
        <p className="type-caption mt-3">
          No kinsenas opened yet for this cycle.
        </p>
      )}
    </section>
  );
}
