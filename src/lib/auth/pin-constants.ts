/** Shared PIN rules (safe for client + server). */
export const PIN_LENGTH = 6;
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCKOUT_MS = 15 * 60 * 1000;

/** 6-digit numeric PIN. */
export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}
