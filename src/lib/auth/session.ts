import type { User, UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export type AuthResult =
  | { ok: true; user: User }
  | { ok: false; error: string };

/**
 * Resolves the authenticated Supabase user to the Prisma `User` row.
 * Expects `users.id` to equal `auth.users.id` (Supabase UUID).
 */
export async function getCurrentAppUser(): Promise<AuthResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return { ok: false, error: "You must be signed in to continue." };
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
      error:
        "Your account is authenticated but not provisioned in BBBank. Ask an admin to create your member profile.",
    };
  }

  if (user.status !== "ACTIVE") {
    return { ok: false, error: "Your account is not active." };
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
