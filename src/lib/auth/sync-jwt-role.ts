import type { UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { roleHome } from "./routes";
import type { AuthFailureReason } from "./session";

export type SyncJwtRoleResult =
  | {
      ok: true;
      role: UserRole;
      home: string;
      synced: boolean;
      email: string | null;
      username: string | null;
    }
  | { ok: false; reason: AuthFailureReason; error: string };

/**
 * Aligns Supabase JWT `app_metadata.role` with the Prisma User.role (source of truth).
 * Proxy RBAC reads the JWT; pages/actions read Prisma — keep them in sync after login.
 */
export async function syncJwtRoleFromPrisma(): Promise<SyncJwtRoleResult> {
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

  const appMetadata = data.claims.app_metadata as
    | { role?: unknown }
    | null
    | undefined;
  const currentJwtRole =
    typeof appMetadata?.role === "string" ? appMetadata.role : null;

  let synced = false;
  if (currentJwtRole !== user.role) {
    const admin = createAdminClient();
    const { error: updateError } = await admin.auth.admin.updateUserById(
      authId,
      {
        app_metadata: { role: user.role },
      },
    );
    if (updateError) {
      throw new Error(
        `Failed to sync role into auth session: ${updateError.message}`,
      );
    }
    // Refresh cookie session so proxy RBAC sees the new claim immediately.
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      throw new Error(
        `Role synced but session refresh failed: ${refreshError.message}`,
      );
    }
    synced = true;
  }

  return {
    ok: true,
    role: user.role,
    home: roleHome(user.role),
    synced,
    email: user.email,
    username: user.username,
  };
}
