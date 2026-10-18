import { connection } from "next/server";
import { Decimal } from "decimal.js";
import { requirePageUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatPHP, remainingDues } from "@/lib/finance/loan-calculator";
import {
  calculateKinsenasDue,
  computeLiveLateFee,
  effectivePenaltyAmount,
  formatKinsenaDueLabel,
  formatKinsenaPeriodScope,
  formatLateFeeBreakdown,
  GRACE_PERIOD_DAYS,
} from "@/lib/finance/cpe-policy";
import { remainingContributionDues } from "@/lib/finance/payment-allocation";
import {
  formatPaymentScopeLabel,
  parseAllocationScopeLabels,
  parseAllocationSummary,
} from "@/lib/finance/payment-scope";
import { planSubmissionAllocation } from "@/lib/finance/plan-submission-allocation";
import { mapPaymentSubmissionStatus } from "@/lib/finance/status-labels";
import { getMemberPaymentTargets } from "@/lib/queries/member-payment-targets";
import { getMemberKinsenasYearMap } from "@/lib/queries/member-kinsenas-year";
import {
  MemberDashboardClient,
  type DashboardRecentPayment,
  type MemberDashboardData,
  type NextKinsenasObligation,
} from "./dashboard-client";

/** Auth + live Prisma reads — request-time, not instant-navigation shell. */
export const instant = false;

function splitWindows(
  submissions: ReadonlyArray<{
    status: string;
    createdAt: Date;
    verifiedAt: Date | null;
  }>,
) {
  let pendingSubmittedAt: Date | null = null;
  const rejectedWindows: Array<{ submittedAt: Date; rejectedAt: Date }> = [];
  for (const sub of submissions) {
    if (sub.status === "PENDING_VERIFICATION") {
      pendingSubmittedAt ??= sub.createdAt;
    } else if (sub.status === "REJECTED" && sub.verifiedAt) {
      rejectedWindows.push({
        submittedAt: sub.createdAt,
        rejectedAt: sub.verifiedAt,
      });
    }
  }
  return { pendingSubmittedAt, rejectedWindows };
}

