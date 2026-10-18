"use server";

import { getReceiptSignedUrl } from "@/lib/storage/receipts";
import { fail, ok, type ActionResult } from "@/lib/action-result";

/** Server Action wrapper so Client Components can request a signed receipt URL. */
export async function fetchReceiptSignedUrl(
  storagePath: string,
): Promise<ActionResult<{ url: string }>> {
  try {
    const url = await getReceiptSignedUrl(storagePath);
    return ok({ url });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load receipt.";
    return fail(message);
  }
}
