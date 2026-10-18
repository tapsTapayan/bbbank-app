import { clsx } from "clsx";
import { formatPHP } from "@/lib/finance/loan-calculator";

type MoneyProps = {
  amount: number | string;
  className?: string;
  /** Larger tabular metric style */
  metric?: boolean;
};

/** Tabular currency display — always ₱ via formatPHP. */
export function Money({ amount, className, metric = false }: MoneyProps) {
  const value =
    typeof amount === "number"
      ? formatPHP(amount)
      : formatPHP(Number(amount) || 0);

  return (
    <span
      className={clsx(
        "type-data tabular-nums min-w-0 max-w-full",
        metric ? "type-metric" : "type-body font-semibold tracking-tight",
        className,
      )}
    >
      {value}
    </span>
  );
}
