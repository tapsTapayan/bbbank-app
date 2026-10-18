"use server";

import { revalidatePath } from "next/cache";
import { Decimal } from "decimal.js";
import { z } from "zod";
import {
  Prisma,
  type PaymentChannel,
  type PaymentSubmissionStatus,
} from "@/generated/prisma/client";
import { requireAppUser } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import {
  allocateContributionPayment,
  allocatePayment,
  contributionStatusAfterPayment,
  remainingContributionDues,
  remainingDues,
  toMoney,
} from "@/lib/finance/payment-allocation";
import {
  computeLiveLateFee,
  formatKinsenaDueLabel,
  formatKinsenaPeriodScope,
  GRACE_PERIOD_DAYS,
} from "@/lib/finance/cpe-policy";
import { ensureContributionCoverageForAmount } from "@/lib/finance/contribution-generator";
import {
  contributionWaterfallObligation,
  formatWaterfallPreview,
  loanWaterfallObligation,
  planPaymentWaterfall,
  type WaterfallPlan,
} from "@/lib/finance/payment-waterfall";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const verifySchema = z.object({
  submissionId: z.string().min(1),
  decision: z.enum(["VERIFIED", "REJECTED"]),
  remarks: z.string().optional(),
  /** Treasurer-confirmed credit amount (overrides submitted amount on approve). */
  creditedAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Invalid amount")
    .optional(),
  paymentChannel: z
    .enum(["GCASH", "MAYA", "BANK_TRANSFER", "OTHER_DIGITAL", "CASH"])
    .optional(),
  referenceNumber: z.string().min(1).max(120).optional(),
});

export type VerifyPaymentSubmissionInput = z.infer<typeof verifySchema>;

type Tx = Prisma.TransactionClient;

async function syncContributionPenaltyAtSubmit(
  tx: Tx,
  contributionId: string,
  /** Payment transaction date (paidAt) — Rule #3 as-of clock. */
  paidAt: Date,
): Promise<void> {
  const contribution = await tx.contribution.findUniqueOrThrow({
    where: { id: contributionId },
    include: {
      cycle: { select: { gracePeriodDays: true, penaltyRate: true } },
    },
  });
  if (contribution.penaltyAccrualFrozen) return;

  const fee = computeLiveLateFee({
    dueDate: contribution.dueDate,
    openedAt: contribution.createdAt,
    headsCount: contribution.headsSnapshot,
    now: paidAt,
    gracePeriodDays: contribution.cycle.gracePeriodDays ?? GRACE_PERIOD_DAYS,
    ratePerHeadPerDay: contribution.cycle.penaltyRate.toString(),
    pendingSubmittedAt: paidAt,
  });

  await tx.contribution.update({
    where: { id: contributionId },
    data: {
      daysDelayed: fee.chargeableDays,
      penaltyAmount: fee.penaltyAmount.toFixed(2),
      status:
        fee.chargeableDays > 0 && contribution.status !== "PAID"
          ? "OVERDUE"
          : contribution.status,
    },
  });
}

async function syncLoanInstallmentPenaltyAtSubmit(
  tx: Tx,
  installmentId: string,
  /** Payment transaction date (paidAt) — Rule #3 as-of clock. */
  paidAt: Date,
): Promise<void> {
  const installment = await tx.loanAmortization.findUniqueOrThrow({
    where: { id: installmentId },
    include: {
      loan: {
        select: {
          headsSnapshot: true,
          cycle: { select: { gracePeriodDays: true, penaltyRate: true } },
        },
      },
    },
  });
  if (installment.penaltyAccrualFrozen) return;

  const heads = installment.headsSnapshot || installment.loan.headsSnapshot;
  const fee = computeLiveLateFee({
    dueDate: installment.dueDate,
    openedAt: installment.createdAt,
    headsCount: heads,
    now: paidAt,
    gracePeriodDays: installment.loan.cycle.gracePeriodDays ?? GRACE_PERIOD_DAYS,
    ratePerHeadPerDay: installment.loan.cycle.penaltyRate.toString(),
    pendingSubmittedAt: paidAt,
  });

  await tx.loanAmortization.update({
    where: { id: installmentId },
    data: {
      daysDelayed: fee.chargeableDays,
      penaltyAmount: fee.penaltyAmount.toFixed(2),
      status:
        fee.chargeableDays > 0 && installment.status !== "PAID"
          ? "OVERDUE"
          : installment.status,
    },
  });
}

