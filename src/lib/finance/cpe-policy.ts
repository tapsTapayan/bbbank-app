import { Decimal } from "decimal.js";
import { formatPHP, remainingDues, toMoney } from "./loan-calculator";

/** Configure Decimal for banker's-friendly 2-decimal currency math (PHP). */
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ─── CPE Policy Constants (Rules #1–#4) ───────────────────────────────────────

/** Rule #4: ₱250 / head / kinsenas */
export const CONTRIBUTION_PER_HEAD_KINSENAS = new Decimal(250);

/** Rule #3: ₱10 / head / day after grace */
export const LATE_FEE_PER_HEAD_PER_DAY = new Decimal(10);

/** Rule #3: calendar days after due date before penalties accrue */
export const GRACE_PERIOD_DAYS = 2;

/** Rule #2: flat 10% of principal for the full 2-month term */
export const LOAN_FLAT_INTEREST_RATE = new Decimal("0.10");

/** Rule #2: fixed term length in months */
export const LOAN_TERM_MONTHS = 2;

/** Rule #1: max loanable = (monthly collectibles × ratio) × heads */
export const MAX_LOANABLE_POOL_RATIO = new Decimal("0.50");

export type RepaymentFrequency = "KINSENAS" | "MONTHLY";

export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export type LoanBlockingStatus =
  | "PENDING"
  | "APPROVED"
  | "ACTIVE"
  | "DEFAULTED";

export type LateFeeBreakdown = {
  dueDate: Date;
  asOf: Date;
  graceDeadline: Date;
  gracePeriodDays: number;
  calendarDaysPastDue: number;
  chargeableDays: number;
  headsCount: number;
  ratePerHeadPerDay: Decimal;
  penaltyAmount: Decimal;
  isWithinGrace: boolean;
  isOverdue: boolean;
};

export type MaxLoanableResult = {
  totalMonthlyCollectibles: Decimal;
  memberHeadsCount: number;
  policyCap: Decimal;
  availableCashPool: Decimal;
  maxLoanable: Decimal;
  limitedBy: "POLICY" | "CASH" | "BOTH";
};

export type LoanScheduleInstallment = {
  installmentNumber: number;
  dueDate: Date;
  graceDeadline: Date;
  principalComponent: Decimal;
  interestComponent: Decimal;
  totalDue: Decimal;
  remainingPrincipal: Decimal;
};

export type LoanScheduleResult = {
  principal: Decimal;
  interestTotal: Decimal;
  totalPayable: Decimal;
  interestRate: Decimal;
  termMonths: number;
  repaymentFrequency: RepaymentFrequency;
  installmentCount: number;
  installments: LoanScheduleInstallment[];
};

export type LoanEligibilityResult = {
  eligible: boolean;
  reasons: string[];
  statusOk: boolean;
  noOverdueContributions: boolean;
  noBlockingLoans: boolean;
};

/** Calendar date at local midnight (strips time-of-day for day-count math). */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Inclusive calendar-day difference: asOf − fromDate (can be negative). */
export function calendarDaysBetween(fromDate: Date, asOf: Date): number {
  const a = startOfLocalDay(fromDate).getTime();
  const b = startOfLocalDay(asOf).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function addCalendarDays(date: Date, days: number): Date {
  // Prefer UTC calendar parts when the value is a `@db.Date` (UTC midnight);
  // fall back to local parts for wall-clock timestamps.
  const isDateOnly =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;
  if (isDateOnly) {
    return dateOnlyUTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
    );
  }
  const result = startOfLocalDay(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Last calendar day of the given month (0-indexed month).
 * February returns 28 or 29.
 */
export function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Calendar date at UTC midnight for Prisma `@db.Date` columns (timezone-safe).
 */
export function dateOnlyUTC(
  year: number,
  monthIndex: number,
  day: number,
): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

/**
 * Kinsenas due dates for a calendar month.
 * - Index 1 → 15th
 * - Index 2 → 30th, or last day of February when Feb has < 30 days
 */
export function getKinsenaDueDate(
  year: number,
  monthIndex: number,
  kinsenaIndex: 1 | 2,
): Date {
  if (kinsenaIndex === 1) {
    return dateOnlyUTC(year, monthIndex, 15);
  }
  const last = lastDayOfMonth(year, monthIndex);
  const day = Math.min(30, last);
  return dateOnlyUTC(year, monthIndex, day);
}

export function computeGraceDeadline(
  dueDate: Date,
  gracePeriodDays: number = GRACE_PERIOD_DAYS,
): Date {
  return addCalendarDays(dueDate, gracePeriodDays);
}

/**
 * Rule #3 accrual always starts from the obligation due date (not open/create
 * day). Catch-up opens still flag `isCatchUp` for UI, but late fees use the
 * policy due → asOf − grace formula so dues reflect chargeable days after
 * policy grace has lapsed.
 */
export function effectiveDueDateForPenalty(
  dueDate: Date,
  _openedAt?: Date,
  _gracePeriodDays: number = GRACE_PERIOD_DAYS,
): Date {
  return startOfLocalDay(dueDate);
}

export type RejectedPenaltyWindow = {
  submittedAt: Date;
  rejectedAt: Date;
};

/**
 * Rule #3 accrual clock: freeze at PENDING submit; after REJECTED, exclude the
 * pending window so those calendar days are not charged.
 */
export function effectiveAsOfForPenaltyAccrual(input: {
  now: Date;
  pendingSubmittedAt?: Date | null;
  rejectedWindows?: ReadonlyArray<RejectedPenaltyWindow>;
}): Date {
  if (input.pendingSubmittedAt) {
    return input.pendingSubmittedAt;
  }

  let pausedDays = 0;
  for (const window of input.rejectedWindows ?? []) {
    pausedDays += Math.max(
      0,
      calendarDaysBetween(window.submittedAt, window.rejectedAt),
    );
  }
  if (pausedDays <= 0) return input.now;
  return addCalendarDays(input.now, -pausedDays);
}

export type LiveLateFeeResult = LateFeeBreakdown & {
  /**
   * True when the obligation was opened after policy grace already elapsed
   * (year-to-date catch-up). Accrual still follows Rule #3 from due date.
   */
  isCatchUp: boolean;
  /** Original dueDate + gracePeriodDays (what the UI should show as grace end). */
  policyGraceDeadline: Date;
};

/** Obligation opened on the books after its calendar grace already ended. */
export function isCatchUpOpen(
  dueDate: Date,
  openedAt: Date,
  gracePeriodDays: number = GRACE_PERIOD_DAYS,
): boolean {
  const policyDue = startOfLocalDay(dueDate);
  const opened = startOfLocalDay(openedAt);
  return opened > computeGraceDeadline(policyDue, gracePeriodDays);
}

/**
 * Live Rule #3 fee with pending freeze + reject resume.
 * Catch-up opens are flagged but do not change the due-date accrual clock.
 */
export function computeLiveLateFee(params: {
  dueDate: Date;
  openedAt: Date;
  headsCount: number;
  now: Date;
  gracePeriodDays?: number;
  ratePerHeadPerDay?: Decimal.Value;
  pendingSubmittedAt?: Date | null;
  rejectedWindows?: ReadonlyArray<RejectedPenaltyWindow>;
}): LiveLateFeeResult {
  const gracePeriodDays = params.gracePeriodDays ?? GRACE_PERIOD_DAYS;
  const policyGraceDeadline = computeGraceDeadline(
    params.dueDate,
    gracePeriodDays,
  );
  const isCatchUp = isCatchUpOpen(
    params.dueDate,
    params.openedAt,
    gracePeriodDays,
  );
  const penaltyDue = effectiveDueDateForPenalty(params.dueDate);
  const asOf = effectiveAsOfForPenaltyAccrual({
    now: params.now,
    pendingSubmittedAt: params.pendingSubmittedAt,
    rejectedWindows: params.rejectedWindows,
  });
  const fee = calculateKinsenaLateFee(penaltyDue, asOf, params.headsCount, {
    gracePeriodDays,
    ratePerHeadPerDay: params.ratePerHeadPerDay,
  });
  return {
    ...fee,
    graceDeadline: policyGraceDeadline,
    isCatchUp,
    policyGraceDeadline,
    // Catch-up rows are past policy grace by definition — never “In grace”.
    isWithinGrace: isCatchUp ? false : fee.isWithinGrace,
  };
}

/** Human label for a kinsenas due date, e.g. "15 Jan 2026" / "28 Feb 2026". */
export function formatKinsenaDueLabel(dueDate: Date): string {
  const y = dueDate.getUTCFullYear();
  const m = dueDate.getUTCMonth();
  const d = dueDate.getUTCDate();
  const month = new Date(Date.UTC(y, m, 1)).toLocaleDateString("en-PH", {
    month: "short",
    timeZone: "UTC",
  });
  return `${d} ${month} ${y}`;
}

/** Period range label, e.g. "Jan 1–15" / "Jan 16–30". */
export function formatKinsenaPeriodScope(
  dueDate: Date,
  kinsenaIndex: 1 | 2,
): string {
  const month = dueDate.toLocaleDateString("en-PH", {
    month: "short",
    timeZone: "UTC",
  });
  if (kinsenaIndex === 1) return `${month} 1–15`;
  return `${month} 16–${dueDate.getUTCDate()}`;
}

/** Month heading for grouping, e.g. "January 2026". */
export function formatKinsenaMonthLabel(dueDate: Date): string {
  return dueDate.toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Rule #4: kinsenas due = per-head amount × headsCount (default ₱250). */
export function calculateKinsenasDue(
  headsCount: number,
  perHeadAmount: Decimal.Value = CONTRIBUTION_PER_HEAD_KINSENAS,
): Decimal {
  if (!Number.isInteger(headsCount) || headsCount < 1) {
    throw new Error("headsCount must be an integer >= 1");
  }
  return toMoney(toMoney(perHeadAmount).mul(headsCount));
}

/**
 * Rule #3 late fee.
 *
 * chargeableDays = max(0, calendarDays(dueDate → asOf) − gracePeriodDays)
 * Example: due Mar 15, paid Mar 20 → 5 − 2 = 3 days → 3 × ₱10 × heads
 *
 * Pass `submittedAt` as `asOf` to freeze accrual when a valid receipt is pending.
 * After rejection, call again with `now` to resume.
 */
export function calculateKinsenaLateFee(
  dueDate: Date,
  asOf: Date,
  headsCount: number,
  options?: { gracePeriodDays?: number; ratePerHeadPerDay?: Decimal.Value },
): LateFeeBreakdown {
  if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) {
    throw new Error("dueDate must be a valid Date");
  }
  if (!(asOf instanceof Date) || Number.isNaN(asOf.getTime())) {
    throw new Error("asOf / submittedAt must be a valid Date");
  }
  if (!Number.isInteger(headsCount) || headsCount < 1) {
    throw new Error("headsCount must be an integer >= 1");
  }

  const gracePeriodDays = options?.gracePeriodDays ?? GRACE_PERIOD_DAYS;
  const rate = toMoney(options?.ratePerHeadPerDay ?? LATE_FEE_PER_HEAD_PER_DAY);
  const graceDeadline = computeGraceDeadline(dueDate, gracePeriodDays);
  const calendarDaysPastDue = calendarDaysBetween(dueDate, asOf);
  const chargeableDays = Math.max(0, calendarDaysPastDue - gracePeriodDays);
  const penaltyAmount = toMoney(rate.mul(headsCount).mul(chargeableDays));
  const isWithinGrace =
    calendarDaysPastDue >= 0 && calendarDaysPastDue <= gracePeriodDays;
  const isOverdue = chargeableDays > 0;

  return {
    dueDate: startOfLocalDay(dueDate),
    asOf: startOfLocalDay(asOf),
    graceDeadline,
    gracePeriodDays,
    calendarDaysPastDue,
    chargeableDays,
    headsCount,
    ratePerHeadPerDay: rate,
    penaltyAmount,
    isWithinGrace,
    isOverdue,
  };
}

/**
 * Rule #1 max loanable amount.
 * policyCap = (totalMonthlyCollectibles × 0.50) × memberHeadsCount
 * maxLoanable = min(policyCap, availableCashPool)
 */
export function calculateMaxLoanableAmount(
  totalMonthlyCollectibles: Decimal.Value,
  memberHeadsCount: number,
  availableCashPool: Decimal.Value,
  poolRatio: Decimal.Value = MAX_LOANABLE_POOL_RATIO,
): MaxLoanableResult {
  if (!Number.isInteger(memberHeadsCount) || memberHeadsCount < 1) {
    throw new Error("memberHeadsCount must be an integer >= 1");
  }

  const collectibles = toMoney(totalMonthlyCollectibles);
  const cash = toMoney(availableCashPool);
  const ratio = new Decimal(poolRatio);

  if (collectibles.lt(0) || cash.lt(0)) {
    throw new Error("collectibles and cash pool must be >= 0");
  }
  if (ratio.lte(0) || ratio.gt(1)) {
    throw new Error("poolRatio must be in (0, 1]");
  }

  const policyCap = toMoney(collectibles.mul(ratio).mul(memberHeadsCount));
  const maxLoanable = toMoney(Decimal.min(policyCap, cash));

  let limitedBy: MaxLoanableResult["limitedBy"] = "POLICY";
  if (policyCap.eq(cash)) {
    limitedBy = "BOTH";
  } else if (cash.lt(policyCap)) {
    limitedBy = "CASH";
  }

  return {
    totalMonthlyCollectibles: collectibles,
    memberHeadsCount,
    policyCap,
    availableCashPool: cash,
    maxLoanable,
    limitedBy,
  };
}

function nextKinsenaDueAfter(from: Date): Date {
  const start = startOfLocalDay(from);
  const year = start.getFullYear();
  const month = start.getMonth();

  const mid = getKinsenaDueDate(year, month, 1);
  if (mid > start) return mid;

  const end = getKinsenaDueDate(year, month, 2);
  if (end > start) return end;

  // Roll to next month's 15th
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  return getKinsenaDueDate(nextYear, nextMonth, 1);
}

function addMonthsClamped(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() < day) {
    result.setDate(0);
  }
  return startOfLocalDay(result);
}

/**
 * Rule #2: 2-month flat 10% loan schedule.
 * - KINSENAS → 4 equal installments on successive 15th/30th (or Feb last day)
 * - MONTHLY → 2 equal monthly amortizations
 */
export function generate2MonthLoanSchedule(
  principal: Decimal.Value,
  disbursementDate: Date,
  repaymentFrequency: RepaymentFrequency,
  options?: {
    interestRate?: Decimal.Value;
    termMonths?: number;
    gracePeriodDays?: number;
  },
): LoanScheduleResult {
  const principalMoney = toMoney(principal);
  const interestRate = new Decimal(
    options?.interestRate ?? LOAN_FLAT_INTEREST_RATE,
  );
  const termMonths = options?.termMonths ?? LOAN_TERM_MONTHS;
  const gracePeriodDays = options?.gracePeriodDays ?? GRACE_PERIOD_DAYS;

  if (principalMoney.lte(0)) {
    throw new Error("principal must be greater than zero");
  }
  if (interestRate.lt(0)) {
    throw new Error("interestRate must be >= 0");
  }
  if (termMonths !== 2) {
    throw new Error("CPE policy requires a 2-month loan term");
  }
  if (
    !(disbursementDate instanceof Date) ||
    Number.isNaN(disbursementDate.getTime())
  ) {
    throw new Error("disbursementDate must be a valid Date");
  }

  const interestTotal = toMoney(principalMoney.mul(interestRate));
  const totalPayable = toMoney(principalMoney.plus(interestTotal));
  const installmentCount = repaymentFrequency === "KINSENAS" ? 4 : 2;

  const basePrincipal = toMoney(principalMoney.div(installmentCount));
  const baseInterest = toMoney(interestTotal.div(installmentCount));

  const dueDates: Date[] = [];
  if (repaymentFrequency === "KINSENAS") {
    let cursor = startOfLocalDay(disbursementDate);
    for (let i = 0; i < installmentCount; i++) {
      const due = nextKinsenaDueAfter(cursor);
      dueDates.push(due);
      cursor = due;
    }
  } else {
    for (let i = 1; i <= installmentCount; i++) {
      dueDates.push(addMonthsClamped(disbursementDate, i));
    }
  }

  let allocatedPrincipal = new Decimal(0);
  let allocatedInterest = new Decimal(0);
  const installments: LoanScheduleInstallment[] = [];

  for (let i = 0; i < installmentCount; i++) {
    const isLast = i === installmentCount - 1;
    const principalComponent = isLast
      ? toMoney(principalMoney.minus(allocatedPrincipal))
      : basePrincipal;
    const interestComponent = isLast
      ? toMoney(interestTotal.minus(allocatedInterest))
      : baseInterest;

    allocatedPrincipal = allocatedPrincipal.plus(principalComponent);
    allocatedInterest = allocatedInterest.plus(interestComponent);

    const dueDate = dueDates[i]!;
    installments.push({
      installmentNumber: i + 1,
      dueDate,
      graceDeadline: computeGraceDeadline(dueDate, gracePeriodDays),
      principalComponent,
      interestComponent,
      totalDue: toMoney(principalComponent.plus(interestComponent)),
      remainingPrincipal: toMoney(principalMoney.minus(allocatedPrincipal)),
    });
  }

  return {
    principal: principalMoney,
    interestTotal,
    totalPayable,
    interestRate,
    termMonths,
    repaymentFrequency,
    installmentCount,
    installments,
  };
}

/**
 * Rule #5 overdue gate: status OVERDUE, or past grace with unpaid balance
 * after Penalties → Principal unwind (amountPaid may include late fees).
 */
export function isBlockingOverdueContribution(
  contribution: {
    status: string;
    graceDeadline: Date;
    amountDue: Decimal.Value;
    amountPaid: Decimal.Value;
    penaltyAmount?: Decimal.Value;
    penaltyWaivedAmount?: Decimal.Value;
  },
  asOf: Date = new Date(),
): boolean {
  const penalty = effectivePenaltyAmount(
    contribution.penaltyAmount ?? 0,
    contribution.penaltyWaivedAmount ?? 0,
  );
  const dues = remainingDues({
    penaltyAmount: penalty,
    interestComponent: 0,
    principalComponent: contribution.amountDue,
    amountPaid: contribution.amountPaid,
  });
  if (dues.totalDue.lte(0)) return false;
  if (contribution.status === "OVERDUE") return true;
  return startOfLocalDay(contribution.graceDeadline) < startOfLocalDay(asOf);
}

/**
 * Rule #5: only ACTIVE members with zero overdue contributions and no
 * pending/approved/active/defaulted loans may request a new loan.
 */
export function checkMemberLoanEligibility(
  user: { status: UserStatus },
  overdueContributions: ReadonlyArray<{ id: string }>,
  activeLoans: ReadonlyArray<{ status: LoanBlockingStatus | string }>,
): LoanEligibilityResult {
  const blocking = new Set<string>([
    "PENDING",
    "APPROVED",
    "ACTIVE",
    "DEFAULTED",
  ]);

  const statusOk = user.status === "ACTIVE";
  const noOverdueContributions = overdueContributions.length === 0;
  const noBlockingLoans = !activeLoans.some((loan) =>
    blocking.has(loan.status),
  );

  const reasons: string[] = [];
  if (!statusOk) {
    reasons.push(`Member status must be ACTIVE (currently ${user.status}).`);
  }
  if (!noOverdueContributions) {
    reasons.push(
      `Member has ${overdueContributions.length} overdue kinsenas contribution(s).`,
    );
  }
  if (!noBlockingLoans) {
    reasons.push(
      "Member already has a pending, approved, active, or defaulted loan.",
    );
  }

  return {
    eligible: statusOk && noOverdueContributions && noBlockingLoans,
    reasons,
    statusOk,
    noOverdueContributions,
    noBlockingLoans,
  };
}

/** Effective late fee after passes (waivers). */
export function effectivePenaltyAmount(
  penaltyAmount: Decimal.Value,
  penaltyWaivedAmount: Decimal.Value = 0,
): Decimal {
  return toMoney(
    Decimal.max(0, toMoney(penaltyAmount).minus(penaltyWaivedAmount)),
  );
}

/** Human-readable late-fee line for UI / treasurer verify. */
export function formatLateFeeBreakdown(fee: LateFeeBreakdown): string {
  if (fee.chargeableDays === 0) {
    if (fee.isWithinGrace) {
      return `Within ${fee.gracePeriodDays}-day grace (deadline ${fee.graceDeadline.toLocaleDateString("en-PH")}) — no late fee yet.`;
    }
    return "No late fee.";
  }
  return `${fee.chargeableDays} day(s) × ${formatPHP(fee.ratePerHeadPerDay)} × ${fee.headsCount} head(s) = ${formatPHP(fee.penaltyAmount)}`;
}

/** Total monthly collectibles helper: sum of all members' ₱250 × heads × 2 kinsenas. */
export function calculateTotalMonthlyCollectibles(
  memberHeadsCounts: ReadonlyArray<number>,
): Decimal {
  const perKinsenas = memberHeadsCounts.reduce(
    (sum, heads) => sum.plus(calculateKinsenasDue(heads)),
    new Decimal(0),
  );
  return toMoney(perKinsenas.mul(2));
}

export { formatPHP, toMoney };
