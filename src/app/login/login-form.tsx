"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }
      router.replace(next);
      router.refresh();
    });
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand)] text-sm font-bold text-white">
          BB
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)]">
          Sign in to BBBank
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Supabase Auth session for members and staff
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] p-5 shadow-sm"
      >
        <label className="block text-xs font-medium text-[var(--ink-muted)]">
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)]"
          />
        </label>
        <label className="block text-xs font-medium text-[var(--ink-muted)]">
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)]"
          />
        </label>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-[var(--ink-muted)]">
        <Link href="/" className="text-[var(--brand)] hover:underline">
          Back to home
        </Link>
      </p>
    </div>
  );
}
