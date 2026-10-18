import { clsx } from "clsx";
import {
  paymentStatusLabel,
  type PaymentPillStatus,
} from "@/lib/finance/status-labels";

const PILL_CLASS: Record<PaymentPillStatus, string> = {
  PENDING: "ui-pill-pending",
  VERIFIED: "ui-pill-verified",
  AUDITED: "ui-pill-audited",
  REJECTED: "ui-pill-rejected",
  FLAGGED: "ui-pill-flagged",
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
    <span className={clsx("ui-pill", PILL_CLASS[key], className)}>
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
    <span className={clsx("ui-pill", "ui-pill-neutral", className)}>
      {children}
    </span>
  );
}
