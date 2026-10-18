"use server";

import { redirect } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import {
  generateDeviceToken,
  hashDeviceToken,
  hashPin,
  isCredentialLocked,
  isValidPin,
  MAX_PIN_ATTEMPTS,
  nextLockoutUntil,
  verifyPin,
} from "@/lib/auth/device-credentials";
import { resolvePostLoginRedirect } from "@/lib/auth/routes";
import { getCurrentAppUser } from "@/lib/auth/session";
import {
  displayLoginId,
  usernameToStaffEmail,
} from "@/lib/auth/staff-identity";
import { syncJwtRoleFromPrisma } from "@/lib/auth/sync-jwt-role";
import { prisma } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type CompleteSignInResult =
  | {
      ok: true;
      redirectTo: string;
      synced: boolean;
      userId: string;
      name: string;
      loginId: string;
      role: UserRole;
    }
  | {
      ok: false;
      error: string;
      reason?: "unauthenticated" | "unprovisioned" | "inactive";
      redirectTo?: string;
    };

export type RegisterRememberedDeviceResult =
  | {
      ok: true;
      deviceCredentialId: string;
      deviceToken: string;
      userId: string;
      name: string;
      loginId: string;
      role: UserRole;
      hasPin: boolean;
    }
  | { ok: false; error: string };

export type UnlockWithPinResult =
  | CompleteSignInResult
  | { ok: false; error: string; locked?: boolean };

export type RevokeRememberedDeviceResult =
  | { ok: true }
  | { ok: false; error: string };

export type ProfileUpdateResult = { ok: true } | { ok: false; error: string };

const MIN_PASSWORD_LENGTH = 8;

/**
 * After client password sign-in: sync Prisma role → JWT, return safe redirect.
 */
export async function completeSignIn(
  next?: string | null,
): Promise<CompleteSignInResult> {
  try {
    const synced = await syncJwtRoleFromPrisma();
    if (!synced.ok) {
      if (synced.reason === "unauthenticated") {
        return { ok: false, reason: synced.reason, error: synced.error };
      }
      return {
        ok: false,
        reason: synced.reason,
        error: synced.error,
        redirectTo: `/account-status?reason=${synced.reason}`,
      };
    }

    const auth = await getCurrentAppUser();
    if (!auth.ok) {
      return {
        ok: false,
        reason: auth.reason,
        error: auth.error,
        redirectTo:
          auth.reason === "unauthenticated"
            ? undefined
            : `/account-status?reason=${auth.reason === "inactive" ? "inactive" : "unprovisioned"}`,
      };
    }

    return {
      ok: true,
      redirectTo: resolvePostLoginRedirect(synced.role, next),
      synced: synced.synced,
      userId: auth.user.id,
      name: auth.user.name,
      loginId: displayLoginId(auth.user),
      role: auth.user.role,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Sign-in completion failed.",
    };
  }
}

/**
 * Soft lock: clear live Supabase session cookies, keep local remembered accounts.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Update password for the signed-in user (Supabase Auth). */
export async function updateOwnPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ProfileUpdateResult> {
  try {
    const auth = await getCurrentAppUser();
    if (!auth.ok) return { ok: false, error: auth.error };

    if (input.newPassword.length < MIN_PASSWORD_LENGTH) {
      return {
        ok: false,
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      };
    }

    const authEmail =
      auth.user.email ??
      (auth.user.username
        ? usernameToStaffEmail(auth.user.username)
        : null);
    if (!authEmail) {
      return { ok: false, error: "Account has no login identity." };
    }

    const supabase = await createClient();
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: input.currentPassword,
    });
    if (reauthError) {
      return { ok: false, error: "Current password is incorrect." };
    }

    const { error } = await supabase.auth.updateUser({
      password: input.newPassword,
    });
    if (error) return { ok: false, error: error.message };

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not update password.",
    };
  }
}

/**
 * Update the member contact/login email (Prisma + Supabase Auth).
 * Username-only ADMIN accounts cannot change email here.
 */
export async function updateOwnEmail(input: {
  email: string;
}): Promise<ProfileUpdateResult> {
  try {
    const auth = await getCurrentAppUser();
    if (!auth.ok) return { ok: false, error: auth.error };

    if (auth.user.username) {
      return {
        ok: false,
        error: "Staff accounts sign in with username, not email.",
      };
    }

    const email = input.email.trim().toLowerCase();
    if (!email.includes("@") || email.length < 5) {
      return { ok: false, error: "Enter a valid email address." };
    }

    const taken = await prisma.user.findFirst({
      where: { email, NOT: { id: auth.user.id } },
      select: { id: true },
    });
    if (taken) {
      return { ok: false, error: "That email is already in use." };
    }

    const admin = createAdminClient();
    const { error: authError } = await admin.auth.admin.updateUserById(
      auth.user.id,
      { email, email_confirm: true },
    );
    if (authError) return { ok: false, error: authError.message };

    await prisma.user.update({
      where: { id: auth.user.id },
      data: { email },
    });

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not update email.",
    };
  }
}

/**
 * Register this device after password login.
 * Optional PIN enables fast unlock using the account-level PIN (set once).
 */
