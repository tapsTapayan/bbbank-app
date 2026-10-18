"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireAppUser } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";

const submitPaymentProofSchema = z.object({
  amount: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "number" ? v.toFixed(2) : v.trim()))
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Invalid amount")
    .refine((v) => Number(v) > 0, "Amount must be greater than zero"),
  targetType: z.enum(["CONTRIBUTION", "LOAN_AMORTIZATION"]),
  targetId: z.string().min(1, "Target is required"),
  paymentChannel: z.enum(["GCASH", "MAYA", "BANK_TRANSFER", "CASH"]),
  referenceNumber: z.string().min(1, "Reference number is required"),
  receiptPath: z.string().min(1, "Receipt path is required"),
});

export type SubmitPaymentProofInput = z.infer<typeof submitPaymentProofSchema>;

function normalizeReferenceNumber(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Member submits proof of payment. Creates a PENDING_VERIFICATION row only —
 * balances and ledger entries are written on treasurer verification.
 */
export async function submitPaymentProof(
  input: SubmitPaymentProofInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const member = await requireAppUser();
    const parsed = submitPaymentProofSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid submission.");
    }

    const data = parsed.data;
    const referenceNumber = normalizeReferenceNumber(data.referenceNumber);

    const duplicate = await prisma.paymentSubmission.findUnique({
      where: {
        paymentChannel_referenceNumber: {
          paymentChannel: data.paymentChannel,
          referenceNumber,
        },
      },
      select: { id: true },
    });

    if (duplicate) {
      return fail(
        "This payment reference number was already submitted for this channel. Check your receipt or contact the treasurer.",
      );
    }

    if (data.targetType === "CONTRIBUTION") {
      const contribution = await prisma.contribution.findFirst({
        where: { id: data.targetId, userId: member.id },
        select: { id: true },
      });
      if (!contribution) {
        return fail("Contribution not found for your account.");
      }
    } else {
      const amortization = await prisma.loanAmortization.findFirst({
        where: {
          id: data.targetId,
          loan: { borrowerId: member.id },
        },
        select: { id: true },
      });
      if (!amortization) {
        return fail("Loan installment not found for your account.");
      }
    }

    const submission = await prisma.paymentSubmission.create({
      data: {
        userId: member.id,
        targetType: data.targetType,
        contributionId:
          data.targetType === "CONTRIBUTION" ? data.targetId : null,
        loanAmortizationId:
          data.targetType === "LOAN_AMORTIZATION" ? data.targetId : null,
        amount: new Prisma.Decimal(data.amount),
        paymentChannel: data.paymentChannel,
        referenceNumber,
        receiptUrl: data.receiptPath,
        status: "PENDING_VERIFICATION",
      },
      select: { id: true },
    });

    revalidatePath("/dashboard");
    revalidatePath("/verify");

    return ok(
      { id: submission.id },
      "Payment proof submitted. Awaiting treasurer verification.",
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return fail(
        "This payment reference number was already submitted for this channel. Check your receipt or contact the treasurer.",
      );
    }
    const message =
      error instanceof Error ? error.message : "Failed to submit payment proof.";
    return fail(message);
  }
}
