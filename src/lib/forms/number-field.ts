/**
 * Controlled number inputs must allow "" while editing.
 * Coercing with `Number(v) || fallback` on every keystroke makes
 * the field impossible to fully backspace.
 */

export type NumberFieldValue = number | "";

/** Parse a raw input string into a number or empty (while typing). */
export function numberFieldValue(raw: string): NumberFieldValue {
  if (raw.trim() === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : "";
}

/** Resolve empty/invalid to a clamped number for submit or blur. */
export function resolveNumberField(
  value: NumberFieldValue,
  fallback: number,
  opts?: { min?: number; max?: number; integer?: boolean },
): number {
  let n =
    value === "" || !Number.isFinite(value) ? fallback : Number(value);
  if (opts?.integer) n = Math.trunc(n);
  if (opts?.min !== undefined) n = Math.max(opts.min, n);
  if (opts?.max !== undefined) n = Math.min(opts.max, n);
  return n;
}
