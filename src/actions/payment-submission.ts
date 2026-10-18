"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireAppUser } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { dateOnlyUTC } from "@/lib/finance/cpe-policy";

const paymentChannelSchema = z.enum([
  "GCASH",
  "MAYA",
  "BANK_TRANSFER",
  "OTHER_DIGITAL",
  "CASH",
]);

const submitPaymentProofSchema = z
  .object({
    amount: z
      .union([z.string(), z.number()])
      .transform((v) => (typeof v === "number" ? v.toFixed(2) : v.trim()))
      .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Invalid amount")
      .refine((v) => Number(v) > 0, "Amount must be greater than zero"),
    targetType: z.enum(["CONTRIBUTION", "LOAN_AMORTIZATION"]),
    targetId: z.string().min(1, "Target is required"),
    paymentChannel: paymentChannelSchema,
    /** Optional for cash — server generates a unique tag from paidAt. */
    referenceNumber: z.string().optional().default(""),
    /** Required for digital channels; optional for cash. */
    receiptPath: z.string().optional().nullable(),
    /** YYYY-MM-DD calendar date the member paid. */
    paidAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Payment date is required (YYYY-MM-DD)"),
    aiExtractedAmount: z
      .union([z.string(), z.number(), z.null()])
      .optional()
      .transform((v) => {
        if (v === undefined || v === null || v === "") return null;
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n.toFixed(2) : null;
      }),
    aiExtractedRefNo: z
      .union([z.string(), z.null()])
      .optional()
      .transform((v) => {
        if (!v || !v.trim()) return null;
        return v.replace(/[\s-]/g, "").toUpperCase();
      }),
    aiExtractedChannel: z
      .union([paymentChannelSchema, z.literal("UNKNOWN"), z.null()])
      .optional()
      .transform((v) => {
        if (!v || v === "UNKNOWN") return null;
        return v;
      }),
    aiConfidenceNote: z
      .union([z.string(), z.null()])
      .optional()
      .transform((v) => (v && v.trim() ? v.trim() : null)),
  })
  .superRefine((data, ctx) => {
    if (data.paymentChannel !== "CASH") {
      if (!data.receiptPath?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["receiptPath"],
          message: "Attach a receipt image for digital payments.",
        });
      }
      if (!data.referenceNumber?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["referenceNumber"],
          message: "Reference number is required.",
        });
      }
    }
  });

export type SubmitPaymentProofInput = z.input<typeof submitPaymentProofSchema>;

function normalizeReferenceNumber(value: string): string {
  return value.trim().toUpperCase();
}

function parsePaidAt(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return dateOnlyUTC(y!, m! - 1, d!);
}

function todayLocalIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Unique cash tag: CASH-YYYYMMDD-<userSuffix>-<random>. */
function buildCashReference(userId: string, paidAtIso: string): string {
  const day = paidAtIso.replace(/-/g, "");
  const suffix = userId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CASH-${day}-${suffix}-${rand}`;
}

/**
 * Member submits proof of payment. Creates a PENDING_VERIFICATION row only —
 * balances and ledger entries are written on treasurer verification.
 *
 * Cash: payment date is the primary attestation; receipt image is optional.
 * Digital: receipt + reference required.
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
    const paidAt = parsePaidAt(data.paidAt);
    const todayIso = todayLocalIsoDate();
    if (data.paidAt > todayIso) {
      return fail("Payment date cannot be in the future.");
    }

    let referenceNumber = normalizeReferenceNumber(data.referenceNumber ?? "");
    if (data.paymentChannel === "CASH" && !referenceNumber) {
      referenceNumber = buildCashReference(member.id, data.paidAt);
    }
    if (!referenceNumber) {
      return fail("Reference number is required.");
    }

    const receiptUrl =
      data.receiptPath?.trim() ||
      (data.paymentChannel === "CASH" ? null : null);
    if (data.paymentChannel !== "CASH" && !receiptUrl) {
      return fail("Attach a receipt image for digital payments.");
    }

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
        data.paymentChannel === "CASH"
          ? "A matching cash submission already exists. Try again or contact the treasurer."
          : "This payment reference number was already submitted for this channel. Check your receipt or contact the treasurer.",
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
        receiptUrl,
        paidAt,
        aiExtractedAmount: data.aiExtractedAmount
          ? new Prisma.Decimal(data.aiExtractedAmount)
          : null,
        aiExtractedRefNo: data.aiExtractedRefNo,
        aiExtractedChannel: data.aiExtractedChannel,
        aiConfidenceNote:
          data.paymentChannel === "CASH" && !receiptUrl
            ? data.aiConfidenceNote ??
              `Cash payment attested for ${data.paidAt} (no receipt image).`
            : data.aiConfidenceNote,
        status: "PENDING_VERIFICATION",
      },
      select: { id: true },
    });

    revalidatePath("/dashboard");
    revalidatePath("/pay");
    revalidatePath("/verify");

    return ok(
      { id: submission.id },
      data.paymentChannel === "CASH"
        ? "Cash payment submitted with payment date. Awaiting treasurer verification."
        : "Payment proof submitted. Awaiting treasurer verification.",
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return fail(
        "This payment reference was already submitted for this channel. Check details or contact the treasurer.",
      );
    }
    const message =
      error instanceof Error ? error.message : "Failed to submit payment proof.";
    return fail(message);
  }
}
