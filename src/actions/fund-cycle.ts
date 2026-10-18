"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireAppUser } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { openPayableContributionWindow } from "@/lib/finance/contribution-generator";

const upsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(120),
  contributionAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  loanInterestRate: z.string().regex(/^\d+(\.\d{1,6})?$/),
  penaltyRate: z.string().regex(/^\d+(\.\d{1,2})?$/),
  gracePeriodDays: z.number().int().min(0).max(30),
  maxLoanablePoolRatio: z.string().regex(/^\d+(\.\d{1,6})?$/),
  loanTermMonths: z.number().int().min(1).max(24),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  activate: z.boolean().optional(),
});

export async function upsertFundCycle(
  input: z.infer<typeof upsertSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const admin = await requireAppUser(["ADMIN"]);
    const parsed = upsertSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid cycle settings.");
    }

    const data = parsed.data;
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    if (!(startDate < endDate)) {
      return fail("End date must be after start date.");
    }

    const result = await prisma.$transaction(async (tx) => {
      if (data.activate) {
        await tx.fundCycle.updateMany({
          where: { isActive: true },
          data: { isActive: false },
        });
      }

      const payload = {
        name: data.name,
        contributionAmount: new Prisma.Decimal(data.contributionAmount),
        loanInterestRate: new Prisma.Decimal(data.loanInterestRate),
        penaltyRate: new Prisma.Decimal(data.penaltyRate),
        gracePeriodDays: data.gracePeriodDays,
        maxLoanablePoolRatio: new Prisma.Decimal(data.maxLoanablePoolRatio),
        loanTermMonths: data.loanTermMonths,
        startDate,
        endDate,
        ...(data.activate ? { isActive: true } : {}),
      };

      if (data.id) {
        const updated = await tx.fundCycle.update({
          where: { id: data.id },
          data: payload,
        });
        return { id: updated.id };
      }

      const created = await tx.fundCycle.create({
        data: {
          ...payload,
          isActive: data.activate ?? false,
        },
      });
      return { id: created.id };
    });

    let openedCount = 0;
    if (data.activate) {
      const opened = await openPayableContributionWindow({
        cycleId: result.id,
        openedById: admin.id,
      });
      openedCount = opened.createdTotal;
    }

    revalidatePath("/cycle");
    revalidatePath("/loans");
    revalidatePath("/pay");
    revalidatePath("/kinsenas");
    revalidatePath("/dashboard");

    return ok(
      result,
      data.activate
        ? `Fund cycle saved & activated · ${openedCount} obligation(s) opened.`
        : "Fund cycle saved.",
    );
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Failed to save fund cycle.",
    );
  }
}

export async function activateFundCycle(
  cycleId: string,
): Promise<ActionResult<{ id: string; obligationsCreated: number }>> {
  try {
    const admin = await requireAppUser(["ADMIN"]);
    await prisma.$transaction(async (tx) => {
      await tx.fundCycle.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
      await tx.fundCycle.update({
        where: { id: cycleId },
        data: { isActive: true },
      });
    });

    const opened = await openPayableContributionWindow({
      cycleId,
      openedById: admin.id,
    });

    revalidatePath("/cycle");
    revalidatePath("/kinsenas");
    revalidatePath("/pay");
    revalidatePath("/dashboard");
    return ok(
      { id: cycleId, obligationsCreated: opened.createdTotal },
      `Cycle activated · ${opened.createdTotal} contribution obligation(s) opened.`,
    );
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Failed to activate cycle.",
    );
  }
}

const startYearSchema = z.object({
  year: z.number().int().min(2000).max(2100),
});

/**
 * Starts a calendar-year sinking-fund cycle (Jan 1–Dec 31), activates it,
 * and opens year-to-date through next kinsenas so members can pay immediately.
 * Call once at the start of each fund year (after updating heads / roles).
 */
export async function startYearCycle(
  input: z.infer<typeof startYearSchema>,
): Promise<
  ActionResult<{ id: string; obligationsCreated: number; year: number }>
> {
  try {
    const admin = await requireAppUser(["ADMIN"]);
    const parsed = startYearSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid year.");
    }

    const { year } = parsed.data;
    const startDate = new Date(Date.UTC(year, 0, 1));
    const endDate = new Date(Date.UTC(year, 11, 31));

    const existing = await prisma.fundCycle.findFirst({
      where: {
        startDate: { lte: endDate },
        endDate: { gte: startDate },
        name: { contains: String(year) },
      },
    });

    let cycleId: string;

    if (existing) {
      await prisma.$transaction(async (tx) => {
        await tx.fundCycle.updateMany({
          where: { isActive: true },
          data: { isActive: false },
        });
        await tx.fundCycle.update({
          where: { id: existing.id },
          data: { isActive: true },
        });
      });
      cycleId = existing.id;
    } else {
      const created = await prisma.$transaction(async (tx) => {
        await tx.fundCycle.updateMany({
          where: { isActive: true },
          data: { isActive: false },
        });
        return tx.fundCycle.create({
          data: {
            name: `CPE ${year}`,
            contributionAmount: new Prisma.Decimal("250.00"),
            loanInterestRate: new Prisma.Decimal("0.10"),
            penaltyRate: new Prisma.Decimal("10.00"),
            gracePeriodDays: 2,
            maxLoanablePoolRatio: new Prisma.Decimal("0.50"),
            loanTermMonths: 2,
            startDate,
            endDate,
            isActive: true,
          },
        });
      });
      cycleId = created.id;
    }

    const opened = await openPayableContributionWindow({
      cycleId,
      openedById: admin.id,
    });

    revalidatePath("/cycle");
    revalidatePath("/kinsenas");
    revalidatePath("/pay");
    revalidatePath("/dashboard");
    revalidatePath("/loans");

    return ok(
      {
        id: cycleId,
        obligationsCreated: opened.createdTotal,
        year,
      },
      `CPE ${year} cycle is active · ${opened.createdTotal} obligation(s) ready for payment.`,
    );
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Failed to start year cycle.",
    );
  }
}
