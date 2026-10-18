import { requirePageUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { CycleSettings, type CycleFormValues } from "./cycle-settings";

export const instant = false;

function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function CyclePage() {
  await requirePageUser(["ADMIN"], "/cycle");

  const cycles = await prisma.fundCycle.findMany({
    orderBy: { createdAt: "desc" },
  });
  const active = cycles.find((c) => c.isActive) ?? cycles[0] ?? null;

  const year = new Date().getFullYear();
  const initial: CycleFormValues = active
    ? {
        id: active.id,
        name: active.name,
        contributionAmount: active.contributionAmount.toFixed(2),
        loanInterestRate: active.loanInterestRate.toString(),
        penaltyRate: active.penaltyRate.toFixed(2),
        gracePeriodDays: active.gracePeriodDays,
        maxLoanablePoolRatio: active.maxLoanablePoolRatio.toString(),
        loanTermMonths: active.loanTermMonths,
        startDate: toDateInput(active.startDate),
        endDate: toDateInput(active.endDate),
        isActive: active.isActive,
      }
    : {
        name: `CPE ${year}`,
        contributionAmount: "250.00",
        loanInterestRate: "0.10",
        penaltyRate: "10.00",
        gracePeriodDays: 2,
        maxLoanablePoolRatio: "0.50",
        loanTermMonths: 2,
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
        isActive: false,
      };

  return (
    <CycleSettings
      initial={initial}
      currentYear={year}
      cycles={cycles.map((c) => ({
        id: c.id,
        name: c.name,
        isActive: c.isActive,
      }))}
    />
  );
}
