import { Decimal } from "decimal.js";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

function normalizeRef(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, "");
}

export type AiMatchStatus =
  | { kind: "none" }
  | { kind: "match" }
  | {
      kind: "override";
      aiAmount: string | null;
      aiRefNo: string | null;
      submittedAmount: string;
      submittedRefNo: string;
    };

/**
 * Compare member-submitted amount/ref against AI OCR originals.
 * Exact match → green badge; any drift → amber manual override.
 */
export function evaluateAiMatch(params: {
  amount: Decimal.Value;
  referenceNumber: string;
  aiExtractedAmount: Decimal.Value | null | undefined;
  aiExtractedRefNo: string | null | undefined;
}): AiMatchStatus {
  const { aiExtractedAmount, aiExtractedRefNo } = params;
  if (aiExtractedAmount == null && !aiExtractedRefNo) {
    return { kind: "none" };
  }

  const submittedAmount = new Decimal(params.amount).toFixed(2);
  const submittedRef = normalizeRef(params.referenceNumber);

  const aiAmount =
    aiExtractedAmount != null
      ? new Decimal(aiExtractedAmount.toString()).toFixed(2)
      : null;
  const aiRef = aiExtractedRefNo ? normalizeRef(aiExtractedRefNo) : null;

  const amountOk = aiAmount === null || aiAmount === submittedAmount;
  const refOk = aiRef === null || aiRef === submittedRef;

  if (amountOk && refOk && (aiAmount !== null || aiRef !== null)) {
    // Both present fields match; require at least one AI field to claim "match"
    if (aiAmount !== null && aiRef !== null) {
      return { kind: "match" };
    }
    // Partial OCR (only one field) that matches → still treat as match for that field
    return { kind: "match" };
  }

  return {
    kind: "override",
    aiAmount,
    aiRefNo: aiRef,
    submittedAmount,
    submittedRefNo: submittedRef,
  };
}
