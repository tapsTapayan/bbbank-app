import { prisma } from "@/lib/db";

export type KinsenaMapTone =
  | "empty"
  | "upcoming"
  | "due"
  | "overdue"
  | "partial"
  | "pending"
  | "paid";

export type KinsenaMapCell = {
  id: string | null;
  periodMonth: string;
  monthIndex: number;
  kinsenaIndex: 1 | 2;
  dueDate: string | null;
  status: string | null;
  tone: KinsenaMapTone;
  label: string;
};

export type MemberKinsenasYearMap = {
  cycleId: string;
  cycleName: string;
  year: number;
  cells: KinsenaMapCell[];
  counts: Record<KinsenaMapTone, number>;
};

const MONTH_SHORT = [
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

function dateOnlyUTC(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function toneForContribution(
  status: string,
  dueDate: Date,
  graceDeadline: Date,
  hasPending: boolean,
  today: Date,
): KinsenaMapTone {
  if (status === "PAID") return "paid";
  if (hasPending) return "pending";
  if (status === "OVERDUE") return "overdue";
  if (status === "PARTIAL") return "partial";

  const due = dateOnlyUTC(dueDate);
  const grace = dateOnlyUTC(graceDeadline);
  if (today < due) return "upcoming";
  if (today <= grace) return "due";
  return "overdue";
}

function cellLabel(
  monthIndex: number,
  kinsenaIndex: 1 | 2,
  year: number,
  tone: KinsenaMapTone,
): string {
  const half = kinsenaIndex === 1 ? "15th" : "30th";
  const month = MONTH_SHORT[monthIndex] ?? "?";
  const toneWord: Record<KinsenaMapTone, string> = {
    empty: "not open yet",
    upcoming: "upcoming",
    due: "due now",
    overdue: "overdue",
    partial: "partially paid",
    pending: "awaiting verification",
    paid: "paid",
  };
  return `${month} ${year} · ${half} — ${toneWord[tone]}`;
}

/**
 * Active-cycle year grid: 12 months × 2 kinsenas (GitHub-style status map).
 */
export async function getMemberKinsenasYearMap(
  userId: string,
): Promise<MemberKinsenasYearMap | null> {
  const cycle = await prisma.fundCycle.findFirst({
    where: { isActive: true },
    select: { id: true, name: true, startDate: true },
  });
  if (!cycle) return null;

  const year = cycle.startDate.getUTCFullYear();
  const today = dateOnlyUTC(new Date());

  const contributions = await prisma.contribution.findMany({
    where: { userId, cycleId: cycle.id },
    select: {
      id: true,
      periodMonth: true,
      kinsenaIndex: true,
      dueDate: true,
      graceDeadline: true,
      status: true,
      paymentSubmissions: {
        where: { status: "PENDING_VERIFICATION" },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: [{ periodMonth: "asc" }, { kinsenaIndex: "asc" }],
  });

  const byKey = new Map<string, (typeof contributions)[number]>();
  for (const c of contributions) {
    const m = c.periodMonth.getUTCMonth();
    byKey.set(`${m}:${c.kinsenaIndex}`, c);
  }

  const counts: Record<KinsenaMapTone, number> = {
    empty: 0,
    upcoming: 0,
    due: 0,
    overdue: 0,
    partial: 0,
    pending: 0,
    paid: 0,
  };

  const cells: KinsenaMapCell[] = [];
  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    for (const kinsenaIndex of [1, 2] as const) {
      const row = byKey.get(`${monthIndex}:${kinsenaIndex}`);
      const periodMonth = new Date(Date.UTC(year, monthIndex, 1)).toISOString();

      if (!row) {
        const tone: KinsenaMapTone = "empty";
        counts.empty += 1;
        cells.push({
          id: null,
          periodMonth,
          monthIndex,
          kinsenaIndex,
          dueDate: null,
          status: null,
          tone,
          label: cellLabel(monthIndex, kinsenaIndex, year, tone),
        });
        continue;
      }

      const hasPending = row.paymentSubmissions.length > 0;
      const tone = toneForContribution(
        row.status,
        row.dueDate,
        row.graceDeadline,
        hasPending,
        today,
      );
      counts[tone] += 1;
      cells.push({
        id: row.id,
        periodMonth,
        monthIndex,
        kinsenaIndex,
        dueDate: row.dueDate.toISOString(),
        status: row.status,
        tone,
        label: cellLabel(monthIndex, kinsenaIndex, year, tone),
      });
    }
  }

  return {
    cycleId: cycle.id,
    cycleName: cycle.name,
    year,
    cells,
    counts,
  };
}
