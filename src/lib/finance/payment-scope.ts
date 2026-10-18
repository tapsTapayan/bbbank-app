/**
 * Period-scope labels for payment history / recent payments from
 * allocationSummary (or ledger-derived) waterfall lines.
 */

/** Pull unique period labels from `₱amt → label` allocation lines, order preserved. */
export function parseAllocationScopeLabels(lines: readonly string[]): string[] {
  const scopes: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const arrow = line.indexOf("→");
    if (arrow < 0) continue;
    let label = line.slice(arrow + 1).trim();
    if (!label || /^prepaid\b/i.test(label)) continue;

    label = label
      .replace(/^Late fee\s*·\s*/i, "")
      .replace(/^Contribution\s*·\s*/i, "")
      .replace(/^Interest\s*·\s*/i, "")
      .replace(/^Principal\s*·\s*/i, "")
      .replace(/^Penalty\s*·\s*/i, "")
      .replace(/^Loan\s+/i, "Loan ")
      .trim();

    if (!label || seen.has(label)) continue;
    seen.add(label);
    scopes.push(label);
  }

  return scopes;
}

/** Compact scope for list rows, e.g. "Jan 1–15 → Mar 1–15 · 5 periods". */
export function formatPaymentScopeLabel(
  scopes: readonly string[],
  fallback: string,
): string {
  if (scopes.length === 0) return fallback;
  if (scopes.length === 1) return scopes[0]!;
  if (scopes.length === 2) return `${scopes[0]} → ${scopes[1]}`;
  return `${scopes[0]} → ${scopes[scopes.length - 1]} · ${scopes.length} periods`;
}

/** Card / modal title, e.g. "Jan 1–15 payment". */
export function formatPaymentScopeTitle(
  scopes: readonly string[],
  fallback: string,
): string {
  if (scopes.length === 0) return fallback;
  if (scopes.length === 1) return `${scopes[0]} payment`;
  if (scopes.length === 2) return `${scopes[0]} → ${scopes[1]} payment`;
  return `${scopes[0]} → ${scopes[scopes.length - 1]} · ${scopes.length} periods`;
}

export function parseAllocationSummary(
  summary: string | null | undefined,
): string[] {
  if (!summary?.trim()) return [];
  return summary
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
