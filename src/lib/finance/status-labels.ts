/** Human-facing labels for payment / obligation statuses. */

export type PaymentPillStatus =
  | "PENDING"
  | "VERIFIED"
  | "AUDITED"
  | "REJECTED"
  | "FLAGGED";

export function mapPaymentSubmissionStatus(
  status: string,
): PaymentPillStatus {
  switch (status) {
    case "PENDING_VERIFICATION":
      return "PENDING";
    case "VERIFIED":
      return "VERIFIED";
    case "AUDITED":
      return "AUDITED";
    case "FLAGGED":
      return "FLAGGED";
    case "REJECTED":
      return "REJECTED";
    default:
      return "PENDING";
  }
}

export function paymentStatusLabel(status: PaymentPillStatus | string): string {
  switch (status) {
    case "PENDING":
      return "Pending";
    case "VERIFIED":
      return "Verified";
    case "AUDITED":
      return "Audited";
    case "FLAGGED":
      return "Flagged";
    case "REJECTED":
      return "Rejected";
    default:
      return status.replaceAll("_", " ");
  }
}

export function limitedByLabel(
  limitedBy: "POLICY" | "CASH" | "BOTH" | string,
): string {
  switch (limitedBy) {
    case "POLICY":
      return "Policy cap";
    case "CASH":
      return "Available cash";
    case "BOTH":
      return "Policy & cash";
    default:
      return limitedBy;
  }
}

export function formatUtcDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatUtcDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