async function loadDashboard(userId: string): Promise<MemberDashboardData> {
  await connection();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const now = new Date();

  const [
    user,
    contributionsAgg,
    activeLoan,
    recent,
    paymentTargets,
    nextContribution,
    kinsenasYearMap,
    activeCycle,
  ] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.ledgerEntry.aggregate({
      where: { userId, entryType: "CONTRIBUTION_IN" },
      _sum: { amount: true },
    }),
    prisma.loan.findFirst({
      where: { borrowerId: userId, status: { in: ["ACTIVE", "APPROVED"] } },
      include: {
        amortizations: {
          where: { status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] } },
          orderBy: { installmentNumber: "asc" },
          include: {
            paymentSubmissions: {
              where: { status: { in: ["PENDING_VERIFICATION", "REJECTED"] } },
              orderBy: { createdAt: "asc" },
              select: { status: true, createdAt: true, verifiedAt: true },
            },
          },
        },
        cycle: { select: { gracePeriodDays: true, penaltyRate: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.paymentSubmission.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        contribution: {
          select: { periodMonth: true, kinsenaIndex: true, dueDate: true },
        },
        loanAmortization: { select: { installmentNumber: true } },
        ledgerEntries: {
          orderBy: { createdAt: "asc" },
          select: { amount: true, description: true },
        },
      },
    }),
    getMemberPaymentTargets(userId),
    prisma.contribution.findFirst({
      where: {
        userId,
        status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
      },
      orderBy: { dueDate: "asc" },
      include: {
        cycle: {
          select: {
            gracePeriodDays: true,
            penaltyRate: true,
            contributionAmount: true,
          },
        },
        paymentSubmissions: {
          where: { status: { in: ["PENDING_VERIFICATION", "REJECTED"] } },
          orderBy: { createdAt: "asc" },
          select: { status: true, createdAt: true, verifiedAt: true },
        },
      },
    }),
    getMemberKinsenasYearMap(userId),
    prisma.fundCycle.findFirst({ where: { isActive: true } }),
  ]);

  // Interest earnings = member's heads-weighted share of cycle loan interest income.
  let interestEarnings = new Decimal(0);
  if (activeCycle) {
    const [interestAgg, headsAgg] = await Promise.all([
      prisma.ledgerEntry.aggregate({
        where: {
          cycleId: activeCycle.id,
          entryType: "INTEREST_INCOME_IN",
        },
        _sum: { amount: true },
      }),
      prisma.user.aggregate({
        where: { status: "ACTIVE", role: { in: ["MEMBER", "TREASURER", "AUDITOR"] } },
        _sum: { headsCount: true },
      }),
    ]);
    const poolInterest = new Decimal(
      interestAgg._sum.amount?.toString() ?? "0",
    );
    const totalHeads = headsAgg._sum.headsCount ?? 0;
    if (poolInterest.gt(0) && totalHeads > 0 && user.headsCount > 0) {
      interestEarnings = poolInterest
        .mul(user.headsCount)
        .div(totalHeads)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }
  }

  let activeLoanBalance = 0;
  let nextAmortization: MemberDashboardData["nextAmortization"] = null;

  if (activeLoan) {
    activeLoanBalance = activeLoan.amortizations.reduce((sum, a) => {
      const { pendingSubmittedAt, rejectedWindows } = splitWindows(
        a.paymentSubmissions,
      );
      const liveFee = computeLiveLateFee({
        dueDate: a.dueDate,
        openedAt: a.createdAt,
        headsCount: a.headsSnapshot || user.headsCount,
        now,
        gracePeriodDays:
          activeLoan.cycle.gracePeriodDays ?? GRACE_PERIOD_DAYS,
        graceDeadline: a.graceDeadline,
        ratePerHeadPerDay: activeLoan.cycle.penaltyRate.toString(),
        pendingSubmittedAt,
        rejectedWindows,
      });
      const rawPenalty = a.penaltyAccrualFrozen
        ? new Decimal(a.penaltyAmount.toString())
        : liveFee.penaltyAmount;
      const penalty = effectivePenaltyAmount(
        rawPenalty,
        a.penaltyWaivedAmount?.toString() ?? "0",
      );
      const dues = remainingDues({
        penaltyAmount: penalty,
        interestComponent: a.interestComponent.toString(),
        principalComponent: a.principalComponent.toString(),
        amountPaid: a.amountPaid.toString(),
      });
      return sum + Number(dues.totalDue.toString());
    }, 0);

    const next = activeLoan.amortizations[0];
    if (next) {
      const { pendingSubmittedAt, rejectedWindows } = splitWindows(
        next.paymentSubmissions,
      );
      const fee = computeLiveLateFee({
        dueDate: next.dueDate,
        openedAt: next.createdAt,
        headsCount: next.headsSnapshot || user.headsCount,
        now,
        gracePeriodDays:
          activeLoan.cycle.gracePeriodDays ?? GRACE_PERIOD_DAYS,
        graceDeadline: next.graceDeadline,
        ratePerHeadPerDay: activeLoan.cycle.penaltyRate.toString(),
        pendingSubmittedAt,
        rejectedWindows,
      });
      const rawPenalty = next.penaltyAccrualFrozen
        ? new Decimal(next.penaltyAmount.toString())
        : fee.penaltyAmount;
      const penalty = effectivePenaltyAmount(
        rawPenalty,
        next.penaltyWaivedAmount?.toString() ?? "0",
      );
      const dues = remainingDues({
        penaltyAmount: penalty,
        interestComponent: next.interestComponent.toString(),
        principalComponent: next.principalComponent.toString(),
        amountPaid: next.amountPaid.toString(),
      });
      nextAmortization = {
        installmentNumber: next.installmentNumber,
        dueDate: next.dueDate.toISOString(),
        graceDeadline: next.graceDeadline.toISOString(),
        // totalDue already includes late fee — do not add penalty again in UI
        amountDue: Number(dues.totalDue.toString()),
        penaltyAmount: Number(penalty.toFixed(2)),
        daysDelayed: next.penaltyAccrualFrozen
          ? next.daysDelayed
          : fee.chargeableDays,
        lateFeeBreakdown: next.penaltyAccrualFrozen
          ? "Pass granted — late fee frozen."
          : formatLateFeeBreakdown(fee),
        loanLabel: `Loan · ${activeLoan.id.slice(-6).toUpperCase()}`,
      };
    }
  }

  let nextKinsenas: NextKinsenasObligation | null = null;
  if (nextContribution) {
    const graceDays =
      nextContribution.cycle.gracePeriodDays ?? GRACE_PERIOD_DAYS;
    const { pendingSubmittedAt, rejectedWindows } = splitWindows(
      nextContribution.paymentSubmissions,
    );
    const fee = computeLiveLateFee({
      dueDate: nextContribution.dueDate,
      openedAt: nextContribution.createdAt,
      headsCount: nextContribution.headsSnapshot,
      now,
      gracePeriodDays: graceDays,
      graceDeadline: nextContribution.graceDeadline,
      ratePerHeadPerDay: nextContribution.cycle.penaltyRate.toString(),
      pendingSubmittedAt,
      rejectedWindows,
    });
    const rawPenalty = nextContribution.penaltyAccrualFrozen
      ? new Decimal(nextContribution.penaltyAmount.toString())
      : fee.penaltyAmount;
    const penalty = effectivePenaltyAmount(
      rawPenalty,
      nextContribution.penaltyWaivedAmount?.toString() ?? "0",
    );
    const dues = remainingContributionDues({
      amountDue: nextContribution.amountDue.toString(),
      amountPaid: nextContribution.amountPaid.toString(),
      penaltyAmount: penalty,
      penaltyWaivedAmount: 0,
    });
    nextKinsenas = {
      kinsenaIndex: nextContribution.kinsenaIndex,
      periodLabel: formatKinsenaDueLabel(nextContribution.dueDate),
      dueDate: nextContribution.dueDate.toISOString(),
      graceDeadline: nextContribution.graceDeadline.toISOString(),
      amountDue: Number(dues.principalDue.toFixed(2)),
      penaltyAmount: Number(penalty.toFixed(2)),
      daysDelayed: nextContribution.penaltyAccrualFrozen
        ? nextContribution.daysDelayed
        : fee.chargeableDays,
      lateFeeBreakdown: nextContribution.penaltyAccrualFrozen
        ? "Pass granted — late fee frozen."
        : formatLateFeeBreakdown(fee),
      isWithinGrace: fee.isWithinGrace,
      isOverdue: fee.isOverdue && !nextContribution.penaltyAccrualFrozen,
      isCatchUp: fee.isCatchUp,
      status: nextContribution.status,
      headsSnapshot: nextContribution.headsSnapshot,
      penaltyAccrualFrozen: Boolean(nextContribution.penaltyAccrualFrozen),
      pendingFreeze: Boolean(pendingSubmittedAt),
    };
  }

  const recentPlanned = new Map<string, string[]>();
  await Promise.all(
    recent
      .filter(
        (p) =>
          p.status === "PENDING_VERIFICATION" && !p.allocationSummary?.trim(),
      )
      .map(async (p) => {
        const planned = await planSubmissionAllocation({
          userId,
          amount: p.amount.toString(),
          targetType: p.targetType,
          paidAt: p.paidAt,
        });
        if (planned.lines.length === 0) return;
        recentPlanned.set(p.id, planned.lines);
        await prisma.paymentSubmission.updateMany({
          where: { id: p.id },
          data: {
            allocationSummary: planned.summary,
            ...(planned.primaryTargetId
              ? p.targetType === "CONTRIBUTION"
                ? {
                    contributionId: planned.primaryTargetId,
                    loanAmortizationId: null,
                  }
                : {
                    loanAmortizationId: planned.primaryTargetId,
                    contributionId: null,
                  }
              : {}),
          },
        });
      }),
  );

  const recentPayments: DashboardRecentPayment[] = recent.map((p) => {
    const fallbackLabel =
      p.targetType === "CONTRIBUTION" && p.contribution
        ? formatKinsenaPeriodScope(
            p.contribution.dueDate,
            p.contribution.kinsenaIndex === 2 ? 2 : 1,
          )
        : p.targetType === "LOAN_AMORTIZATION" && p.loanAmortization
          ? `Installment #${p.loanAmortization.installmentNumber}`
          : p.targetType === "CONTRIBUTION"
            ? "Contributions"
            : "Loan repayments";

    const stored = parseAllocationSummary(p.allocationSummary);
    const fromLedger = p.ledgerEntries.map((e) => {
      const amt = formatPHP(e.amount.toString());
      const scope = e.description.replace(/\s·\sref\s+\S+$/i, "").trim();
      return `${amt} → ${scope}`;
    });
    const planned = recentPlanned.get(p.id) ?? [];
    const allocations =
      stored.length > 0
        ? stored
        : p.status === "PENDING_VERIFICATION"
          ? planned
          : p.status === "REJECTED"
            ? planned.length > 0
              ? planned
              : stored
            : fromLedger.length > 0
              ? fromLedger
              : planned;

    const label = formatPaymentScopeLabel(
      parseAllocationScopeLabels(allocations),
      fallbackLabel,
    );

    return {
      id: p.id,
      label,
      amount: Number(p.amount.toString()),
      status: mapPaymentSubmissionStatus(p.status),
      date: p.createdAt.toISOString(),
      allocations,
      canCancel: p.status === "PENDING_VERIFICATION",
    };
  });

  const totalContributions = new Decimal(
    contributionsAgg._sum.amount?.toString() ?? "0",
  );
  const yearEndFund = totalContributions
    .plus(interestEarnings)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const perHead =
    activeCycle?.contributionAmount?.toString() ??
    nextContribution?.cycle.contributionAmount?.toString();
  const kinsenasDue = calculateKinsenasDue(user.headsCount, perHead);

  return {
    userId: user.id,
    memberName: user.name,
    memberEmail: user.email ?? (user.username ? `@${user.username}` : "—"),
    headsCount: user.headsCount,
    memberStatus: user.status,
    prepaidCredit: Number(user.prepaidCredit?.toString() ?? "0"),
    kinsenasDue: Number(kinsenasDue.toFixed(2)),
    monthlyDue: Number(kinsenasDue.mul(2).toFixed(2)),
    totalContributions: Number(totalContributions.toFixed(2)),
    interestEarnings: Number(interestEarnings.toFixed(2)),
    yearEndFund: Number(yearEndFund.toFixed(2)),
    activeLoanBalance: Number(new Decimal(activeLoanBalance).toFixed(2)),
    nextKinsenas,
    nextAmortization,
    recentPayments,
    paymentTargets,
    kinsenasYearMap,
  };
}

export default async function MemberDashboardPage() {
  await connection();
  const user = await requirePageUser(undefined, "/dashboard");
  const data = await loadDashboard(user.id);
  return <MemberDashboardClient data={data} />;
}
