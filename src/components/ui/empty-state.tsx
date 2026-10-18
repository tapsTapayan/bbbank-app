import { clsx } from "clsx";

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  variant?: "ops" | "fund";
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  variant = "ops",
}: EmptyStateProps) {
  if (variant === "ops") {
    return (
      <div className={clsx("rl-ops-empty", className)}>
        {icon ? <div className="rl-ops-empty-icon">{icon}</div> : null}
        <p className="type-title">{title}</p>
        {description ? (
          <p className="type-body-sm type-muted mt-1 max-w-sm">{description}</p>
        ) : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-[var(--border)] bg-[var(--surface-elevated)] px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-[var(--radius)] bg-[var(--brand-soft)] text-[var(--brand)]">
          {icon}
        </div>
      ) : null}
      <p className="type-title">{title}</p>
      {description ? (
        <p className="type-body-sm type-muted max-w-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
