import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/session";
import { getPendingVerificationQueue } from "@/lib/queries/pending-submissions";
import { VerifyWorkspace } from "./verify-workspace";

/** Auth + live Prisma queue — request-time, not instant-navigation shell. */
export const instant = false;

export default async function VerifyPage() {
  const auth = await getCurrentAppUser();
  if (!auth.ok) {
    redirect(`/login?next=${encodeURIComponent("/verify")}`);
  }
  if (auth.user.role !== "TREASURER" && auth.user.role !== "ADMIN") {
    redirect("/unauthorized");
  }

  const queue = await getPendingVerificationQueue();
  return <VerifyWorkspace initialQueue={queue} />;
}
