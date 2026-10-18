"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAppUser } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import {
  currentKinsenaPeriod,
  nextKinsenaPeriod,
  openKinsenaPeriod,
  openPayableContributionWindow,
  type OpenKinsenaResult,
} from "@/lib/finance/contribution-generator";

const openSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  monthIndex: z.number().int().min(0).max(11),
  kinsenaIndex: z.union([z.literal(1), z.literal(2)]),
  cycleId: z.string().optional(),
});

export type OpenKinsenaPeriodInput = z.infer<typeof openSchema>;

export async function openKinsenaPeriodAction(
  input: OpenKinsenaPeriodInput,
): Promise<ActionResult<OpenKinsenaResult>> {
  try {
    const actor = await requireAppUser(["TREASURER", "ADMIN"]);
    const parsed = openSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid period.");
    }

    const result = await openKinsenaPeriod({
      ...parsed.data,
      openedById: actor.id,
    });

    revalidatePath("/pay");
    revalidatePath("/dashboard");
    revalidatePath("/members");
    revalidatePath("/verify");
    revalidatePath("/kinsenas");

    return ok(
      result,
      `Opened kinsena ${result.kinsenaIndex}: ${result.created} created, ${result.skippedExisting} already existed.`,
    );
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Failed to open kinsena period.",
    );
  }
}

export async function openCurrentKinsenaAction(): Promise<
  ActionResult<OpenKinsenaResult>
> {
  const period = currentKinsenaPeriod();
  return openKinsenaPeriodAction(period);
}

export async function openNextKinsenaAction(): Promise<
  ActionResult<OpenKinsenaResult>
> {
  const period = nextKinsenaPeriod();
  return openKinsenaPeriodAction(period);
}

/** Opens year-to-date kinsenas through next period (catch-up + monthly + advance). */
export async function openPayableWindowAction(): Promise<
  ActionResult<{ createdTotal: number }>
> {
  try {
    const actor = await requireAppUser(["TREASURER", "ADMIN"]);
    const opened = await openPayableContributionWindow({
      openedById: actor.id,
    });
    revalidatePath("/pay");
    revalidatePath("/dashboard");
    revalidatePath("/kinsenas");
    revalidatePath("/verify");
    return ok(
      { createdTotal: opened.createdTotal },
      `Opened year-to-date through next period · ${opened.createdTotal} new obligation(s).`,
    );
  } catch (error) {
    return fail(
      error instanceof Error
        ? error.message
        : "Failed to open payable contribution window.",
    );
  }
}
