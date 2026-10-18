"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAppUser } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";

const auditSchema = z.object({
  submissionId: z.string().min(1),
  decision: z.enum(["AUDITED", "FLAGGED"]),
  remarks: z.string().optional(),
});

export async function auditPaymentSubmission(
  input: z.infer<typeof auditSchema>,
): Promise<ActionResult<{ status: "AUDITED" | "FLAGGED" }>> {
  try {
    const auditor = await requireAppUser(["AUDITOR"]);
    const parsed = auditSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid audit input.");
    }

    const { submissionId, decision } = parsed.data;
    const remarks = parsed.data.remarks?.trim() ?? "";

    if (decision === "FLAGGED" && !remarks) {
      return fail("Remarks are required when flagging a submission.");
    }

    const result = await prisma.$transaction(async (tx) => {
      const pending = await tx.paymentSubmission.findUnique({
        where: { id: submissionId },
      });
      if (!pending) throw new Error("Payment submission not found.");
      if (pending.status !== "VERIFIED") {
        throw new Error(
          `Only VERIFIED submissions can be audited (currently ${pending.status}).`,
        );
      }

      const updated = await tx.paymentSubmission.updateMany({
        where: { id: submissionId, status: "VERIFIED" },
        data: {
          status: decision,
          auditedById: auditor.id,
          auditedAt: new Date(),
          remarks: remarks || pending.remarks,
        },
      });
      if (updated.count !== 1) {
        throw new Error("Submission was already processed by another auditor.");
      }

      return { status: decision };
    });

    revalidatePath("/audit");
    revalidatePath("/verify");
    revalidatePath("/dashboard");

    return ok(
      result,
      decision === "AUDITED"
        ? "Marked audited — record is now immutable."
        : "Submission flagged for review.",
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Audit action failed.");
  }
}
