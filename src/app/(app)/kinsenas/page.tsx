import { requirePageUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  currentKinsenaPeriod,
  nextKinsenaPeriod,
} from "@/lib/finance/contribution-generator";
import { getKinsenaDueDate } from "@/lib/finance/cpe-policy";
import { KinsenasWorkspace } from "./kinsenas-workspace";

export const instant = false;

function labelFor(year: number, monthIndex: number, kinsenaIndex: 1 | 2) {
  const due = getKinsenaDueDate(year, monthIndex, kinsenaIndex);
  return due.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function KinsenasPage() {
  await requirePageUser(["TREASURER", "ADMIN"], "/kinsenas");

  const cycle = await prisma.fundCycle.findFirst({
    where: { isActive: true },
    select: { name: true },
  });

  const current = currentKinsenaPeriod();
  const next = nextKinsenaPeriod();

  return (
    <KinsenasWorkspace
      cycleName={cycle?.name ?? null}
      previewCurrent={{
        ...current,
        label: labelFor(current.year, current.monthIndex, current.kinsenaIndex),
      }}
      previewNext={{
        ...next,
        label: labelFor(next.year, next.monthIndex, next.kinsenaIndex),
      }}
    />
  );
}
