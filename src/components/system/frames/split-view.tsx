import { clsx } from "clsx";

type SplitViewProps = {
  children: React.ReactNode;
  variant?: "dual" | "triple";
  className?: string;
};

/** Shared ops list/detail (and receipt) split. */
export function SplitView({
  children,
  variant = "dual",
  className,
}: SplitViewProps) {
  return (
    <div
      className={clsx(
        "rl-ops-split",
        variant === "triple" ? "rl-ops-split--triple" : "rl-ops-split--dual",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SplitPane({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={clsx("rl-ops-pane", className)}>{children}</div>;
}
