import { redirect } from "next/navigation";
import { roleHome } from "@/lib/auth/routes";
import { getCurrentAppUser } from "@/lib/auth/session";
import { countAppUsers } from "@/lib/queries/users";
import { createClient } from "@/lib/supabase/server";

/** Auth + Prisma gating — request-time, not an instant-navigation shell. */
export const instant = false;

/**
 * Single entry: setup when empty, role home when signed in, otherwise /login.
 */
export default async function HomePage() {
  if ((await countAppUsers()) === 0) {
    redirect("/setup");
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims?.sub);

  if (isAuthenticated) {
    const auth = await getCurrentAppUser();
    if (auth.ok) {
      redirect(roleHome(auth.user.role));
    }
    redirect(
      `/account-status?reason=${auth.reason === "inactive" ? "inactive" : "unprovisioned"}`,
    );
  }

  redirect("/login");
}
