import Link from "next/link";
import { AuthShell } from "@/components/brand/auth-shell";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { roleHome } from "@/lib/auth/routes";
import { getCurrentAppUser } from "@/lib/auth/session";

export default async function UnauthorizedPage() {
  const auth = await getCurrentAppUser();
  const homeHref = auth.ok ? roleHome(auth.user.role) : "/login";

  return (
    <AuthShell
      title="Access denied"
      subtitle="Your role cannot open this area."
    >
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
        <Link href={homeHref} className="ui-btn ui-btn-primary">
          Go home
        </Link>
        <SignOutButton className="ui-btn ui-btn-secondary" />
      </div>
    </AuthShell>
  );
}
