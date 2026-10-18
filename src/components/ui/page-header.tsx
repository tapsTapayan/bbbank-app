import { clsx } from "clsx";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
};

/**
 * Fund page masthead — one row on desktop (title | actions),
 * stacked on mobile. Keeps rhythm consistent across fund surfaces.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={clsx(
        "flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="type-label">{eyebrow}</p> : null}
        <h1 className={clsx("type-heading", eyebrow && "mt-1")}>{title}</h1>
        {description ? (
          <p className="type-body-sm type-muted mt-1.5 max-w-2xl">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
