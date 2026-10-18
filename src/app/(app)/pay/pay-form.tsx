"use client";

import { useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Loader2,
  Upload,
  Camera,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Banknote,
  Receipt,
  CalendarClock,
} from "lucide-react";
import type { ReactNode } from "react";
import { submitPaymentProof } from "@/actions/payment-submission";
import { compressReceiptImage } from "@/lib/storage/compress-receipt";
import { compressAndUploadReceipt } from "@/lib/storage/upload-receipt";
import { formatPHP } from "@/lib/finance/loan-calculator";
import type { PaymentTargetOption } from "@/lib/queries/member-payment-targets";
import type { MemberKinsenasYearMap } from "@/lib/queries/member-kinsenas-year";
import { KinsenasYearMap } from "@/components/finance/kinsenas-year-map";
import { PageHeader } from "@/components/ui/page-header";
import { Money } from "@/components/ui/money";
import type { OcrReceiptResult } from "@/app/api/ocr-receipt/route";

type AttentionField =
  | "period"
  | "amount"
  | "channel"
  | "paidAt"
  | "reference";

type DuesSummary = {
  openCount: number;
  overdueCount: number;
  baseTotal: number;
  penaltyTotal: number;
  totalDues: number;
  overdueTotal: number;
  earliestOverdueId: string | null;
  earliestOpenId: string | null;
};

function summarizeDues(targets: PaymentTargetOption[]): DuesSummary {
  let baseTotal = 0;
  let penaltyTotal = 0;
  let overdueCount = 0;
  let overdueTotal = 0;
  let earliestOverdueId: string | null = null;
  let earliestOpenId: string | null = null;

  for (const t of targets) {
    const base = Number(t.baseRemaining) || 0;
    const penalty = Number(t.penaltyAmount) || 0;
    const total = Number(t.suggestedAmount) || 0;
    baseTotal += base;
    penaltyTotal += penalty;
    if (!earliestOpenId) earliestOpenId = t.id;
    if (t.isOverdue) {
      overdueCount += 1;
      overdueTotal += total;
      if (!earliestOverdueId) earliestOverdueId = t.id;
    }
  }

  return {
    openCount: targets.length,
    overdueCount,
    baseTotal: Number(baseTotal.toFixed(2)),
    penaltyTotal: Number(penaltyTotal.toFixed(2)),
    totalDues: Number((baseTotal + penaltyTotal).toFixed(2)),
    overdueTotal: Number(overdueTotal.toFixed(2)),
    earliestOverdueId,
    earliestOpenId,
  };
}

function AttentionBadge({ label = "Verify" }: { label?: string }) {
  return (
    <span className="rl-attention-badge">
      <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
      {label}
    </span>
  );
}

const CHANNELS = [
  { value: "GCASH", label: "GCash" },
  { value: "MAYA", label: "Maya" },
  { value: "BANK_TRANSFER", label: "Bank" },
  { value: "OTHER_DIGITAL", label: "Other Digital" },
  { value: "CASH", label: "Cash" },
] as const;

const channelEnum = z.enum([
  "GCASH",
  "MAYA",
  "BANK_TRANSFER",
  "OTHER_DIGITAL",
  "CASH",
]);

function todayLocalIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const payFormSchema = z
  .object({
    targetId: z.string().min(1, "Select a period"),
    amount: z
      .string()
      .min(1, "Enter the amount you paid")
      .refine((v) => /^\d+(\.\d{1,2})?$/.test(v.trim()), "Invalid amount"),
    paymentChannel: channelEnum,
    paidAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Payment date is required"),
    referenceNumber: z.string(),
    aiExtractedAmount: z.string().nullable().optional(),
    aiExtractedRefNo: z.string().nullable().optional(),
    aiExtractedChannel: z
      .enum([
        "GCASH",
        "MAYA",
        "BANK_TRANSFER",
        "OTHER_DIGITAL",
        "CASH",
        "UNKNOWN",
      ])
      .nullable()
      .optional(),
    aiConfidenceNote: z.string().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.paidAt > todayLocalIsoDate()) {
      ctx.addIssue({
        code: "custom",
        path: ["paidAt"],
        message: "Payment date cannot be in the future",
      });
    }
    if (data.paymentChannel !== "CASH" && !data.referenceNumber?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["referenceNumber"],
        message: "Reference number is required for digital payments",
      });
    }
  });

