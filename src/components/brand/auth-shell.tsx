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
    <div className="mb-8 flex flex-col items-center text-center md:mb-10">
      <BbbMark size="xl" alt="BBB" />
      {showTagline ? (
        <p className="type-caption mt-3 max-w-[16rem]">{AUTH_TAGLINE}</p>
      ) : null}
      {title ? <h1 className="type-heading mt-5">{title}</h1> : null}
      {subtitle ? (
        <p className="type-body-sm type-muted mt-2 max-w-[22rem]">{subtitle}</p>
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

/** Centered auth column — light canvas, optional elevated panel for forms. */
export function AuthShell({
  children,
  title,
  subtitle,
  showBrand = true,
  panel = true,
}: AuthShellProps) {
  return (
    <div className="ui-auth-canvas flex min-h-dvh flex-col items-center justify-center px-[var(--page-pad-x)] py-10 sm:py-14 md:py-16">
      <a href="#auth-main" className="ui-skip-link">
        Skip to sign-in
      </a>
      <main
        id="auth-main"
        className="w-full max-w-[22rem] sm:max-w-sm md:max-w-md"
      >
        {showBrand ? (
          <AuthBrandHero title={title} subtitle={subtitle} />
        ) : null}
        {panel ? <div className="ui-auth-panel">{children}</div> : children}
      </main>
    </div>
  );
}
