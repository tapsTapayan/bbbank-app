import Link from "next/link";
import { Smartphone, Monitor } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-[var(--surface)] px-6 py-16">
      <div className="mb-10 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand)] text-lg font-bold text-white shadow-lg shadow-[var(--brand)]/20">
          BB
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--ink)]">
          BBBank
        </h1>
        <p className="mt-2 max-w-md text-sm text-[var(--ink-muted)]">
          Sign in to open the member PWA or treasurer verification console.
        </p>
      </div>

      <div className="grid w-full max-w-xl gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard"
          className="group rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6 shadow-sm transition hover:border-[var(--brand)]/40 hover:shadow-md"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
            <Smartphone className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-[var(--ink)] group-hover:text-[var(--brand)]">
            Member Mobile
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Equity, loans, and proof-of-payment uploads for members.
          </p>
          <p className="mt-4 text-xs font-medium text-[var(--brand)]">
            Open /dashboard →
          </p>
        </Link>

        <Link
          href="/verify"
          className="group rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6 shadow-sm transition hover:border-[var(--brand)]/40 hover:shadow-md"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
            <Monitor className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-[var(--ink)] group-hover:text-[var(--brand)]">
            Management Console
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Treasurer split-screen verification queue with receipt zoom/pan.
          </p>
          <p className="mt-4 text-xs font-medium text-[var(--brand)]">
            Open /verify →
          </p>
        </Link>
      </div>
    </div>
  );
}