export async function registerRememberedDevice(input: {
  pin?: string | null;
  label?: string | null;
}): Promise<RegisterRememberedDeviceResult> {
  try {
    const auth = await getCurrentAppUser();
    if (!auth.ok) {
      return { ok: false, error: auth.error };
    }

    const pin = input.pin?.trim() || null;
    let hasPin = false;

    if (pin !== null) {
      if (!isValidPin(pin)) {
        return { ok: false, error: "PIN must be exactly 6 digits." };
      }

      if (auth.user.pinHash) {
        if (!verifyPin(pin, auth.user.pinHash)) {
          return { ok: false, error: "Incorrect PIN." };
        }
      } else {
        await prisma.user.update({
          where: { id: auth.user.id },
          data: { pinHash: hashPin(pin) },
        });
      }
      hasPin = true;
    }

    const deviceToken = generateDeviceToken();
    const tokenHash = hashDeviceToken(deviceToken);

    const credential = await prisma.deviceCredential.create({
      data: {
        userId: auth.user.id,
        tokenHash,
        label: input.label?.slice(0, 120) || null,
        lastUsedAt: new Date(),
      },
    });

    return {
      ok: true,
      deviceCredentialId: credential.id,
      deviceToken,
      userId: auth.user.id,
      name: auth.user.name,
      loginId: displayLoginId(auth.user),
      role: auth.user.role,
      hasPin,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Could not remember this account on the device.",
    };
  }
}

/**
 * PIN unlock for a remembered device credential. Mints a Supabase cookie session.
 */
export async function unlockWithPin(input: {
  deviceCredentialId: string;
  deviceToken: string;
  pin: string;
  next?: string | null;
}): Promise<UnlockWithPinResult> {
  try {
    if (!isValidPin(input.pin)) {
      return { ok: false, error: "PIN must be exactly 6 digits." };
    }

    const credential = await prisma.deviceCredential.findUnique({
      where: { id: input.deviceCredentialId },
      include: { user: true },
    });

    if (!credential || credential.revokedAt) {
      return {
        ok: false,
        error: "This saved account is no longer valid. Sign in with your password.",
      };
    }

    if (isCredentialLocked(credential.lockedUntil)) {
      return {
        ok: false,
        locked: true,
        error: "Too many incorrect PIN attempts. Try again in 15 minutes.",
      };
    }

    const expectedHash = hashDeviceToken(input.deviceToken);
    if (expectedHash !== credential.tokenHash) {
      return { ok: false, error: "Device credential mismatch." };
    }

    if (!credential.user.pinHash) {
      return {
        ok: false,
        error: "This account has no PIN. Sign in with your password.",
      };
    }

    if (!verifyPin(input.pin, credential.user.pinHash)) {
      const failedAttempts = credential.failedAttempts + 1;
      const locked =
        failedAttempts >= MAX_PIN_ATTEMPTS ? nextLockoutUntil() : null;
      await prisma.deviceCredential.update({
        where: { id: credential.id },
        data: {
          failedAttempts,
          lockedUntil: locked,
        },
      });
      if (locked) {
        return {
          ok: false,
          locked: true,
          error: "Too many incorrect PIN attempts. Try again in 15 minutes.",
        };
      }
      const remaining = MAX_PIN_ATTEMPTS - failedAttempts;
      return {
        ok: false,
        error: `Incorrect PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`,
      };
    }

    if (credential.user.status !== "ACTIVE") {
      return { ok: false, error: "Your account is not active." };
    }

    await prisma.deviceCredential.update({
      where: { id: credential.id },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
        lastUsedAt: new Date(),
      },
    });

    const authEmail =
      credential.user.email ??
      (credential.user.username
        ? usernameToStaffEmail(credential.user.username)
        : null);
    if (!authEmail) {
      return {
        ok: false,
        error: "Account has no login identity. Sign in with your password.",
      };
    }

    const minted = await mintSessionForEmail(authEmail);
    if (!minted.ok) {
      return minted;
    }

    return completeSignIn(input.next);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "PIN unlock failed.",
    };
  }
}

/**
 * Touch lastUsedAt when unlocking a remembered account via password (no PIN).
 */
export async function touchRememberedDevice(input: {
  deviceCredentialId: string;
  deviceToken: string;
}): Promise<RevokeRememberedDeviceResult> {
  try {
    const credential = await prisma.deviceCredential.findUnique({
      where: { id: input.deviceCredentialId },
    });
    if (!credential || credential.revokedAt) {
      return { ok: false, error: "Saved account not found." };
    }
    if (hashDeviceToken(input.deviceToken) !== credential.tokenHash) {
      return { ok: false, error: "Device credential mismatch." };
    }
    await prisma.deviceCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() },
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not update device.",
    };
  }
}

/**
 * Remove account from this device (hard). Requires proof of device token.
 */
export async function revokeRememberedDevice(input: {
  deviceCredentialId: string;
  deviceToken: string;
}): Promise<RevokeRememberedDeviceResult> {
  try {
    const credential = await prisma.deviceCredential.findUnique({
      where: { id: input.deviceCredentialId },
    });
    if (!credential) {
      return { ok: true };
    }
    if (hashDeviceToken(input.deviceToken) !== credential.tokenHash) {
      return { ok: false, error: "Device credential mismatch." };
    }
    await prisma.deviceCredential.update({
      where: { id: credential.id },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Could not remove this account from the device.",
    };
  }
}

async function mintSessionForEmail(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (error || !data?.properties?.hashed_token) {
    return {
      ok: false,
      error:
        error?.message ??
        "Could not restore session. Sign in with your password.",
    };
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: data.properties.hashed_token,
  });

  if (verifyError) {
    return {
      ok: false,
      error: verifyError.message,
    };
  }

  return { ok: true };
}
