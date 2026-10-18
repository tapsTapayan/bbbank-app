"use server";

import { revalidatePath } from "next/cache";
import { Decimal } from "decimal.js";
import { z } from "zod";
import {
  Prisma,
  type PaymentSubmissionStatus,
} from "@/generated/prisma/client";
import { requireAppUser } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import {
  allocatePayment,
  remainingDues,
} from "@/lib/finance/loan-calculator";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const verifySchema = z.object({
  submissionId: z.string().min(1),
  decision: z.enum(["VERIFIED", "REJECTED"]),
  remarks: z.string().optional(),
});

export type VerifyPaymentSubmissionInput = z.infer<typeof verifySchema>;

function toMoney(value: Decimal.Value): Decimal {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Treasurer / Admin atomic verification engine.
 * Approvals write Contribution/LoanAmortization updates + immutable LedgerEntry rows
 * inside a single Prisma interactive transaction.
 */
export async function verifyPaymentSubmission(
  input: VerifyPaymentSubmissionInput,
): Promise<ActionResult<{ status: PaymentSubmissionStatus }>> {
  try {
    const verifier = await requireAppUser(["TREASURER", "ADMIN"]);
    const parsed = verifySchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid verification input.");
    }

    const { submissionId, decision } = parsed.data;
    const remarks = parsed.data.remarks?.trim() ?? "";

    if (decision === "REJECTED" && !remarks) {
      return fail("Remarks are required when rejecting a submission.");
    }

    const result = await prisma.$transaction(async (tx) => {
      // Optimistic lock: only transition from PENDING_VERIFICATION.
      const pending = await tx.paymentSubmission.findUnique({
        where: { id: submissionId },
        include: {
          contribution: true,
          loanAmortization: {
            include: {
              loan: {
                include: {
                  amortizations: { select: { id: true, status: true } },
                },
              },
            },
          },
        },
      });

      if (!pending) {
        throw new Error("Payment submission not found.");
      }
      if (pending.status !== "PENDING_VERIFICATION") {
        throw new Error(
          `Submission is already ${pending.status.replaceAll("_", " ").toLowerCase()}.`,
        );
      }

      const now = new Date();

      if (decision === "REJECTED") {
        const rejected = await tx.paymentSubmission.updateMany({
          where: { id: submissionId, status: "PENDING_VERIFICATION" },
          data: {
            status: "REJECTED",
            verifiedById: verifier.id,
            verifiedAt: now,
            remarks,
          },
        });
        if (rejected.count !== 1) {
          throw new Error("Submission was already processed by another treasurer.");
        }
        return { status: "REJECTED" as const };
      }

      // ── APPROVE (VERIFIED) ──────────────────────────────────────────────
      const claimed = await tx.paymentSubmission.updateMany({
        where: { id: submissionId, status: "PENDING_VERIFICATION" },
        data: {
          status: "VERIFIED",
          verifiedById: verifier.id,
          verifiedAt: now,
          remarks: remarks || null,
        },
      });
      if (claimed.count !== 1) {
        throw new Error("Submission was already processed by another treasurer.");
      }

      const amount = toMoney(pending.amount.toString());

      if (pending.targetType === "CONTRIBUTION") {
        if (!pending.contribution) {
          throw new Error("Contribution target is missing on this submission.");
        }

        const contribution = pending.contribution;
        const amountPaid = toMoney(contribution.amountPaid.toString()).plus(
          amount,
        );
        const amountDue = toMoney(contribution.amountDue.toString());
        const status = amountPaid.gte(amountDue) ? "PAID" : "PARTIAL";

        await tx.contribution.update({
          where: { id: contribution.id },
          data: {
            amountPaid: new Prisma.Decimal(amountPaid.toFixed(2)),
            status,
          },
        });

        await tx.ledgerEntry.create({
          data: {
            cycleId: contribution.cycleId,
            userId: pending.userId,
            paymentSubmissionId: pending.id,
            entryType: "CONTRIBUTION_IN",
            amount: new Prisma.Decimal(amount.toFixed(2)),
            description: `Contribution payment verified · ref ${pending.referenceNumber}`,
            createdById: verifier.id,
          },
        });

        return { status: "VERIFIED" as const };
      }

      // ── LOAN_AMORTIZATION ───────────────────────────────────────────────
      if (!pending.loanAmortization) {
        throw new Error("Loan amortization target is missing on this submission.");
      }

      const installment = pending.loanAmortization;
      const loan = installment.loan;
      const allocation = allocatePayment(amount, {
        penaltyAmount: installment.penaltyAmount.toString(),
        interestComponent: installment.interestComponent.toString(),
        principalComponent: installment.principalComponent.toString(),
        amountPaid: installment.amountPaid.toString(),
      });

      const newAmountPaid = toMoney(installment.amountPaid.toString()).plus(
        amount.minus(allocation.leftover),
      );
      const duesAfter = remainingDues({
        penaltyAmount: installment.penaltyAmount.toString(),
        interestComponent: installment.interestComponent.toString(),
        principalComponent: installment.principalComponent.toString(),
        amountPaid: newAmountPaid,
      });
      const amortStatus = duesAfter.totalDue.lte(0) ? "PAID" : "PARTIAL";

      await tx.loanAmortization.update({
        where: { id: installment.id },
        data: {
          amountPaid: new Prisma.Decimal(newAmountPaid.toFixed(2)),
          status: amortStatus,
        },
      });

      const ledgerBase = {
        cycleId: loan.cycleId,
        userId: pending.userId,
        paymentSubmissionId: pending.id,
        loanId: loan.id,
        createdById: verifier.id,
      };

      if (allocation.toPenalty.gt(0)) {
        await tx.ledgerEntry.create({
          data: {
            ...ledgerBase,
            entryType: "PENALTY_INCOME_IN",
            amount: new Prisma.Decimal(allocation.toPenalty.toFixed(2)),
            description: `Penalty income · installment #${installment.installmentNumber} · ref ${pending.referenceNumber}`,
          },
        });
      }
      if (allocation.toInterest.gt(0)) {
        await tx.ledgerEntry.create({
          data: {
            ...ledgerBase,
            entryType: "INTEREST_INCOME_IN",
            amount: new Prisma.Decimal(allocation.toInterest.toFixed(2)),
            description: `Interest income · installment #${installment.installmentNumber} · ref ${pending.referenceNumber}`,
          },
        });
      }
      if (allocation.toPrincipal.gt(0)) {
        await tx.ledgerEntry.create({
          data: {
            ...ledgerBase,
            entryType: "PRINCIPAL_REPAYMENT_IN",
            amount: new Prisma.Decimal(allocation.toPrincipal.toFixed(2)),
            description: `Principal repayment · installment #${installment.installmentNumber} · ref ${pending.referenceNumber}`,
          },
        });
      }

      const unpaidSibling = loan.amortizations.some(
        (a) => a.id !== installment.id && a.status !== "PAID",
      );
      const thisPaid = amortStatus === "PAID";
      if (thisPaid && !unpaidSibling) {
        await tx.loan.update({
          where: { id: loan.id },
          data: { status: "COMPLETED" },
        });
      }

      return { status: "VERIFIED" as const };
    });

    revalidatePath("/verify");
    revalidatePath("/dashboard");
    revalidatePath("/audit");

    return ok(
      result,
      decision === "VERIFIED"
        ? "Payment verified and ledger updated."
        : "Payment rejected.",
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to verify payment submission.";
    return fail(message);
  }
}
