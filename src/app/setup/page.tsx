import { redirect } from "next/navigation";
import { AuthShell } from "@/components/brand/auth-shell";
import { countAppUsers } from "@/lib/queries/users";
import { SetupForm } from "./setup-form";

/** Prisma gating — request-time, not an instant-navigation shell. */
export const instant = false;

export default async function SetupPage() {
  const count = await countAppUsers();
  if (count > 0) {
    redirect("/login");
  }

  return (
    <AuthShell showBrand={false} panel={false}>
      <SetupForm />
    </AuthShell>
  );
}
