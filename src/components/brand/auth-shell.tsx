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
        <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-white">
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
          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] bg-white">
            <BbbMark size="md" alt="BBB" />
          </div>
          <div>
            <p className="text-base font-semibold tracking-tight text-white">
              BBB Ledger
            </p>
            <p className="text-xs font-medium text-white/70">{AUTH_TAGLINE}</p>
          </div>
        </div>

        <div className="my-auto space-y-3 py-10">
          <h2 className="type-display text-white">
            CPE sinking fund
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-white/75">
            Kinsenas contributions, loan repayments, and treasurer verification in one ledger.
          </p>
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
