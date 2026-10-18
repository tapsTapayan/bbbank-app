import { clsx } from "clsx";

type OpsStageProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
  /** When false, children fill the root (split panes manage their own scroll). */
  padded?: boolean;
};

/** Full-bleed ops workstation: command header + body. */
export function OpsStage({
  title,
  description,
  actions,
  children,
  bodyClassName,
  padded = true,
}: OpsStageProps) {
  return (
    <div className="rl-ops-root">
      <header className="rl-ops-header">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            <h1 className="type-heading">{title}</h1>
            {description ? (
              <p className="type-caption truncate">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </header>
      {padded ? (
        <div className={clsx("rl-ops-body", bodyClassName)}>{children}</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      )}
    </div>
  );
}
