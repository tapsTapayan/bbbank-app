import { redirect } from "next/navigation";
import { AuthShell } from "@/components/brand/auth-shell";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { createClient } from "@/lib/supabase/server";

/** Auth session read — request-time, not an instant-navigation shell. */
export const instant = false;

export default async function AccountStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims?.sub) {
    redirect("/login");
  }

  const params = await searchParams;
  const inactive = params.reason === "inactive";
  const email =
    typeof data.claims.email === "string" ? data.claims.email : null;

  return (
    <AuthShell
      title={inactive ? "Account inactive" : "Account not provisioned"}
      subtitle={
        inactive
          ? "Your profile is inactive. Contact an admin to restore access."
          : "No active member profile is linked to this sign-in. Ask an admin to provision your account."
      }
    >
      <div className="ui-stack items-center">
        {email ? (
          <p className="type-caption text-center">
            Signed in as{" "}
            <span className="font-medium text-[var(--ink)]">{email}</span>
          </p>
        ) : null}
        <SignOutButton className="ui-btn ui-btn-primary ui-btn-block" />
        <p className="type-caption text-center">
          Sign out, then return with a provisioned account.
        </p>
      </div>
    </AuthShell>
  );
}
