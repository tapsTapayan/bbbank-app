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
 */
export async function compressAndUploadReceipt(
  params: CompressAndUploadReceiptParams,
): Promise<string> {
  const { file, cycleId, userId, referenceNumber, alreadyCompressed } = params;

  const compressed = alreadyCompressed
    ? file
    : await compressReceiptImage(file);

  const safeRef = referenceNumber
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
  const timestamp = Date.now();
  const storagePath = `${cycleId}/${userId}/${timestamp}-${safeRef || "receipt"}.webp`;

  const supabase = createClient();
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
