import { connection } from "next/server";
import { requirePageUser } from "@/lib/auth/session";
import { getPendingVerificationQueue } from "@/lib/queries/pending-submissions";
import { VerifyWorkspace } from "./verify-workspace";

/** Auth + live Prisma queue — request-time, not instant-navigation shell. */
export const instant = false;

export default async function VerifyPage() {
  await connection();
  await requirePageUser(["TREASURER"], "/verify");

  const queue = await getPendingVerificationQueue();
  return <VerifyWorkspace initialQueue={queue} />;
}
