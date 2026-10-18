import { clsx } from "clsx";
import {
  paymentStatusLabel,
  type PaymentPillStatus,
} from "@/lib/finance/status-labels";

const PILL_CLASS: Record<PaymentPillStatus, string> = {
  PENDING: "rl-pill-pending",
  VERIFIED: "rl-pill-verified",
  AUDITED: "rl-pill-audited",
  REJECTED: "rl-pill-rejected",
  FLAGGED: "rl-pill-flagged",
};

type StatusPillProps = {
  status: PaymentPillStatus | string;
  label?: string;
  className?: string;
};

export function StatusPill({ status, label, className }: StatusPillProps) {
  const key = (
    ["PENDING", "VERIFIED", "AUDITED", "REJECTED", "FLAGGED"].includes(status)
      ? status
      : "PENDING"
  ) as PaymentPillStatus;

  return (
    <span className={clsx("rl-pill", PILL_CLASS[key], className)}>
      {label ?? paymentStatusLabel(status)}
    </span>
  );
}

type NeutralPillProps = {
  children: React.ReactNode;
  className?: string;
};

export function NeutralPill({ children, className }: NeutralPillProps) {
  return (
    <span className={clsx("rl-pill", "rl-pill-neutral", className)}>
      {children}
    </span>
  );
}
