import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { PIN_LOCKOUT_MS } from "@/lib/auth/pin-constants";

export {
  isValidPin,
  MAX_PIN_ATTEMPTS,
  PIN_LENGTH,
  PIN_LOCKOUT_MS,
} from "@/lib/auth/pin-constants";

const SCRYPT_KEYLEN = 64;

/** Opaque device token (hex) stored only on the client. */
export function generateDeviceToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Scrypt PIN hash: `saltHex:hashHex`.
 * Salt is random per credential so identical PINs do not share digests.
 */
export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(pin, salt, SCRYPT_KEYLEN);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPin(pin: string, pinHash: string): boolean {
  const [saltHex, hashHex] = pinHash.split(":");
  if (!saltHex || !hashHex) return false;

  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(pin, salt, expected.length);
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function isCredentialLocked(
  lockedUntil: Date | null | undefined,
): boolean {
  if (!lockedUntil) return false;
  return lockedUntil.getTime() > Date.now();
}

export function nextLockoutUntil(): Date {
  return new Date(Date.now() + PIN_LOCKOUT_MS);
}
