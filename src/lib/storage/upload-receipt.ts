"use client";

import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";
import { RECEIPT_BUCKET } from "@/lib/storage/constants";

const MAX_WIDTH_OR_HEIGHT = 1200;
const MAX_SIZE_MB = 0.25; // ~250 KB target

export type CompressAndUploadReceiptParams = {
  file: File;
  cycleId: string;
  userId: string;
  referenceNumber: string;
};

/**
 * Client-side: compress a receipt image to WebP (<250 KB, max 1200px),
 * then upload to the private `payment-receipts` bucket.
 * Returns the storage object path (not a public URL).
 */
export async function compressAndUploadReceipt(
  params: CompressAndUploadReceiptParams,
): Promise<string> {
  const { file, cycleId, userId, referenceNumber } = params;

  const compressed = await imageCompression(file, {
    maxSizeMB: MAX_SIZE_MB,
    maxWidthOrHeight: MAX_WIDTH_OR_HEIGHT,
    useWebWorker: true,
    fileType: "image/webp",
    initialQuality: 0.8,
  });

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
