import { describe, expect, it } from "vitest";
import {
  formatPaymentScopeLabel,
  formatPaymentScopeTitle,
  parseAllocationScopeLabels,
} from "./payment-scope";

describe("payment scope labels", () => {
  it("dedupes ledger component lines into period scopes", () => {
    const scopes = parseAllocationScopeLabels([
      "₱120.00 → Late fee · Jan 1–15",
      "₱1,000.00 → Contribution · Jan 1–15",
      "₱1,000.00 → Jan 16–30",
      "₱50.00 → prepaid credit",
    ]);
    expect(scopes).toEqual(["Jan 1–15", "Jan 16–30"]);
  });

  it("formats multi-period titles", () => {
    expect(formatPaymentScopeTitle(["Jan 1–15"], "Payment")).toBe(
      "Jan 1–15 payment",
    );
    expect(
      formatPaymentScopeTitle(["Jan 1–15", "Jan 16–30"], "Payment"),
    ).toBe("Jan 1–15 → Jan 16–30 payment");
    expect(
      formatPaymentScopeLabel(
        ["Jan 1–15", "Jan 16–30", "Feb 1–15"],
        "Contributions",
      ),
    ).toBe("Jan 1–15 → Feb 1–15 · 3 periods");
  });
});