type PayFormValues = z.infer<typeof payFormSchema>;

function defaultAmountFor(target: PaymentTargetOption | undefined): string {
  if (!target) return "";
  return Number(target.penaltyAmount) > 0
    ? target.suggestedAmount
    : target.baseRemaining;
}

type PayFormProps = {
  userId: string;
  headsCount: number;
  kinsenasDue: number;
  monthlyDue: number;
  targets: PaymentTargetOption[];
  kinsenasYearMap?: MemberKinsenasYearMap | null;
  initialTargetId?: string | null;
  setupHint?: ReactNode;
};

function formatUtcDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function groupTargets(targets: PaymentTargetOption[]) {
  const groups: Array<{ heading: string; items: PaymentTargetOption[] }> = [];
  const byMonth = new Map<string, PaymentTargetOption[]>();
  const loans: PaymentTargetOption[] = [];

  for (const t of targets) {
    if (t.targetType === "LOAN_AMORTIZATION" || !t.monthGroup) {
      loans.push(t);
      continue;
    }
    const list = byMonth.get(t.monthGroup) ?? [];
    list.push(t);
    byMonth.set(t.monthGroup, list);
  }
  for (const [heading, items] of byMonth) {
    groups.push({ heading, items });
  }
  if (loans.length > 0) {
    groups.push({ heading: "Loan installments", items: loans });
  }
  return groups;
}

