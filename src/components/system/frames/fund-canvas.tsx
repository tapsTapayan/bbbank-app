import { clsx } from "clsx";

/** Padded fund reading canvas content wrapper. */
export function FundCanvas({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("rl-fund-frame", className)}>{children}</div>
  );
}
