"use server";

import {
  hashPin,
  isValidPin,
  verifyPin,
} from "@/lib/auth/device-credentials";
import { getCurrentAppUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export type PinStatusResult =
  | { ok: true; hasPin: boolean }
  | { ok: false; error: string };

export type PinUpdateResult = { ok: true } | { ok: false; error: string };

/** Whether the signed-in user already has an account PIN. */
export async function getUserPinStatus(): Promise<PinStatusResult> {
  try {
    const auth = await getCurrentAppUser();
    if (!auth.ok) return { ok: false, error: auth.error };
    return { ok: true, hasPin: Boolean(auth.user.pinHash) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not check PIN status.",
    };
  }
}

/**
 * Set or change the account PIN (once per user; reused on every remembered device).
 * Creating a first PIN needs no current PIN. Changing requires the current PIN.
 */
export async function setUserPin(input: {
  pin: string;
  currentPin?: string | null;
}): Promise<PinUpdateResult> {
  try {
    const auth = await getCurrentAppUser();
    if (!auth.ok) return { ok: false, error: auth.error };

    const pin = input.pin.trim();
    if (!isValidPin(pin)) {
      return { ok: false, error: "PIN must be exactly 6 digits." };
    }

    if (auth.user.pinHash) {
      const current = input.currentPin?.trim() ?? "";
      if (!isValidPin(current) || !verifyPin(current, auth.user.pinHash)) {
        return { ok: false, error: "Current PIN is incorrect." };
      }
    }

    await prisma.user.update({
      where: { id: auth.user.id },
      data: { pinHash: hashPin(pin) },
    });

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not save PIN.",
    };
  }
}

/** Remove the account PIN. Requires the current PIN. */
export async function clearUserPin(input: {
  currentPin: string;
}): Promise<PinUpdateResult> {
  try {
    const auth = await getCurrentAppUser();
    if (!auth.ok) return { ok: false, error: auth.error };
    if (!auth.user.pinHash) {
      return { ok: false, error: "No PIN is set on this account." };
    }
    const current = input.currentPin.trim();
    if (!isValidPin(current) || !verifyPin(current, auth.user.pinHash)) {
      return { ok: false, error: "Current PIN is incorrect." };
    }

    await prisma.user.update({
      where: { id: auth.user.id },
      data: { pinHash: null },
    });

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not remove PIN.",
    };
  }
}