async function applyContributionPayment(
  tx: Tx,
  params: {
    contributionId: string;
    userId: string;
    cycleId: string;
    paymentSubmissionId: string;
    referenceNumber: string;
    createdById: string;
    amount: Decimal;
  },
): Promise<Decimal> {
  const contribution = await tx.contribution.findUniqueOrThrow({
    where: { id: params.contributionId },
  });

  const waived = contribution.penaltyWaivedAmount?.toString() ?? "0";
  const allocation = allocateContributionPayment(params.amount, {
    amountDue: contribution.amountDue.toString(),
    amountPaid: contribution.amountPaid.toString(),
    penaltyAmount: contribution.penaltyAmount.toString(),
    penaltyWaivedAmount: waived,
  });

  const applied = toMoney(
    allocation.toPenalty.plus(allocation.toInterest).plus(allocation.toPrincipal),
  );
  const newAmountPaid = toMoney(contribution.amountPaid.toString()).plus(applied);
  const status = contributionStatusAfterPayment(
    {
      amountDue: contribution.amountDue.toString(),
      amountPaid: contribution.amountPaid.toString(),
      penaltyAmount: contribution.penaltyAmount.toString(),
      penaltyWaivedAmount: waived,
    },
    newAmountPaid,
    contribution.status,
  );

  await tx.contribution.update({
    where: { id: contribution.id },
    data: {
      amountPaid: new Prisma.Decimal(newAmountPaid.toFixed(2)),
      status,
    },
  });

  const periodLabel = formatKinsenaPeriodScope(
    contribution.dueDate,
    contribution.kinsenaIndex === 2 ? 2 : 1,
  );

  if (allocation.toPenalty.gt(0)) {
    await tx.ledgerEntry.create({
      data: {
        cycleId: params.cycleId,
        userId: params.userId,
        paymentSubmissionId: params.paymentSubmissionId,
        entryType: "PENALTY_INCOME_IN",
        amount: new Prisma.Decimal(allocation.toPenalty.toFixed(2)),
        description: `Late fee · ${periodLabel} · ref ${params.referenceNumber}`,
        createdById: params.createdById,
      },
    });
  }
  if (allocation.toPrincipal.gt(0)) {
    await tx.ledgerEntry.create({
      data: {
        cycleId: params.cycleId,
        userId: params.userId,
        paymentSubmissionId: params.paymentSubmissionId,
        entryType: "CONTRIBUTION_IN",
        amount: new Prisma.Decimal(allocation.toPrincipal.toFixed(2)),
        description: `Contribution · ${periodLabel} · ref ${params.referenceNumber}`,
        createdById: params.createdById,
      },
    });
  }

  return allocation.leftover;
}

/** Oldest-first contribution waterfall after live fee sync. */
async function applyContributionWaterfall(
  tx: Tx,
  params: {
    userId: string;
    cycleId: string;
    amount: Decimal;
    paidAt: Date;
    paymentSubmissionId: string;
    referenceNumber: string;
    createdById: string;
  },
): Promise<{ plan: WaterfallPlan; leftover: Decimal }> {
  const openRows = await tx.contribution.findMany({
    where: {
      userId: params.userId,
      status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
    },
    orderBy: [{ dueDate: "asc" }, { kinsenaIndex: "asc" }],
  });

  for (const row of openRows) {
    await syncContributionPenaltyAtSubmit(tx, row.id, params.paidAt);
  }

  const refreshed = await tx.contribution.findMany({
    where: {
      userId: params.userId,
      status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
    },
    orderBy: [{ dueDate: "asc" }, { kinsenaIndex: "asc" }],
  });

  const obligations = refreshed
    .map((row) =>
      contributionWaterfallObligation({
        id: row.id,
        label: formatKinsenaPeriodScope(
          row.dueDate,
          row.kinsenaIndex === 2 ? 2 : 1,
        ),
        amountDue: row.amountDue.toString(),
        amountPaid: row.amountPaid.toString(),
        penaltyAmount: row.penaltyAmount.toString(),
        penaltyWaivedAmount: row.penaltyWaivedAmount?.toString() ?? "0",
      }),
    )
    .filter((row): row is NonNullable<typeof row> => row != null);

  const plan = planPaymentWaterfall(params.amount, obligations);

  for (const line of plan.lines) {
    const row = refreshed.find((r) => r.id === line.id);
    if (!row) continue;
    await applyContributionPayment(tx, {
      contributionId: line.id,
      userId: params.userId,
      cycleId: row.cycleId,
      paymentSubmissionId: params.paymentSubmissionId,
      referenceNumber: params.referenceNumber,
      createdById: params.createdById,
      amount: toMoney(line.applied),
    });
  }

  const allocationSummary = formatWaterfallPreview(plan).join("\n");
  await tx.paymentSubmission.update({
    where: { id: params.paymentSubmissionId },
    data: {
      contributionId: plan.primaryTargetId,
      loanAmortizationId: null,
      allocationSummary: allocationSummary || null,
    },
  });

  return { plan, leftover: toMoney(plan.prepaid) };
}

