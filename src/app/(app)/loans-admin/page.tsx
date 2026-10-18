import { requirePageUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  LoansAdminWorkspace,
  type LoanDeskRow,
} from "./loans-admin-workspace";

export const instant = false;

export default async function LoansAdminPage() {
  await requirePageUser(["TREASURER"], "/loans-admin");

  const rows = await prisma.loan.findMany({
    where: { status: { in: ["PENDING", "APPROVED"] } },
    orderBy: { createdAt: "asc" },
    include: {
      borrower: { select: { name: true, email: true, username: true } },
    },
  });

  const loans: LoanDeskRow[] = rows.map((loan) => ({
    id: loan.id,
    borrowerName: loan.borrower.name,
    borrowerEmail:
      loan.borrower.email ??
      (loan.borrower.username ? `@${loan.borrower.username}` : "—"),
    principalAmount: Number(loan.principalAmount.toString()),
    interestRate: Number(loan.interestRate.toString()),
    termMonths: loan.termMonths,
    repaymentFrequency: loan.repaymentFrequency,
    headsSnapshot: loan.headsSnapshot,
    status: loan.status,
    createdAt: loan.createdAt.toISOString(),
  }));

  return <LoansAdminWorkspace loans={loans} />;
}
