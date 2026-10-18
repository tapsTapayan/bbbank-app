import { Decimal } from "decimal.js";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { remainingDues } from "@/lib/finance/loan-calculator";
import { getMemberPaymentTargets } from "@/lib/queries/member-payment-targets";
import {
  MemberDashboardClient,
  type DashboardRecentPayment,
  type MemberDashboardData,
} from "./dashboard-client";

/** Auth + live Prisma reads — request-time, not instant-navigation shell. */
export const instant = false;

function mapStatus(
  status: string,
): DashboardRecentPayment["status"] {
  switch (status) {
    case "PENDING_VERIFICATION":
      return "PENDING";
    case "VERIFIED":
      return "VERIFIED";
    case "AUDITED":
      return "AUDITED";
    case "REJECTED":
    case "FLAGGED":
      return "REJECTED";
    default:
      return "PENDING";
  }
}

async function loadDashboard(userId: string): Promise<MemberDashboardData> {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [user, equityAgg, activeLoan, recent, paymentTargets] =
    await Promise.all([
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
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.paymentSubmission.findMany({
        where: { userId, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          contribution: { select: { periodMonth: true } },
          loanAmortization: { select: { installmentNumber: true } },
        },
      }),
      getMemberPaymentTargets(userId),
    ]);

  let activeLoanBalance = 0;
  let nextAmortization: MemberDashboardData["nextAmortization"] = null;

  if (activeLoan) {
    activeLoanBalance = activeLoan.amortizations.reduce((sum, a) => {
      const dues = remainingDues({
        penaltyAmount: a.penaltyAmount.toString(),
        interestComponent: a.interestComponent.toString(),
        principalComponent: a.principalComponent.toString(),
        amountPaid: a.amountPaid.toString(),
      });
      return sum + Number(dues.totalDue.toString());
    }, 0);

    const next = activeLoan.amortizations[0];
    if (next) {
      const dues = remainingDues({
        penaltyAmount: next.penaltyAmount.toString(),
        interestComponent: next.interestComponent.toString(),
        principalComponent: next.principalComponent.toString(),
        amountPaid: next.amountPaid.toString(),
      });
      nextAmortization = {
        installmentNumber: next.installmentNumber,
        dueDate: next.dueDate.toISOString(),
        amountDue: Number(dues.totalDue.toString()),
        loanLabel: `Loan · ${activeLoan.id.slice(-6).toUpperCase()}`,
      };
    }
  }

  const recentPayments: DashboardRecentPayment[] = recent.map((p) => {
    let label = "Payment";
    if (p.targetType === "CONTRIBUTION" && p.contribution) {
      label = `${p.contribution.periodMonth.toLocaleDateString("en-PH", {
        month: "short",
      })} contribution`;
    } else if (p.targetType === "LOAN_AMORTIZATION" && p.loanAmortization) {
      label = `Loan installment #${p.loanAmortization.installmentNumber}`;
    }
    return {
      id: p.id,
      label,
      amount: Number(p.amount.toString()),
      status: mapStatus(p.status),
      date: p.createdAt.toISOString(),
    };
  });

  const equity = new Decimal(equityAgg._sum.amount?.toString() ?? "0");

  return {
    userId: user.id,
    memberName: user.name,
    memberEmail: user.email,
    totalEquity: Number(equity.toFixed(2)),
    activeLoanBalance: Number(new Decimal(activeLoanBalance).toFixed(2)),
    nextAmortization,
    recentPayments,
    paymentTargets,
  };
}

export default async function MemberDashboardPage() {
  const auth = await getCurrentAppUser();
  if (!auth.ok) {
    redirect(`/login?next=${encodeURIComponent("/dashboard")}`);
  }

  const data = await loadDashboard(auth.user.id);
  return <MemberDashboardClient data={data} />;
}
