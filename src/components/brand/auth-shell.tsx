import { ShieldCheck, Lock, Landmark } from "lucide-react";
import { BbbMark } from "./bbb-mark";

export const AUTH_TAGLINE = "CPE Department Sinking-fund System";

export function AuthBrandHero({
  title,
  subtitle,
  showTagline = true,
}: {
  title?: string;
  subtitle?: string;
  showTagline?: boolean;
}) {
  return (
    <div className="mb-6 flex flex-col items-center text-center lg:items-start lg:text-left">
      <div className="flex items-center gap-3 lg:hidden">
        <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-card)] border border-[var(--border)] bg-white shadow-sm">
          <BbbMark size="md" alt="BBB" />
        </div>
        <div className="text-left">
          <p className="text-base font-bold tracking-tight text-[var(--ink)]">
            BBB Ledger
          </p>
          {showTagline ? (
            <p className="text-xs font-medium text-[var(--ink-muted)]">
              {AUTH_TAGLINE}
            </p>
          ) : null}
        </div>
      </div>

      {title ? <h1 className="type-display mt-5 lg:mt-0">{title}</h1> : null}
      {subtitle ? (
        <p className="type-body-sm type-muted mt-1.5 max-w-[24rem]">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

type AuthShellProps = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  showBrand?: boolean;
  panel?: boolean;
};

/**
 * Sovereign Institutional Auth Shell
 * - Mobile/Tablet: Centered elevated vault card
 * - Desktop (≥1024px): Split 2-column institutional showcase (Left: Sovereign Midnight Vault Showcase, Right: Interactive Auth Surface)
 */
export function AuthShell({
  children,
  title,
  subtitle,
  showBrand = true,
  panel = true,
}: AuthShellProps) {
  return (
    <div className="rl-auth-canvas flex min-h-dvh w-full">
      <a href="#auth-main" className="rl-skip-link">
        Skip to sign-in
      </a>

      {/* Desktop Left Showcase Column */}
      <aside
        className="hidden w-[44%] max-w-[36rem] shrink-0 flex-col justify-between p-12 text-white lg:flex"
        style={{ background: "var(--surface-vault)" }}
        aria-label="BBB Institutional Overview"
      >
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-card)] bg-white shadow-md">
            <BbbMark size="md" alt="BBB" />
          </div>
          <div>
            <p className="text-lg font-bold tracking-tight text-white">
              BBB Ledger
            </p>
            <p className="text-xs font-medium text-white/70">{AUTH_TAGLINE}</p>
          </div>
        </div>

        <div className="my-auto space-y-6 py-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/90">
            <Landmark className="h-3.5 w-3.5" aria-hidden />
            Sovereign Sinking Fund
          </span>
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-white xl:text-4xl">
            Precision treasury, transparent contributions, and instant ledger verification.
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-white/75">
            Engineered for the CPE Department with append-only double-entry accounting, automated kinsenas schedules, and maker-checker-auditor governance.
          </p>

          <dl className="grid grid-cols-2 gap-4 pt-4">
            <div className="rounded-[var(--radius-card)] border border-white/12 bg-white/[0.06] p-4">
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/70">
                <ShieldCheck className="h-4 w-4 text-white" aria-hidden />
                Maker-Checker
              </dt>
              <dd className="mt-1.5 text-xs leading-relaxed text-white/85">
                Every contribution and loan payment is verified with receipt proof and audited into an immutable ledger.
              </dd>
            </div>
            <div className="rounded-[var(--radius-card)] border border-white/12 bg-white/[0.06] p-4">
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/70">
                <Lock className="h-4 w-4 text-white" aria-hidden />
                Device PIN Unlock
              </dt>
              <dd className="mt-1.5 text-xs leading-relaxed text-white/85">
                Fast, hardware-bound 6-digit PIN access for remembered accounts across mobile and desktop.
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 pt-6 text-xs text-white/55">
          <span>CPE Department Sinking-Fund System</span>
          <span className="font-mono">PHP (₱) · Exact Decimal Ledger</span>
        </div>
      </aside>

      {/* Right Interactive Auth Column */}
      <div className="flex flex-1 flex-col items-center justify-center px-[var(--page-pad-x)] py-10 sm:py-14">
        <main
          id="auth-main"
          className="w-full max-w-[25rem]"
        >
          {showBrand ? (
            <AuthBrandHero title={title} subtitle={subtitle} />
          ) : null}
          {panel ? <div className="rl-auth-panel">{children}</div> : children}
        </main>
      </div>
    </div>
  );
}
