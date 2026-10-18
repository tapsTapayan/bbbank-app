"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { Decimal } from "decimal.js";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireAppUser } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { toMoney } from "@/lib/finance/loan-calculator";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const targetSchema = z.object({
  targetType: z.enum(["CONTRIBUTION", "LOAN_AMORTIZATION"]),
  targetId: z.string().min(1),
});

const reasonSchema = z.string().trim().min(3, "Reason is required (min 3 chars).");

const singleSchema = targetSchema.extend({ reason: reasonSchema });
const bulkSchema = z.object({
  targets: z.array(targetSchema).min(1),
  reason: reasonSchema,
});
const allSchema = z.object({
  reason: reasonSchema,
  includeContributions: z.boolean().default(true),
  includeLoans: z.boolean().default(true),
});

export type WaiveResult = {
  waived: number;
  skipped: number;
  batchId: string;
  totalWaived: string;
};

async function assertNoAuditedPayment(
  tx: Prisma.TransactionClient,
  contributionId: string | null,
  loanAmortizationId: string | null,
): Promise<void> {
  const audited = await tx.paymentSubmission.findFirst({
    where: {
      status: "AUDITED",
      ...(contributionId ? { contributionId } : {}),
      ...(loanAmortizationId ? { loanAmortizationId } : {}),
    },
    select: { id: true },
  });
  if (audited) {
    throw new Error("Cannot waive fees on an audited obligation.");
  }
}

async function assertPenaltyNotCollected(
  tx: Prisma.TransactionClient,
  contributionId: string | null,
  loanAmortizationId: string | null,
): Promise<void> {
  const collected = await tx.ledgerEntry.findFirst({
    where: {
      entryType: "PENALTY_INCOME_IN",
      paymentSubmission: {
        ...(contributionId ? { contributionId } : {}),
        ...(loanAmortizationId ? { loanAmortizationId } : {}),
      },
    },
    select: { id: true },
  });
  if (collected) {
    throw new Error(
      "Late fee already collected on a verified payment; use audit reverse instead.",
    );
  }
}

async function waiveOne(
  tx: Prisma.TransactionClient,
  params: {
    targetType: "CONTRIBUTION" | "LOAN_AMORTIZATION";
    targetId: string;
    reason: string;
    scope: "SINGLE" | "BULK" | "ALL";
    batchId: string;
    issuedById: string;
  },
): Promise<{ waived: boolean; amount: Decimal }> {
  if (params.targetType === "CONTRIBUTION") {
    const row = await tx.contribution.findUnique({
      where: { id: params.targetId },
    });
    if (!row) return { waived: false, amount: new Decimal(0) };

    const effective = toMoney(row.penaltyAmount.toString());
    if (effective.lte(0) || row.penaltyAccrualFrozen) {
      return { waived: false, amount: new Decimal(0) };
    }

    await assertNoAuditedPayment(tx, row.id, null);
    await assertPenaltyNotCollected(tx, row.id, null);

    await tx.contribution.update({
      where: { id: row.id },
      data: {
        penaltyWaivedAmount: new Prisma.Decimal(
          toMoney(row.penaltyWaivedAmount?.toString() ?? "0")
            .plus(effective)
            .toFixed(2),
        ),
        penaltyAmount: new Prisma.Decimal(0),
        penaltyAccrualFrozen: true,
        daysDelayed: row.daysDelayed,
      },
    });

    await tx.penaltyWaiver.create({
      data: {
        cycleId: row.cycleId,
        targetType: "CONTRIBUTION",
        contributionId: row.id,
        amountWaived: new Prisma.Decimal(effective.toFixed(2)),
        reason: params.reason,
        scope: params.scope,
        batchId: params.batchId,
        issuedById: params.issuedById,
      },
    });

    return { waived: true, amount: effective };
  }

  const row = await tx.loanAmortization.findUnique({
    where: { id: params.targetId },
    include: { loan: { select: { cycleId: true } } },
  });
  if (!row) return { waived: false, amount: new Decimal(0) };

  const effective = toMoney(row.penaltyAmount.toString());
  if (effective.lte(0) || row.penaltyAccrualFrozen) {
    return { waived: false, amount: new Decimal(0) };
  }

  await assertNoAuditedPayment(tx, null, row.id);
  await assertPenaltyNotCollected(tx, null, row.id);

  await tx.loanAmortization.update({
    where: { id: row.id },
    data: {
      penaltyWaivedAmount: new Prisma.Decimal(
        toMoney(row.penaltyWaivedAmount?.toString() ?? "0")
          .plus(effective)
          .toFixed(2),
      ),
      penaltyAmount: new Prisma.Decimal(0),
      penaltyAccrualFrozen: true,
    },
  });

  await tx.penaltyWaiver.create({
    data: {
      cycleId: row.loan.cycleId,
      targetType: "LOAN_AMORTIZATION",
      loanAmortizationId: row.id,
      amountWaived: new Prisma.Decimal(effective.toFixed(2)),
      reason: params.reason,
      scope: params.scope,
      batchId: params.batchId,
      issuedById: params.issuedById,
    },
  });

  return { waived: true, amount: effective };
}