async function applyLoanInstallmentPayment(
  tx: Tx,
  params: {
    installmentId: string;
    userId: string;
    paymentSubmissionId: string;
    referenceNumber: string;
    createdById: string;
    amount: Decimal;
  },
): Promise<{ leftover: Decimal; loanId: string; cycleId: string }> {
  const installment = await tx.loanAmortization.findUniqueOrThrow({
    where: { id: params.installmentId },
    include: {
      loan: {
        include: {
          amortizations: { select: { id: true, status: true } },
        },
      },
    },
  });

  const effectivePenalty = Decimal.max(
    0,
    toMoney(installment.penaltyAmount.toString()).minus(
      installment.penaltyWaivedAmount?.toString() ?? "0",
    ),
  );

  const allocation = allocatePayment(params.amount, {
    penaltyAmount: effectivePenalty,
    interestComponent: installment.interestComponent.toString(),
    principalComponent: installment.principalComponent.toString(),
    amountPaid: installment.amountPaid.toString(),
  });

  const applied = toMoney(
    allocation.toPenalty.plus(allocation.toInterest).plus(allocation.toPrincipal),
  );
  const newAmountPaid = toMoney(installment.amountPaid.toString()).plus(applied);
  const duesAfter = remainingDues({
    penaltyAmount: effectivePenalty,
    interestComponent: installment.interestComponent.toString(),
    principalComponent: installment.principalComponent.toString(),
    amountPaid: newAmountPaid,
  });
  const amortStatus = duesAfter.totalDue.lte(0)
    ? "PAID"
    : newAmountPaid.gt(0)
      ? installment.status === "OVERDUE"
        ? "OVERDUE"
        : "PARTIAL"
      : installment.status;

  await tx.loanAmortization.update({
    where: { id: installment.id },
    data: {
      amountPaid: new Prisma.Decimal(newAmountPaid.toFixed(2)),
      status: amortStatus,
    },
  });

  const loan = installment.loan;
  const scope = `Installment #${installment.installmentNumber} · ${formatKinsenaDueLabel(installment.dueDate)}`;
  const ledgerBase = {
    cycleId: loan.cycleId,
    userId: params.userId,
    paymentSubmissionId: params.paymentSubmissionId,
    loanId: loan.id,
    createdById: params.createdById,
  };

  if (allocation.toPenalty.gt(0)) {
    await tx.ledgerEntry.create({
      data: {
        ...ledgerBase,
        entryType: "PENALTY_INCOME_IN",
        amount: new Prisma.Decimal(allocation.toPenalty.toFixed(2)),
        description: `Late fee · ${scope} · ref ${params.referenceNumber}`,
      },
    });
  }
  if (allocation.toInterest.gt(0)) {
    await tx.ledgerEntry.create({
      data: {
        ...ledgerBase,
        entryType: "INTEREST_INCOME_IN",
        amount: new Prisma.Decimal(allocation.toInterest.toFixed(2)),
        description: `Interest · ${scope} · ref ${params.referenceNumber}`,
      },
    });
  }
  if (allocation.toPrincipal.gt(0)) {
    await tx.ledgerEntry.create({
      data: {
        ...ledgerBase,
        entryType: "PRINCIPAL_REPAYMENT_IN",
        amount: new Prisma.Decimal(allocation.toPrincipal.toFixed(2)),
        description: `Principal · ${scope} · ref ${params.referenceNumber}`,
      },
    });
  }

  const unpaidSibling = loan.amortizations.some(
    (a) => a.id !== installment.id && a.status !== "PAID",
  );
  if (amortStatus === "PAID" && !unpaidSibling) {
    await tx.loan.update({
      where: { id: loan.id },
      data: { status: "COMPLETED" },
    });
  }

  return {
    leftover: allocation.leftover,
    loanId: loan.id,
    cycleId: loan.cycleId,
  };
}

