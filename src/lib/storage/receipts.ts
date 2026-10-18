import { createAdminClient } from "@/lib/supabase/admin";
import { requireAppUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  RECEIPT_BUCKET,
  RECEIPT_SIGNED_URL_TTL_SECONDS,
} from "@/lib/storage/constants";

export { RECEIPT_BUCKET, RECEIPT_SIGNED_URL_TTL_SECONDS };

/**
 * Server-side: authorize the viewer, then issue a 15-minute signed URL
 * for a private receipt object. Allowed: submitting Member, Treasurer,
 * Auditor, or Admin.
 */
export async function getReceiptSignedUrl(
  storagePath: string,
): Promise<string> {
  if (!storagePath || storagePath.includes("..")) {
    throw new Error("Invalid receipt storage path.");
  }

  const viewer = await requireAppUser();

  const submission = await prisma.paymentSubmission.findFirst({
    where: { receiptUrl: storagePath },
    select: { userId: true },
  });

  const isSubmitter = submission?.userId === viewer.id;
  const isStaff =
    viewer.role === "TREASURER" ||
    viewer.role === "AUDITOR" ||
    viewer.role === "ADMIN";

  // Path convention: {cycleId}/{userId}/... — allow owner even before DB row exists.
  const pathUserId = storagePath.split("/")[1];
  const isPathOwner = pathUserId === viewer.id;

  if (!isSubmitter && !isStaff && !isPathOwner) {
    throw new Error("You are not allowed to view this receipt.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(RECEIPT_BUCKET)
    .createSignedUrl(storagePath, RECEIPT_SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Failed to create signed receipt URL.");
  }

  return data.signedUrl;
}
