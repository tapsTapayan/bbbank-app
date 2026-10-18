"use client";

import { createClient } from "@/lib/supabase/client";
import { RECEIPT_BUCKET } from "@/lib/storage/constants";
import { compressReceiptImage } from "@/lib/storage/compress-receipt";

export type CompressAndUploadReceiptParams = {
  file: File;
  cycleId: string;
  userId: string;
  referenceNumber: string;
  /** When already compressed (e.g. after OCR), skip re-compression. */
  alreadyCompressed?: boolean;
};

/**
 * Client-side: compress a receipt image to WebP (<250 KB, max 1200px),
 * then upload to the private `payment-receipts` bucket.
 * Returns the storage object path (not a public URL).
 *
 * Path folder segment #2 must be the Supabase auth `sub` so storage RLS
 * (`auth.jwt() ->> 'sub'`) allows the upload — not always Prisma `User.id`
 * when the row was matched by email fallback.
 */
export async function compressAndUploadReceipt(
  params: CompressAndUploadReceiptParams,
): Promise<string> {
  const { file, cycleId, userId, referenceNumber, alreadyCompressed } = params;

  const compressed = alreadyCompressed
    ? file
    : await compressReceiptImage(file);

  const supabase = createClient();
  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !authUser) {
    throw new Error("Sign in again to upload a receipt.");
  }

  // Prefer JWT sub for the RLS folder; fall back to app userId.
  const ownerId = authUser.id || userId;
  const safeRef = referenceNumber
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
  const timestamp = Date.now();
  const storagePath = `${cycleId}/${ownerId}/${timestamp}-${safeRef || "receipt"}.webp`;

  const { error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(storagePath, compressed, {
      contentType: "image/webp",
      upsert: false,
      cacheControl: "3600",
    });

  if (error) {
    throw new Error(error.message || "Failed to upload receipt image.");
  }

  return storagePath;
}