function revalidatePassPaths() {
  revalidatePath("/passes");
  revalidatePath("/verify");
  revalidatePath("/pay");
  revalidatePath("/dashboard");
  revalidatePath("/audit");
}

export async function waivePenaltySingle(
  input: z.infer<typeof singleSchema>,
): Promise<ActionResult<WaiveResult>> {
  try {
    const actor = await requireAppUser(["TREASURER", "AUDITOR"]);
    const parsed = singleSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
    }

    const batchId = randomUUID();
    const result = await prisma.$transaction(async (tx) => {
      const one = await waiveOne(tx, {
        ...parsed.data,
        scope: "SINGLE",
        batchId,
        issuedById: actor.id,
      });
      return {
        waived: one.waived ? 1 : 0,
        skipped: one.waived ? 0 : 1,
        batchId,
        totalWaived: one.amount.toFixed(2),
      };
    });

    revalidatePassPaths();
    return ok(
      result,
      result.waived
        ? `Pass granted · ₱${result.totalWaived} waived.`
        : "Nothing to waive (already passed or zero fee).",
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to grant pass.");
  }
}

export async function waivePenaltyBulk(
  input: z.infer<typeof bulkSchema>,
): Promise<ActionResult<WaiveResult>> {
  try {
    const actor = await requireAppUser(["TREASURER", "AUDITOR"]);
    const parsed = bulkSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
    }

    const batchId = randomUUID();
    let waived = 0;
    let skipped = 0;
    let total = new Decimal(0);

    await prisma.$transaction(async (tx) => {
      for (const target of parsed.data.targets) {
        try {
          const one = await waiveOne(tx, {
            ...target,
            reason: parsed.data.reason,
            scope: "BULK",
            batchId,
            issuedById: actor.id,
          });
          if (one.waived) {
            waived += 1;
            total = total.plus(one.amount);
          } else {
            skipped += 1;
          }
        } catch {
          skipped += 1;
        }
      }
    });

    revalidatePassPaths();
    return ok(
      {
        waived,
        skipped,
        batchId,
        totalWaived: total.toFixed(2),
      },
      `Pass granted on ${waived} obligation(s) · ₱${total.toFixed(2)}.`,
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to grant bulk pass.");
  }
}

export async function waivePenaltyAll(
  input: z.infer<typeof allSchema>,
): Promise<ActionResult<WaiveResult>> {
  try {
    const actor = await requireAppUser(["TREASURER", "AUDITOR"]);
    const parsed = allSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
    }

    const targets: z.infer<typeof targetSchema>[] = [];

    if (parsed.data.includeContributions) {
      const rows = await prisma.contribution.findMany({
        where: {
          status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
          penaltyAmount: { gt: 0 },
          penaltyAccrualFrozen: false,
        },
        select: { id: true },
      });
      for (const r of rows) {
        targets.push({ targetType: "CONTRIBUTION", targetId: r.id });
      }
    }

    if (parsed.data.includeLoans) {
      const rows = await prisma.loanAmortization.findMany({
        where: {
          status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
          penaltyAmount: { gt: 0 },
          penaltyAccrualFrozen: false,
        },
        select: { id: true },
      });
      for (const r of rows) {
        targets.push({ targetType: "LOAN_AMORTIZATION", targetId: r.id });
      }
    }

    if (targets.length === 0) {
      return ok(
        { waived: 0, skipped: 0, batchId: "", totalWaived: "0.00" },
        "No open late fees to waive.",
      );
    }

    const batchId = randomUUID();
    let waived = 0;
    let skipped = 0;
    let total = new Decimal(0);

    await prisma.$transaction(async (tx) => {
      for (const target of targets) {
        try {
          const one = await waiveOne(tx, {
            ...target,
            reason: parsed.data.reason,
            scope: "ALL",
            batchId,
            issuedById: actor.id,
          });
          if (one.waived) {
            waived += 1;
            total = total.plus(one.amount);
          } else {
            skipped += 1;
          }
        } catch {
          skipped += 1;
        }
      }
    });

    revalidatePassPaths();
    return ok(
      { waived, skipped, batchId, totalWaived: total.toFixed(2) },
      `Pass all: ${waived} waived · ₱${total.toFixed(2)}.`,
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to grant pass-all.");
  }
}
