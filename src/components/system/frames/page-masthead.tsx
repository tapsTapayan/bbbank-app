import { clsx } from "clsx";

type PageMastheadProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
};

/** Fund-page masthead — structured header with eyebrow, title, subtitle, and actions. */
export function PageMasthead({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageMastheadProps) {
  return (
    <header className={clsx("rl-masthead", className)}>
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="type-label mb-1.5">{eyebrow}</p> : null}
        <h1 className="type-display">{title}</h1>
        {description ? (
          <p className="type-body-sm type-muted mt-1.5 max-w-2xl">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
