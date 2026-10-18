import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/session";

export const instant = false;

/** Placeholder — auditor ledger UI lands in a later phase. */
export default async function AuditPage() {
  const auth = await getCurrentAppUser();
  if (!auth.ok) redirect("/login?next=/audit");
  if (auth.user.role !== "AUDITOR" && auth.user.role !== "ADMIN") {
    redirect("/unauthorized");
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8 text-sm text-[var(--ink-muted)]">
      Auditor ledger — coming soon.
    </div>
  );
}
