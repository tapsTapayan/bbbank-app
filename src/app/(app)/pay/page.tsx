import Link from "next/link";
import { requirePageUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { calculateKinsenasDue } from "@/lib/finance/cpe-policy";
import { getMemberPaymentTargets } from "@/lib/queries/member-payment-targets";
import { getMemberKinsenasYearMap } from "@/lib/queries/member-kinsenas-year";
import { PayForm } from "./pay-form";

export const instant = false;

export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<{ target?: string }>;
}) {
  const sessionUser = await requirePageUser(
    ["MEMBER", "TREASURER", "AUDITOR"],
    "/pay",
  );
  const params = await searchParams;
  const [user, targets, activeCycle, kinsenasYearMap] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: sessionUser.id },
      select: { id: true, headsCount: true, role: true },
    }),
    getMemberPaymentTargets(sessionUser.id),
    prisma.fundCycle.findFirst({
      where: { isActive: true },
      select: { id: true, name: true, contributionAmount: true },
    }),
    getMemberKinsenasYearMap(sessionUser.id),
  ]);

  const perHead = activeCycle?.contributionAmount?.toString();
  const kinsenasDue = Number(
    calculateKinsenasDue(user.headsCount, perHead).toFixed(2),
  );
  const monthlyDue = Number(
    calculateKinsenasDue(user.headsCount, perHead).mul(2).toFixed(2),
  );

  return (
    <PayForm
      userId={user.id}
      headsCount={user.headsCount}
      kinsenasDue={kinsenasDue}
      monthlyDue={monthlyDue}
      targets={targets}
      initialTargetId={params.target ?? null}
      kinsenasYearMap={kinsenasYearMap}
      setupHint={
        !activeCycle ? (
          <p className="type-caption mt-2 mx-auto max-w-sm">
            {user.role === "TREASURER" || user.role === "ADMIN" ? (
              <>
                No active cycle.{" "}
                <Link
                  href="/cycle"
                  className="font-medium text-[var(--brand)] underline"
                >
                  Start {new Date().getFullYear()}
                </Link>
              </>
            ) : (
              <>No active cycle — ask your treasurer.</>
            )}
          </p>
        ) : targets.length === 0 ? (
          <p className="type-caption mt-2 mx-auto max-w-sm">
            {user.role === "TREASURER" || user.role === "ADMIN" ? (
              <>
                Nothing open in {activeCycle.name}.{" "}
                <Link
                  href="/kinsenas"
                  className="font-medium text-[var(--brand)] underline"
                >
                  Open periods
                </Link>
              </>
            ) : (
              <>Nothing open — ask your treasurer.</>
            )}
          </p>
        ) : null
      }
    />
  );
}