/** Oldest-first loan installment waterfall after live fee sync. */
async function applyLoanWaterfall(
  tx: Tx,
  params: {
    loanId: string;
    userId: string;
    amount: Decimal;
    paidAt: Date;
    paymentSubmissionId: string;
    referenceNumber: string;
    createdById: string;
  },
): Promise<{ plan: WaterfallPlan; leftover: Decimal; cycleId: string }> {
  const openRows = await tx.loanAmortization.findMany({
    where: {
      loanId: params.loanId,
      status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
    },
    orderBy: { installmentNumber: "asc" },
    include: {
      loan: { select: { cycleId: true } },
    },
  });

  for (const row of openRows) {
    await syncLoanInstallmentPenaltyAtSubmit(tx, row.id, params.paidAt);
  }

  const refreshed = await tx.loanAmortization.findMany({
    where: {
      loanId: params.loanId,
      status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
    },
    orderBy: { installmentNumber: "asc" },
    include: {
      loan: { select: { cycleId: true } },
    },
  });

  const obligations = refreshed
    .map((row) =>
      loanWaterfallObligation({
        id: row.id,
        label: `Installment #${row.installmentNumber}`,
        penaltyAmount: row.penaltyAmount.toString(),
        interestComponent: row.interestComponent.toString(),
        principalComponent: row.principalComponent.toString(),
        amountPaid: row.amountPaid.toString(),
      }),
    )
    .filter((row): row is NonNullable<typeof row> => row != null);

  const plan = planPaymentWaterfall(params.amount, obligations);
  let cycleId = refreshed[0]?.loan.cycleId;

  for (const line of plan.lines) {
    const result = await applyLoanInstallmentPayment(tx, {
      installmentId: line.id,
      userId: params.userId,
      paymentSubmissionId: params.paymentSubmissionId,
      referenceNumber: params.referenceNumber,
      createdById: params.createdById,
      amount: toMoney(line.applied),
    });
    cycleId = result.cycleId;
  }

  const allocationSummary = formatWaterfallPreview(plan).join("\n");
  await tx.paymentSubmission.update({
    where: { id: params.paymentSubmissionId },
    data: {
      loanAmortizationId: plan.primaryTargetId,
      contributionId: null,
      allocationSummary: allocationSummary || null,
    },
  });

  if (!cycleId) {
    const loan = await tx.loan.findUniqueOrThrow({
      where: { id: params.loanId },
      select: { cycleId: true },
    });
    cycleId = loan.cycleId;
  }

  return { plan, leftover: toMoney(plan.prepaid), cycleId };
}

