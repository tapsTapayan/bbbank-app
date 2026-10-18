import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  computeLiveLateFee,
  GRACE_PERIOD_DAYS,
  startOfLocalDay,
  type RejectedPenaltyWindow,
} from "@/lib/finance/cpe-policy";
import { autoOpenScheduledKinsenas } from "@/lib/finance/contribution-generator";

/**
 * Daily fund maintenance (Vercel cron, midnight PH / 16:00 UTC).
 *
 * 1. Auto-open kinsenas: when a due day arrives (15th or EOM), create
 *    Contribution rows through the newly payable period for all active members.
 * 2. CPE Rule #3 penalty accrual on open obligations past grace.
 *
 * Secure with Authorization: Bearer ${CRON_SECRET}.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const now = new Date();
  // Overdue only after the grace calendar day has fully elapsed.
  const today = startOfLocalDay(now);

  try {
    const kinsenas = await autoOpenScheduledKinsenas({ asOf: now });

    const [contributions, amortizations] = await Promise.all([
      prisma.contribution.findMany({
        where: {
          status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
          graceDeadline: { lt: today },
        },
        include: {
          paymentSubmissions: {
            where: { status: { in: ["PENDING_VERIFICATION", "REJECTED"] } },
            orderBy: { createdAt: "asc" },
            select: {
              status: true,
              createdAt: true,
              verifiedAt: true,
            },
          },
          cycle: { select: { gracePeriodDays: true, penaltyRate: true } },
        },
      }),
      prisma.loanAmortization.findMany({
        where: {
          status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
          graceDeadline: { lt: today },
        },
        include: {
          paymentSubmissions: {
            where: { status: { in: ["PENDING_VERIFICATION", "REJECTED"] } },
            orderBy: { createdAt: "asc" },
            select: {
              status: true,
              createdAt: true,
              verifiedAt: true,
            },
          },
          loan: {
            select: {
              headsSnapshot: true,
              cycle: { select: { gracePeriodDays: true, penaltyRate: true } },
            },
          },
        },
      }),
    ]);

    let contributionsUpdated = 0;
    let amortizationsUpdated = 0;

    for (const row of contributions) {
      if (row.penaltyAccrualFrozen) continue;

      const { pendingSubmittedAt, rejectedWindows } = splitSubmissionWindows(
        row.paymentSubmissions,
      );
      const fee = computeLiveLateFee({
        dueDate: row.dueDate,
        openedAt: row.createdAt,
        headsCount: row.headsSnapshot,
        now,
        gracePeriodDays: row.cycle.gracePeriodDays ?? GRACE_PERIOD_DAYS,
        graceDeadline: row.graceDeadline,
        ratePerHeadPerDay: row.cycle.penaltyRate.toString(),
        pendingSubmittedAt,
        rejectedWindows,
      });

      if (
        fee.chargeableDays === row.daysDelayed &&
        fee.penaltyAmount.toFixed(2) === row.penaltyAmount.toFixed(2) &&
        row.status === "OVERDUE"
      ) {
        continue;
      }

      await prisma.contribution.update({
        where: { id: row.id },
        data: {
          daysDelayed: fee.chargeableDays,
          penaltyAmount: fee.penaltyAmount.toFixed(2),
          status: fee.chargeableDays > 0 ? "OVERDUE" : row.status,
        },
      });
      contributionsUpdated += 1;
    }

    for (const row of amortizations) {
      if (row.penaltyAccrualFrozen) continue;

      const heads = row.headsSnapshot || row.loan.headsSnapshot;
      const { pendingSubmittedAt, rejectedWindows } = splitSubmissionWindows(
        row.paymentSubmissions,
      );
      const fee = computeLiveLateFee({
        dueDate: row.dueDate,
        openedAt: row.createdAt,
        headsCount: heads,
        now,
        gracePeriodDays: row.loan.cycle.gracePeriodDays ?? GRACE_PERIOD_DAYS,
        graceDeadline: row.graceDeadline,
        ratePerHeadPerDay: row.loan.cycle.penaltyRate.toString(),
        pendingSubmittedAt,
        rejectedWindows,
      });

      if (
        fee.chargeableDays === row.daysDelayed &&
        fee.penaltyAmount.toFixed(2) === row.penaltyAmount.toFixed(2) &&
        row.status === "OVERDUE"
      ) {
        continue;
      }

      await prisma.loanAmortization.update({
        where: { id: row.id },
        data: {
          daysDelayed: fee.chargeableDays,
          penaltyAmount: fee.penaltyAmount.toFixed(2),
          status: fee.chargeableDays > 0 ? "OVERDUE" : row.status,
        },
      });
      amortizationsUpdated += 1;
    }

    return NextResponse.json({
      success: true,
      asOf: now.toISOString(),
      kinsenasOpened: kinsenas.opened,
      kinsenasCreated: kinsenas.createdTotal,
      kinsenasThrough: kinsenas.through,
      contributionsScanned: contributions.length,
      contributionsUpdated,
      amortizationsScanned: amortizations.length,
      amortizationsUpdated,
    });
  } catch (err) {
    console.error("[cron/penalties]", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Daily fund cron failed",
      },
      { status: 500 },
    );
  }
}

function splitSubmissionWindows(
  submissions: ReadonlyArray<{
    status: string;
    createdAt: Date;
    verifiedAt: Date | null;
  }>,
): {
  pendingSubmittedAt: Date | null;
  rejectedWindows: RejectedPenaltyWindow[];
} {
  let pendingSubmittedAt: Date | null = null;
  const rejectedWindows: RejectedPenaltyWindow[] = [];

  for (const sub of submissions) {
    if (sub.status === "PENDING_VERIFICATION") {
      pendingSubmittedAt ??= sub.createdAt;
      continue;
    }
    if (sub.status === "REJECTED" && sub.verifiedAt) {
      rejectedWindows.push({
        submittedAt: sub.createdAt,
        rejectedAt: sub.verifiedAt,
      });
    }
  }

  return { pendingSubmittedAt, rejectedWindows };
}
