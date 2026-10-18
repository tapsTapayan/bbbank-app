import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--surface)] px-6 py-12">
      <Suspense
        fallback={
          <p className="text-sm text-[var(--ink-muted)]">Loading sign-in…</p>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
