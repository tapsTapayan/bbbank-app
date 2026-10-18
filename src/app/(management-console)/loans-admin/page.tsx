import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/session";

export const instant = false;

/** Placeholder — loan approval UI lands in a later phase. */
export default async function LoansAdminPage() {
  const auth = await getCurrentAppUser();
  if (!auth.ok) redirect("/login?next=/loans-admin");
  if (auth.user.role !== "TREASURER" && auth.user.role !== "ADMIN") {
    redirect("/unauthorized");
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8 text-sm text-[var(--ink-muted)]">
      Loan approval &amp; disbursement console — coming soon.
    </div>
  );
}