async function creditPrepaid(
  tx: Tx,
  params: {
    userId: string;
    cycleId: string;
    amount: Decimal;
    paymentSubmissionId: string;
    referenceNumber: string;
    createdById: string;
  },
): Promise<void> {
  if (params.amount.lte(0)) return;

  await tx.user.update({
    where: { id: params.userId },
    data: {
      prepaidCredit: {
        increment: new Prisma.Decimal(params.amount.toFixed(2)),
      },
    },
  });

  // Book cash once here. Applying prepaid to future kinsenas must not
  // create another CONTRIBUTION_IN (would double-count Rule #1 cash / equity).
  await tx.ledgerEntry.create({
    data: {
      cycleId: params.cycleId,
      userId: params.userId,
      paymentSubmissionId: params.paymentSubmissionId,
      entryType: "CONTRIBUTION_IN",
      amount: new Prisma.Decimal(params.amount.toFixed(2)),
      description: `Prepaid credit (unallocated advance) · ref ${params.referenceNumber}`,
      createdById: params.createdById,
    },
  });
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
    const verifier = await requireAppUser(["TREASURER"]);
    const parsed = verifySchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid verification input.");
    }

    const { submissionId, decision } = parsed.data;
    const remarks = parsed.data.remarks?.trim() ?? "";

    if (decision === "REJECTED" && !remarks) {
      return fail("Remarks are required when rejecting a submission.");
    }

    // Open advance kinsenas before the verify transaction when contributions
    // need coverage for this credit amount (uses global prisma, not tx).
    if (decision === "VERIFIED") {
      const peek = await prisma.paymentSubmission.findUnique({
        where: { id: submissionId },
        select: {
          status: true,
          targetType: true,
          amount: true,
          paidAt: true,
          createdAt: true,
          userId: true,
          contribution: { select: { cycleId: true } },
        },
      });
      if (
        peek?.status === "PENDING_VERIFICATION" &&
        peek.targetType === "CONTRIBUTION" &&
        peek.contribution
      ) {
        const creditSource =
          parsed.data.creditedAmount ?? peek.amount.toString();
        await ensureContributionCoverageForAmount({
          userId: peek.userId,
          cycleId: peek.contribution.cycleId,
          paymentAmount: creditSource,
          openedById: verifier.id,
          asOf: peek.paidAt ?? peek.createdAt,
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
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

      const creditSource =
        parsed.data.creditedAmount ?? pending.amount.toString();
      const amount = toMoney(creditSource);
      if (amount.lte(0)) {
        throw new Error("Credited amount must be greater than zero.");
      }

      const channel = (parsed.data.paymentChannel ??
        pending.paymentChannel) as PaymentChannel;
      const referenceNumber =
        parsed.data.referenceNumber?.trim() ?? pending.referenceNumber;
      const paidAt = pending.paidAt ?? pending.createdAt;

      const claimed = await tx.paymentSubmission.updateMany({
        where: { id: submissionId, status: "PENDING_VERIFICATION" },
        data: {
          status: "VERIFIED",
          verifiedById: verifier.id,
          verifiedAt: now,
          remarks: remarks || null,
          amount: new Prisma.Decimal(amount.toFixed(2)),
          paymentChannel: channel,
          referenceNumber,
        },
      });
      if (claimed.count !== 1) {
        throw new Error("Submission was already processed by another treasurer.");
      }

      if (pending.targetType === "CONTRIBUTION") {
        const cycleId =
          pending.contribution?.cycleId ??
          (
            await tx.contribution.findFirst({
              where: { userId: pending.userId },
              orderBy: { dueDate: "desc" },
              select: { cycleId: true },
            })
          )?.cycleId;
        if (!cycleId) {
          throw new Error("No contribution cycle found for this member.");
        }

        const { leftover } = await applyContributionWaterfall(tx, {
          userId: pending.userId,
          cycleId,
          amount,
          paidAt,
          paymentSubmissionId: pending.id,
          referenceNumber,
          createdById: verifier.id,
        });

        await creditPrepaid(tx, {
          userId: pending.userId,
          cycleId,
          amount: leftover,
          paymentSubmissionId: pending.id,
          referenceNumber,
          createdById: verifier.id,
        });

        return { status: "VERIFIED" as const };
      }

      if (!pending.loanAmortization) {
        throw new Error("Loan amortization target is missing on this submission.");
      }

      const { leftover, cycleId } = await applyLoanWaterfall(tx, {
        loanId: pending.loanAmortization.loanId,
        userId: pending.userId,
        amount,
        paidAt,
        paymentSubmissionId: pending.id,
        referenceNumber,
        createdById: verifier.id,
      });

      await creditPrepaid(tx, {
        userId: pending.userId,
        cycleId,
        amount: leftover,
        paymentSubmissionId: pending.id,
        referenceNumber,
        createdById: verifier.id,
      });

      return { status: "VERIFIED" as const };
    });

    revalidatePath("/verify");
    revalidatePath("/dashboard");
    revalidatePath("/pay");
    revalidatePath("/audit");
    revalidatePath("/loans");

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

/** Preview remaining dues for treasurer UI (no writes). */
export async function previewContributionAllocation(
  contributionId: string,
  creditedAmount: string,
): Promise<
  ActionResult<{
    toPenalty: string;
    toPrincipal: string;
    leftover: string;
    remainingAfter: string;
  }>
> {
  try {
    await requireAppUser(["TREASURER"]);
    const contribution = await prisma.contribution.findUniqueOrThrow({
      where: { id: contributionId },
    });
    const waived = contribution.penaltyWaivedAmount?.toString() ?? "0";
    const allocation = allocateContributionPayment(creditedAmount, {
      amountDue: contribution.amountDue.toString(),
      amountPaid: contribution.amountPaid.toString(),
      penaltyAmount: contribution.penaltyAmount.toString(),
      penaltyWaivedAmount: waived,
    });
    const newPaid = toMoney(contribution.amountPaid.toString()).plus(
      allocation.toPenalty.plus(allocation.toPrincipal),
    );
    const remaining = remainingContributionDues({
      amountDue: contribution.amountDue.toString(),
      amountPaid: newPaid,
      penaltyAmount: contribution.penaltyAmount.toString(),
      penaltyWaivedAmount: waived,
    });
    return ok({
      toPenalty: allocation.toPenalty.toFixed(2),
      toPrincipal: allocation.toPrincipal.toFixed(2),
      leftover: allocation.leftover.toFixed(2),
      remainingAfter: remaining.totalDue.toFixed(2),
    });
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Failed to preview allocation.",
    );
  }
}
