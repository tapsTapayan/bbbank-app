import { redirect } from "next/navigation";
import type { User, UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export type AuthFailureReason =
  | "unauthenticated"
  | "unprovisioned"
  | "inactive";

export type AuthResult =
  | { ok: true; user: User }
  | { ok: false; reason: AuthFailureReason; error: string };

/**
 * Resolves the authenticated Supabase user to the Prisma `User` row.
 * Expects `users.id` to equal `auth.users.id` (Supabase UUID).
 */
export async function getCurrentAppUser(): Promise<AuthResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return {
      ok: false,
      reason: "unauthenticated",
      error: "You must be signed in to continue.",
    };
  }

  const authId = data.claims.sub;
  const email =
    typeof data.claims.email === "string" ? data.claims.email : undefined;

  let user = await prisma.user.findUnique({ where: { id: authId } });

  // Fallback: match by email if the Prisma row was seeded with a different id.
  if (!user && email) {
    user = await prisma.user.findUnique({ where: { email } });
  }

  if (!user) {
    return {
      ok: false,
      reason: "unprovisioned",
      error:
        "Your account is authenticated but not provisioned in BBB. Ask an admin to create your member profile.",
    };
  }

  if (user.status !== "ACTIVE") {
    return {
      ok: false,
      reason: "inactive",
      error: "Your account is not active.",
    };
  }

  return { ok: true, user };
}

export async function requireAppUser(
  allowedRoles?: readonly UserRole[],
): Promise<User> {
  const result = await getCurrentAppUser();
  if (!result.ok) {
    throw new Error(result.error);
  }

  if (allowedRoles && !allowedRoles.includes(result.user.role)) {
    throw new Error("You do not have permission to perform this action.");
  }

  return result.user;
}

/** Redirect target for a failed page-level auth check (never loops to login when already signed in). */
export function redirectForAuthFailure(
  result: Extract<AuthResult, { ok: false }>,
  nextPath?: string,
): never {
  if (result.reason === "unauthenticated") {
    const next = nextPath
      ? `?next=${encodeURIComponent(nextPath)}`
      : "";
    redirect(`/login${next}`);
  }

  const reason =
    result.reason === "inactive" ? "inactive" : "unprovisioned";
  redirect(`/account-status?reason=${reason}`);
}

/**
 * Page-level auth: redirects to login, account-status, or unauthorized.
 * Use in Server Components instead of manually branching on getCurrentAppUser.
 */
export async function requirePageUser(
  allowedRoles?: readonly UserRole[],
  nextPath?: string,
): Promise<User> {
  const result = await getCurrentAppUser();
  if (!result.ok) {
    redirectForAuthFailure(result, nextPath);
  }

  if (allowedRoles && !allowedRoles.includes(result.user.role)) {
    redirect("/unauthorized");
  }

  return result.user;
}
