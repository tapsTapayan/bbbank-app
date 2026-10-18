import { requirePageUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  computeLiveLateFee,
  effectivePenaltyAmount,
  GRACE_PERIOD_DAYS,
} from "@/lib/finance/cpe-policy";
import {
  PassesWorkspace,
  type PassHistoryRow,
  type PassTargetRow,
} from "./passes-workspace";

export const instant = false;

export default async function PassesPage() {
  await requirePageUser(["TREASURER", "AUDITOR"], "/passes");
  const now = new Date();

  const [contributions, amortizations, waivers] = await Promise.all([
    prisma.contribution.findMany({
      where: {
        status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
        penaltyAccrualFrozen: false,
      },
      orderBy: { dueDate: "asc" },
      include: {
        user: { select: { name: true } },
        cycle: { select: { gracePeriodDays: true, penaltyRate: true } },
        paymentSubmissions: {
          where: { status: { in: ["PENDING_VERIFICATION", "REJECTED"] } },
          orderBy: { createdAt: "asc" },
          select: { status: true, createdAt: true, verifiedAt: true },
        },
      },
    }),
    prisma.loanAmortization.findMany({
      where: {
        status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
        penaltyAccrualFrozen: false,
      },
      orderBy: { dueDate: "asc" },
      include: {
        loan: {
          include: {
            borrower: { select: { name: true } },
            cycle: { select: { gracePeriodDays: true, penaltyRate: true } },
          },
        },
        paymentSubmissions: {
          where: { status: { in: ["PENDING_VERIFICATION", "REJECTED"] } },
          orderBy: { createdAt: "asc" },
          select: { status: true, createdAt: true, verifiedAt: true },
        },
      },
    }),
    prisma.penaltyWaiver.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        issuedBy: { select: { name: true } },
        contribution: {
          select: {
            kinsenaIndex: true,
            periodMonth: true,
            user: { select: { name: true } },
          },
        },
        loanAmortization: {
          select: {
            installmentNumber: true,
            loan: { select: { borrower: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);

  const contributionTargets: PassTargetRow[] = [];
  for (const c of contributions) {
    let pendingSubmittedAt: Date | null = null;
    const rejectedWindows: Array<{ submittedAt: Date; rejectedAt: Date }> = [];
    for (const sub of c.paymentSubmissions) {
      if (sub.status === "PENDING_VERIFICATION") {
        pendingSubmittedAt ??= sub.createdAt;
      } else if (sub.status === "REJECTED" && sub.verifiedAt) {
        rejectedWindows.push({
          submittedAt: sub.createdAt,
          rejectedAt: sub.verifiedAt,
        });
      }
    }
    const fee = computeLiveLateFee({
      dueDate: c.dueDate,
      openedAt: c.createdAt,
      headsCount: c.headsSnapshot,
      now,
      gracePeriodDays: c.cycle.gracePeriodDays ?? GRACE_PERIOD_DAYS,
      ratePerHeadPerDay: c.cycle.penaltyRate.toString(),
      pendingSubmittedAt,
      rejectedWindows,
    });
    const penalty = Number(
      effectivePenaltyAmount(
        fee.penaltyAmount,
        c.penaltyWaivedAmount?.toString() ?? "0",
      ).toFixed(2),
    );
    if (penalty <= 0) continue;
    contributionTargets.push({
      targetType: "CONTRIBUTION",
      targetId: c.id,
      memberName: c.user.name,
      label: `${c.periodMonth.toLocaleDateString("en-PH", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })} ${c.kinsenaIndex === 1 ? "15th" : "30th"} contribution`,
      penaltyAmount: penalty,
      dueDate: c.dueDate.toISOString(),
    });
  }

  const amortizationTargets: PassTargetRow[] = [];
  for (const a of amortizations) {
    let pendingSubmittedAt: Date | null = null;
    const rejectedWindows: Array<{ submittedAt: Date; rejectedAt: Date }> = [];
    for (const sub of a.paymentSubmissions) {
      if (sub.status === "PENDING_VERIFICATION") {
        pendingSubmittedAt ??= sub.createdAt;
      } else if (sub.status === "REJECTED" && sub.verifiedAt) {
        rejectedWindows.push({
          submittedAt: sub.createdAt,
          rejectedAt: sub.verifiedAt,
        });
      }
    }
    const heads = a.headsSnapshot || a.loan.headsSnapshot;
    const fee = computeLiveLateFee({
      dueDate: a.dueDate,
      openedAt: a.createdAt,
      headsCount: heads,
      now,
      gracePeriodDays: a.loan.cycle.gracePeriodDays ?? GRACE_PERIOD_DAYS,
      ratePerHeadPerDay: a.loan.cycle.penaltyRate.toString(),
      pendingSubmittedAt,
      rejectedWindows,
    });
    const penalty = Number(
      effectivePenaltyAmount(
        fee.penaltyAmount,
        a.penaltyWaivedAmount?.toString() ?? "0",
      ).toFixed(2),
    );
    if (penalty <= 0) continue;
    amortizationTargets.push({
      targetType: "LOAN_AMORTIZATION",
      targetId: a.id,
      memberName: a.loan.borrower.name,
      label: `Loan installment #${a.installmentNumber}`,
      penaltyAmount: penalty,
      dueDate: a.dueDate.toISOString(),
    });
  }

  const targets: PassTargetRow[] = [
    ...contributionTargets,
    ...amortizationTargets,
  ];

  const history: PassHistoryRow[] = waivers.map((w) => ({
    id: w.id,
    batchId: w.batchId,
    memberName:
      w.contribution?.user.name ??
      w.loanAmortization?.loan.borrower.name ??
      "—",
    label: w.contribution
      ? `${w.contribution.periodMonth.toLocaleDateString("en-PH", {
          month: "short",
          timeZone: "UTC",
        })} ${w.contribution.kinsenaIndex === 1 ? "15th" : "30th"}`
      : `Installment #${w.loanAmortization?.installmentNumber ?? "?"}`,
    amountWaived: Number(w.amountWaived.toString()),
    reason: w.reason,
    scope: w.scope,
    issuedBy: w.issuedBy.name,
    createdAt: w.createdAt.toISOString(),
  }));

  return <PassesWorkspace targets={targets} history={history} />;
}
