"use client";

import imageCompression from "browser-image-compression";

const MAX_WIDTH_OR_HEIGHT = 1200;
const MAX_SIZE_MB = 0.25;

/** Compress a receipt to WebP for OCR + storage upload. */
export async function compressReceiptImage(file: File): Promise<File> {
  const compressed = await imageCompression(file, {
    maxSizeMB: MAX_SIZE_MB,
    maxWidthOrHeight: MAX_WIDTH_OR_HEIGHT,
    useWebWorker: true,
    fileType: "image/webp",
    initialQuality: 0.8,
  });

  return new File([compressed], file.name.replace(/\.\w+$/, ".webp"), {
    type: "image/webp",
    lastModified: Date.now(),
  });
}
