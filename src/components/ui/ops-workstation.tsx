import { clsx } from "clsx";

type OpsWorkstationProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
  /** When false, children fill the root (split panes manage their own scroll). */
  padded?: boolean;
};

/**
 * Ops desk frame: fixed header toolbar + body.
 * Use padded for form/list desks; unpadded for multi-pane workstations.
 */
export function OpsWorkstation({
  title,
  description,
  actions,
  children,
  bodyClassName,
  padded = true,
}: OpsWorkstationProps) {
  return (
    <div className="ui-ops-root">
      <header className="ui-ops-header">
        <div className="min-w-0 flex-1">
          <h1 className="type-heading">{title}</h1>
          {description ? (
            <p className="type-body-sm type-muted mt-1 max-w-2xl">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </header>
      {padded ? (
        <div className={clsx("ui-ops-body", bodyClassName)}>{children}</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      )}
    </div>
  );
}
