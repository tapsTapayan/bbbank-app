import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/brand/auth-shell";
import { countAppUsers } from "@/lib/queries/users";
import { LoginForm } from "./login-form";

/** Prisma gating — request-time, not an instant-navigation shell. */
export const instant = false;

export default async function LoginPage() {
  const count = await countAppUsers();
  if (count === 0) {
    redirect("/setup");
  }

  return (
    <AuthShell showBrand={false} panel={false}>
      <Suspense
        fallback={
          <div className="ui-stack items-center text-center">
            <div className="mb-4">
              {/* Matches AuthBrandHero mark size for layout stability */}
              <span className="inline-block h-20 w-20 rounded-[var(--radius)] bg-[var(--border)]" />
            </div>
            <Loader2 className="h-5 w-5 animate-spin text-[var(--brand)]" />
            <p className="type-body-sm type-muted">Loading…</p>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