export function PayForm({
  userId,
  headsCount,
  kinsenasDue,
  monthlyDue,
  targets,
  kinsenasYearMap = null,
  initialTargetId = null,
  setupHint,
}: PayFormProps) {
  const [compressedFile, setCompressedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [isValidReceipt, setIsValidReceipt] = useState<boolean | null>(null);
  const [scanFailed, setScanFailed] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [toast, setToast] = useState<{
    type: "ok" | "err";
    message: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const [amountFromOcr, setAmountFromOcr] = useState(false);
  const [ocrSettled, setOcrSettled] = useState(false);
  const [periodConfirmed, setPeriodConfirmed] = useState(Boolean(initialTargetId));

  const dues = summarizeDues(targets);
  const periodMeta = useMemo(() => {
    const meta: Record<string, { amount: number; penalty: number }> = {};
    for (const t of targets) {
      if (t.targetType !== "CONTRIBUTION") continue;
      meta[t.id] = {
        amount: Number(t.suggestedAmount) || 0,
        penalty: Number(t.penaltyAmount) || 0,
      };
    }
    return meta;
  }, [targets]);

  const loanTargets = useMemo(
    () => targets.filter((t) => t.targetType === "LOAN_AMORTIZATION"),
    [targets],
  );
  const linkedTarget =
    initialTargetId && targets.some((t) => t.id === initialTargetId)
      ? initialTargetId
      : null;
  const defaultTargetId =
    linkedTarget ??
    dues.earliestOverdueId ??
    dues.earliestOpenId ??
    targets[0]?.id ??
    "";
  const defaultTarget = targets.find((t) => t.id === defaultTargetId);

  const form = useForm<PayFormValues>({
    resolver: zodResolver(payFormSchema),
    defaultValues: {
      targetId: defaultTargetId,
      amount: defaultAmountFor(defaultTarget),
      paymentChannel: "GCASH",
      paidAt: todayLocalIsoDate(),
      referenceNumber: "",
      aiExtractedAmount: null,
      aiExtractedRefNo: null,
      aiExtractedChannel: null,
      aiConfidenceNote: null,
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = form;

  const targetId = watch("targetId");
  const amount = watch("amount");
  const paymentChannel = watch("paymentChannel");
  const paidAt = watch("paidAt");
  const referenceNumber = watch("referenceNumber");
  const confidenceNote = watch("aiConfidenceNote");
  const aiChannel = watch("aiExtractedChannel");
  const selected = targets.find((t) => t.id === targetId) ?? targets[0];

  const isCash = paymentChannel === "CASH";

  function showToast(type: "ok" | "err", message: string) {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 5000);
  }

  function clearReceipt() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCompressedFile(null);
    setIsValidReceipt(null);
    setScanFailed(false);
    setAmountFromOcr(false);
    setOcrSettled(false);
    setValue("aiExtractedAmount", null);
    setValue("aiExtractedRefNo", null);
    setValue("aiExtractedChannel", null);
    setValue("aiConfidenceNote", null);
  }

  function applyAmountPreset(nextAmount: string, preferTargetId?: string) {
    setAmountFromOcr(false);
    if (preferTargetId) {
      setValue("targetId", preferTargetId, { shouldValidate: true });
      setPeriodConfirmed(true);
    }
    setValue("amount", nextAmount, { shouldValidate: true });
  }

  function matchTargetToOcrAmount(ocrAmount: number) {
    const fixed = ocrAmount.toFixed(2);
    if (Math.abs(ocrAmount - dues.totalDues) < 0.011) {
      const anchor = dues.earliestOverdueId ?? dues.earliestOpenId;
      if (anchor) {
        setValue("targetId", anchor, { shouldValidate: true });
      }
      return;
    }
    const exact = targets.find(
      (t) =>
        t.suggestedAmount === fixed ||
        t.baseRemaining === fixed ||
        t.monthlyTotalSuggestedAmount === fixed,
    );
    if (exact) {
      setValue("targetId", exact.id, { shouldValidate: true });
    }
  }

  async function onReceiptSelected(file: File | null) {
    clearReceipt();
    if (!file) return;

    setPreviewUrl(URL.createObjectURL(file));
    setScanning(true);
    setOcrSettled(false);
    try {
      const webp = await compressReceiptImage(file);
      setCompressedFile(webp);

      const body = new FormData();
      body.append("file", webp, webp.name);

      const res = await fetch("/api/ocr-receipt", {
        method: "POST",
        body,
      });
      const ocr = (await res.json()) as OcrReceiptResult;

      const failed = Boolean(ocr.scanFailed) || !res.ok;
      setScanFailed(failed);
      setIsValidReceipt(failed ? null : ocr.isValidReceipt);
      setValue("aiConfidenceNote", ocr.confidenceNote);
      setValue("aiExtractedAmount", ocr.amount?.toFixed(2) ?? null);
      setValue("aiExtractedRefNo", ocr.referenceNumber);
      setValue(
        "aiExtractedChannel",
        ocr.paymentChannel === "UNKNOWN" ? "UNKNOWN" : ocr.paymentChannel,
      );

      if (ocr.amount != null) {
        setValue("amount", ocr.amount.toFixed(2), { shouldValidate: true });
        setAmountFromOcr(true);
        matchTargetToOcrAmount(ocr.amount);
      }
      if (ocr.referenceNumber) {
        setValue("referenceNumber", ocr.referenceNumber, {
          shouldValidate: true,
        });
      }
      if (ocr.transactionDate) {
        const d = new Date(ocr.transactionDate);
        if (!Number.isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          const iso = `${y}-${m}-${day}`;
          if (iso <= todayLocalIsoDate()) {
            setValue("paidAt", iso, { shouldValidate: true });
          }
        }
      }
      if (
        ocr.paymentChannel === "GCASH" ||
        ocr.paymentChannel === "MAYA" ||
        ocr.paymentChannel === "BANK_TRANSFER" ||
        ocr.paymentChannel === "OTHER_DIGITAL" ||
        ocr.paymentChannel === "CASH"
      ) {
        setValue("paymentChannel", ocr.paymentChannel, {
          shouldValidate: true,
        });
      }
    } catch (err) {
      setScanFailed(true);
      setIsValidReceipt(null);
      setValue(
        "aiConfidenceNote",
        err instanceof Error
          ? err.message
          : "Couldn’t read the receipt automatically — verify fields below.",
      );
    } finally {
      setScanning(false);
      setOcrSettled(true);
    }
  }

  function onTargetChange(id: string) {
    setValue("targetId", id, { shouldValidate: true });
    setPeriodConfirmed(true);
    const next = targets.find((t) => t.id === id);
    if (next && !amountFromOcr) {
      setValue("amount", defaultAmountFor(next), { shouldValidate: true });
    }
  }

  function attentionFor(field: AttentionField): boolean {
    if (!ocrSettled) return false;
    switch (field) {
      case "period":
        return !periodConfirmed;
      case "amount":
        return !amount?.trim() || Boolean(errors.amount);
      case "channel":
        if (isCash) return false;
        return aiChannel === "UNKNOWN" || aiChannel == null;
      case "paidAt":
        return !paidAt || Boolean(errors.paidAt);
      case "reference":
        return paymentChannel !== "CASH" && !referenceNumber?.trim();
      default:
        return false;
    }
  }

  function onSubmit(values: PayFormValues) {
    if (!selected) {
      showToast("err", "No open period to pay.");
      return;
    }
    const payingCash = values.paymentChannel === "CASH";
    if (!payingCash && !compressedFile) {
      showToast("err", "Please attach a receipt image for digital payments.");
      return;
    }

    startTransition(async () => {
      try {
        let receiptPath: string | null = null;
        if (compressedFile) {
          receiptPath = await compressAndUploadReceipt({
            file: compressedFile,
            cycleId: selected.cycleId,
            userId,
            referenceNumber:
              values.referenceNumber?.trim() ||
              `CASH-${values.paidAt.replace(/-/g, "")}`,
            alreadyCompressed: true,
          });
        }

        const result = await submitPaymentProof({
          amount: values.amount,
          targetType: selected.targetType,
          targetId: selected.id,
          paymentChannel: values.paymentChannel,
          referenceNumber: values.referenceNumber ?? "",
          receiptPath,
          paidAt: values.paidAt,
          aiExtractedAmount: values.aiExtractedAmount ?? null,
          aiExtractedRefNo: values.aiExtractedRefNo ?? null,
          aiExtractedChannel: values.aiExtractedChannel ?? null,
          aiConfidenceNote: values.aiConfidenceNote ?? null,
        });

        if (!result.success) {
          showToast("err", result.error);
          return;
        }

        showToast("ok", result.message ?? "Payment submitted for verification.");
        form.reset({
          targetId: defaultTargetId,
          amount:
            defaultAmountFor(targets.find((t) => t.id === defaultTargetId)),
          paymentChannel: "GCASH",
          paidAt: todayLocalIsoDate(),
          referenceNumber: "",
          aiExtractedAmount: null,
          aiExtractedRefNo: null,
          aiExtractedChannel: null,
          aiConfidenceNote: null,
        });
        clearReceipt();
      } catch (err) {
        showToast(
          "err",
          err instanceof Error ? err.message : "Upload failed.",
        );
      }
    });
  }

  const canSubmit =
    targets.length > 0 &&
    !scanning &&
    !pending &&
    Boolean(paidAt) &&
    (isCash || Boolean(compressedFile));

  const targetGroups = groupTargets(targets);
  const hasLateFee = selected ? Number(selected.penaltyAmount) > 0 : false;
  const useMapPicker = Boolean(kinsenasYearMap);

  const selectedTitle = selected
    ? selected.targetType === "CONTRIBUTION"
      ? `${selected.label} · ${selected.kinsenaIndex === 1 ? "15th Kinsenas" : "EOM Kinsenas"}`
      : selected.label
    : "Select an obligation";

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="rl-fund-frame rl-pay-page"
      noValidate
    >
      <PageHeader
        eyebrow="Payment Desk"
        title="Submit Contribution or Loan Payment"
        description={`${headsCount} active head${headsCount === 1 ? "" : "s"} · ${formatPHP(kinsenasDue)} per kinsenas · ${formatPHP(monthlyDue)} per month`}
      />

      {targets.length === 0 ? (
        <div className="rl-panel mx-auto max-w-lg py-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[var(--radius-card)] bg-[var(--success-soft)] text-[var(--success)]">
            <CheckCircle2 className="h-6 w-6" aria-hidden />
          </div>
          <p className="type-title">All Open Obligations Settled</p>
          <p className="type-body-sm type-muted mt-1">
            There are no open kinsenas periods or loan installments awaiting payment.
          </p>
          {setupHint ? (
            <div className="type-body-sm type-muted mt-3">{setupHint}</div>
          ) : null}
          {toast ? (
            <p
              className={
                toast.type === "ok"
                  ? "rl-alert rl-alert-ok mt-4 justify-center"
                  : "rl-alert rl-alert-error mt-4 justify-center"
              }
              role="status"
              aria-live="polite"
            >
              {toast.message}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="rl-pay-grid">
          {/* Left Rail: Total Open Dues + Interactive Obligation Selector */}
          <aside className="rl-pay-rail" aria-label="Open obligations">
            <div className="rounded-[var(--radius-md)] bg-[var(--surface-subtle)] p-4 ring-1 ring-[var(--border-subtle)]">
              <div className="flex items-center justify-between gap-2">
                <p className="type-label">Total Open Dues</p>
                <span className="rl-pill rl-pill-audited">
                  {dues.openCount} Open
                </span>
              </div>
              <p className="type-metric mt-2">
                <Money amount={dues.totalDues} metric />
              </p>
              <p className="type-caption mt-1 font-mono tabular-nums">
                {formatPHP(dues.baseTotal)} base
                {dues.penaltyTotal > 0
                  ? ` + ${formatPHP(dues.penaltyTotal)} late (${dues.overdueCount} overdue)`
                  : " · No late fees"}
              </p>
            </div>

            {useMapPicker && kinsenasYearMap ? (
              <KinsenasYearMap
                map={kinsenasYearMap}
                variant="open"
                selectedPeriodId={targetId}
                onSelectPeriod={(id) => onTargetChange(id)}
                periodMeta={periodMeta}
              />
            ) : (
              <div className="rl-stack-sm">
                <p className="type-label">Select Period</p>
                <ul className="km-period-list">
                  {targets.map((t) => {
                    const selectedRow = t.id === targetId;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          className={`km-period-row${selectedRow ? " is-selected" : ""}`}
                          aria-pressed={selectedRow}
                          onClick={() => onTargetChange(t.id)}
                        >
                          <span
                            className={`km-period-rail${t.isOverdue ? " km-period-rail--overdue" : " km-period-rail--due"}`}
                            aria-hidden
                          />
                          <span className="km-period-main">
                            <span className="km-period-date">{t.label}</span>
                            <span
                              className={`km-period-status${t.isOverdue ? " km-period-status--overdue" : " km-period-status--due"}`}
                            >
                              {t.isOverdue
                                ? "Overdue"
                                : t.isAdvance
                                  ? "Advance"
                                  : "Due"}
                            </span>
                          </span>
                          <span className="km-period-amount">
                            {formatPHP(t.suggestedAmount)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {useMapPicker && loanTargets.length > 0 ? (
              <div className="border-t border-[var(--border-subtle)] pt-4">
                <p className="type-label mb-2.5">Loan Installments</p>
                <ul className="km-period-list">
                  {loanTargets.map((t) => {
                    const selectedRow = t.id === targetId;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          className={`km-period-row${selectedRow ? " is-selected" : ""}`}
                          aria-pressed={selectedRow}
                          onClick={() => onTargetChange(t.id)}
                        >
                          <span
                            className={`km-period-rail${t.isOverdue ? " km-period-rail--overdue" : " km-period-rail--due"}`}
                            aria-hidden
                          />
                          <span className="km-period-main">
                            <span className="km-period-date">{t.label}</span>
                            <span className="km-period-status km-period-status--due">
                              Loan Amortization
                            </span>
                          </span>
                          <span className="km-period-amount">
                            {formatPHP(t.suggestedAmount)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {/* Hidden RHF select for form validation */}
            <select
              {...register("targetId")}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => onTargetChange(e.target.value)}
            >
              {targetGroups.map((group) => (
                <optgroup key={group.heading} label={group.heading}>
                  {group.items.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {errors.targetId ? (
              <p className="type-caption text-[var(--danger)]" role="alert">
                {errors.targetId.message}
              </p>
            ) : null}
          </aside>

          {/* Right Continuous Workstation: Obligation Summary + AI Receipt Scanner + Payment Details */}
          <div className="rl-pay-work">
            {/* 1. Selected Obligation Context & Quick Presets */}
            {selected ? (
              <section
                className="rl-panel rl-stack"
                aria-labelledby="selected-target-heading"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="type-label" id="selected-target-heading">
                        Active Obligation Target
                      </p>
                      {selected.isOverdue ? (
                        <span className="rl-pill rl-pill-rejected">Overdue</span>
                      ) : selected.isAdvance ? (
                        <span className="rl-pill rl-pill-audited">Advance</span>
                      ) : (
                        <span className="rl-pill rl-pill-verified">Open</span>
                      )}
                      {attentionFor("period") ? (
                        <AttentionBadge label="Confirm target" />
                      ) : null}
                    </div>
                    <h2 className="type-heading mt-1">{selectedTitle}</h2>
                    <p className="type-caption mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono tabular-nums">
                      <span>Due {formatUtcDate(selected.dueDate)}</span>
                      <span>·</span>
                      <span>Grace ends {formatUtcDate(selected.graceDeadline)}</span>
                    </p>
                  </div>

                  <div className="text-left sm:text-right">
                    <p className="type-label">Suggested Amount</p>
                    <p className="type-metric mt-1">
                      {formatPHP(selected.suggestedAmount)}
                    </p>
                    {hasLateFee ? (
                      <p className="type-caption mt-0.5 font-mono text-[var(--warning)] tabular-nums">
                        {formatPHP(selected.baseRemaining)} base +{" "}
                        {formatPHP(selected.penaltyAmount)} late
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Quick Amount Presets */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="type-caption font-medium">
                      Quick fill:
                    </span>
                    <button
                      type="button"
                      className={`rl-chip ${
                        amount === selected.suggestedAmount
                          ? "rl-chip-selected"
                          : ""
                      }`}
                      onClick={() => applyAmountPreset(selected.suggestedAmount)}
                    >
                      {hasLateFee ? "Period + Late Fee" : "Full Period Due"} (
                      {formatPHP(selected.suggestedAmount)})
                    </button>
                    {hasLateFee ? (
                      <button
                        type="button"
                        className={`rl-chip ${
                          amount === selected.baseRemaining
                            ? "rl-chip-selected"
                            : ""
                        }`}
                        onClick={() => applyAmountPreset(selected.baseRemaining)}
                      >
                        Base Only ({formatPHP(selected.baseRemaining)})
                      </button>
                    ) : null}
                    {selected.targetType === "CONTRIBUTION" &&
                    selected.monthlyTotalSuggestedAmount !==
                      selected.suggestedAmount ? (
                      <button
                        type="button"
                        className={`rl-chip ${
                          amount === selected.monthlyTotalSuggestedAmount
                            ? "rl-chip-selected"
                            : ""
                        }`}
                        onClick={() =>
                          applyAmountPreset(selected.monthlyTotalSuggestedAmount)
                        }
                      >
                        Full Month ({formatPHP(selected.monthlyTotalSuggestedAmount)})
                      </button>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--brand)] hover:underline"
                    aria-expanded={detailsOpen}
                    onClick={() => setDetailsOpen((o) => !o)}
                  >
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                    <span>CPE Rule #3 Breakdown</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform duration-200 ${
                        detailsOpen ? "rotate-180" : ""
                      }`}
                      aria-hidden
                    />
                  </button>
                </div>

                {detailsOpen ? (
                  <div className="rl-inset space-y-1.5">
                    <p className="type-caption font-medium text-[var(--ink)]">
                      Policy Due: {formatUtcDate(selected.dueDate)} · 2-Day Grace Ends:{" "}
                      {formatUtcDate(selected.graceDeadline)}
                    </p>
                    <p className="type-caption">{selected.lateFeeBreakdown}</p>
                    {hasLateFee ? (
                      <p className="font-mono text-xs font-semibold text-[var(--warning)] tabular-nums">
                        Formula: {selected.daysDelayed} chargeable day
                        {selected.daysDelayed === 1 ? "" : "s"} × ₱
                        {selected.penaltyRatePerHeadPerDay}/head/day ×{" "}
                        {selected.headsSnapshot} head
                        {selected.headsSnapshot === 1 ? "" : "s"} ={" "}
                        {formatPHP(selected.penaltyAmount)}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : null}

            {/* 2. Smart Receipt Proof & AI OCR Scanner */}
            <section
              className="rl-panel rl-stack"
              aria-labelledby="pay-proof-heading"
              aria-busy={scanning || undefined}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Receipt
                    className="h-4 w-4 text-[var(--brand)]"
                    aria-hidden
                  />
                  <h2 id="pay-proof-heading" className="type-title">
                    {isCash ? "Cash Payment Attestation" : "1. Receipt Proof & AI Auto-Fill"}
                  </h2>
                </div>
                {!isCash ? (
                  <button
                    type="button"
                    className="rl-btn rl-btn-ghost rl-btn-sm"
                    onClick={() => {
                      setValue("paymentChannel", "CASH", {
                        shouldValidate: true,
                      });
                      setOcrSettled(false);
                    }}
                  >
                    <Banknote className="h-3.5 w-3.5" aria-hidden />
                    Paying in cash instead?
                  </button>
                ) : (
                  <button
                    type="button"
                    className="rl-btn rl-btn-soft rl-btn-sm"
                    onClick={() => {
                      setValue("paymentChannel", "GCASH", {
                        shouldValidate: true,
                      });
                      clearReceipt();
                    }}
                  >
                    <Receipt className="h-3.5 w-3.5" aria-hidden />
                    Switch to digital receipt
                  </button>
                )}
              </div>

              {previewUrl ? (
                <div className="rl-pay-dropzone rl-pay-dropzone--preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Selected payment receipt proof"
                    className="rl-pay-receipt-img"
                  />
                  {scanning ? (
                    <div className="rl-pay-scan-overlay" aria-live="polite">
                      <Loader2
                        className="h-6 w-6 animate-spin"
                        aria-hidden
                      />
                      <span>Scanning receipt with AI OCR…</span>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="rl-pay-receipt-change"
                    onClick={() => clearReceipt()}
                    disabled={scanning}
                  >
                    Replace image
                  </button>
                </div>
              ) : (
                <label className="rl-pay-dropzone">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
                    <Camera className="h-5 w-5" aria-hidden />
                  </div>
                  <span className="type-body-sm font-semibold text-[var(--brand)]">
                    {isCash
                      ? "Attach optional cash acknowledgment photo"
                      : "Upload or capture payment receipt"}
                  </span>
                  <span className="type-caption max-w-sm">
                    {isCash
                      ? "Cash payments do not require a receipt image, but you may attach one for your records."
                      : "Supports GCash, Maya, and Bank Transfer screenshots. AI will automatically extract amount, date, and reference."}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(e) =>
                      void onReceiptSelected(e.target.files?.[0] ?? null)
                    }
                  />
                </label>
              )}

              {!isCash && (scanning || scanFailed || isValidReceipt !== null || confidenceNote) ? (
                <div
                  className={`rl-alert ${
                    scanning
                      ? "rl-alert-info"
                      : scanFailed || isValidReceipt === false
                        ? "rl-alert-warn"
                        : "rl-alert-ok"
                  }`}
                  role="status"
                >
                  {scanning ? (
                    <Loader2
                      className="mt-0.5 h-4 w-4 shrink-0 animate-spin"
                      aria-hidden
                    />
                  ) : scanFailed || isValidReceipt === false ? (
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden
                    />
                  ) : (
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  )}
                  <span className="text-xs font-medium">
                    {scanning
                      ? "Extracting amount, reference number, and date from receipt…"
                      : scanFailed
                        ? "Couldn’t auto-read receipt — please verify the fields below."
                        : isValidReceipt === false
                          ? "Image may not be a standard payment receipt — please verify details below."
                          : confidenceNote ?? "Receipt details extracted. Please review before submitting."}
                  </span>
                </div>
              ) : null}
            </section>

            {/* 3. Payment Confirmation Form (Always Accessible) */}
            <section
              className="rl-panel rl-stack"
              aria-labelledby="pay-details-heading"
            >
              <div className="border-b border-[var(--border-subtle)] pb-3">
                <h2 id="pay-details-heading" className="type-title">
                  {isCash ? "Confirm Cash Payment Details" : "2. Verify & Submit Payment Details"}
                </h2>
                <p className="type-caption mt-0.5">
                  Ensure the amount, payment channel, date, and reference number match your transaction.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label
                  className={`rl-field sm:col-span-2 ${
                    attentionFor("amount") ? "rl-field-attention" : ""
                  }`}
                >
                  <span className="rl-field-label">
                    Amount Paid (PHP)
                    {attentionFor("amount") ? <AttentionBadge /> : null}
                  </span>
                  <div className="relative">
                    <span
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-base font-bold text-[var(--ink-muted)]"
                      aria-hidden
                    >
                      ₱
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      {...register("amount")}
                      className="rl-input pl-8 font-mono text-lg font-bold tabular-nums"
                    />
                  </div>
                  {errors.amount ? (
                    <span
                      className="type-caption text-[var(--danger)]"
                      role="alert"
                    >
                      {errors.amount.message}
                    </span>
                  ) : null}
                </label>

                <fieldset
                  className={`rl-field sm:col-span-2 ${
                    attentionFor("channel") ? "rl-field-attention" : ""
                  }`}
                >
                  <legend className="rl-field-label mb-1.5">
                    Payment Channel
                    {attentionFor("channel") ? <AttentionBadge /> : null}
                  </legend>
                  <div
                    className="grid grid-cols-2 gap-2 sm:grid-cols-5"
                    role="radiogroup"
                    aria-label="Payment channel"
                  >
                    {CHANNELS.map((c) => {
                      const active = paymentChannel === c.value;
                      return (
                        <button
                          key={c.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          className={`rl-chip ${
                            active ? "rl-chip-selected" : ""
                          }`}
                          onClick={() => {
                            setValue("paymentChannel", c.value, {
                              shouldValidate: true,
                            });
                            if (c.value !== "CASH") {
                              setValue("aiExtractedChannel", c.value);
                            }
                          }}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <label
                  className={`rl-field ${
                    attentionFor("paidAt") ? "rl-field-attention" : ""
                  }`}
                >
                  <span className="rl-field-label">
                    Transaction Date
                    {attentionFor("paidAt") ? <AttentionBadge /> : null}
                  </span>
                  <input
                    type="date"
                    max={todayLocalIsoDate()}
                    {...register("paidAt")}
                    className="rl-input font-mono"
                  />
                  {errors.paidAt ? (
                    <span
                      className="type-caption text-[var(--danger)]"
                      role="alert"
                    >
                      {errors.paidAt.message}
                    </span>
                  ) : null}
                </label>

                {paymentChannel === "CASH" ? (
                  <input type="hidden" {...register("referenceNumber")} />
                ) : (
                  <label
                    className={`rl-field ${
                      attentionFor("reference") ? "rl-field-attention" : ""
                    }`}
                  >
                    <span className="rl-field-label">
                      Reference Number
                      {attentionFor("reference") ? <AttentionBadge /> : null}
                    </span>
                    <input
                      type="text"
                      {...register("referenceNumber")}
                      placeholder="e.g. 901234567890"
                      autoComplete="off"
                      className="rl-input font-mono"
                    />
                    {errors.referenceNumber ? (
                      <span
                        className="type-caption text-[var(--danger)]"
                        role="alert"
                      >
                        {errors.referenceNumber.message}
                      </span>
                    ) : null}
                  </label>
                )}
              </div>

              <input type="hidden" {...register("aiExtractedAmount")} />
              <input type="hidden" {...register("aiExtractedRefNo")} />
              <input type="hidden" {...register("aiExtractedChannel")} />
              <input type="hidden" {...register("aiConfidenceNote")} />

              {toast ? (
                <p
                  className={
                    toast.type === "ok"
                      ? "rl-alert rl-alert-ok"
                      : "rl-alert rl-alert-error"
                  }
                  role="status"
                  aria-live="polite"
                >
                  {toast.message}
                </p>
              ) : null}

              <div className="border-t border-[var(--border-subtle)] pt-3">
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="rl-btn rl-btn-primary rl-btn-lg rl-btn-block"
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Upload className="h-4 w-4" aria-hidden />
                  )}
                  {pending
                    ? "Submitting for Treasurer Verification…"
                    : !isCash && !compressedFile
                      ? "Attach Receipt Proof Above to Submit"
                      : `Submit ${formatPHP(Number(amount) || 0)} Payment`}
                </button>
              </div>
            </section>
          </div>
        </div>
      )}
    </form>
  );
}
