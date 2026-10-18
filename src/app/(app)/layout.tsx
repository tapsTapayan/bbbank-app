import { connection } from "next/server";
import { displayLoginId } from "@/lib/auth/staff-identity";
import { getCurrentAppUser } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";

/** Request-time chrome — auth cookies / role nav. */
export const instant = false;

/**
 * Single authenticated chrome for every role.
 * Nav items are filtered by role so members, treasurers, auditors, and admins
 * share one shell and can move between fund and ops destinations without a UX swap.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth + shell are request-time (cookies / session); avoid prerender time reads.
  await connection();
  const auth = await getCurrentAppUser();

  if (!auth.ok) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[var(--surface)] type-body-sm type-muted">
        Checking access
      </div>
    );
  }

  return (
    <AppShell role={auth.user.role} loginId={displayLoginId(auth.user)}>
      {children}
    </AppShell>
  );
}
