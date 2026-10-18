"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Loader2,
  Upload,
  Camera,
  ChevronDown,
  ImageIcon,
  AlertTriangle,
  Check,
  Lock,
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

function AttentionBadge() {
  return (
    <span className="ui-attention-badge">
      <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
      Review
    </span>
  );
}

const CHANNELS = [
  { value: "GCASH", label: "GCash" },
  { value: "MAYA", label: "Maya" },
  { value: "BANK_TRANSFER", label: "Bank" },
  { value: "OTHER_DIGITAL", label: "Other" },
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
        message: "Reference is required",
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
  /** Deep-link from Home / kinsenas map (`?target=`). */
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
  /** OCR finished (success or fail) — unlock confirm step + attention cues */
  const [ocrSettled, setOcrSettled] = useState(false);
  const [periodConfirmed, setPeriodConfirmed] = useState(false);
  const [cashSkip, setCashSkip] = useState(false);

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

  const isCash = paymentChannel === "CASH" || cashSkip;
  const [manualUnlock, setManualUnlock] = useState(false);
  /** Confirm stays locked while OCR runs; unlock on cash, good scan, or manual. */
  const receiptProcessed = ocrSettled && !scanning && !scanFailed;
  const detailsReady = isCash || receiptProcessed || manualUnlock;
  const step2Ref = useRef<HTMLDivElement>(null);
  const prevReady = useRef(false);

  useEffect(() => {
    if (detailsReady && !prevReady.current) {
      step2Ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    prevReady.current = detailsReady;
  }, [detailsReady]);

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
    setPeriodConfirmed(false);
    setManualUnlock(false);
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
    setCashSkip(false);
    setManualUnlock(false);
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
        if (ocr.paymentChannel === "CASH") setCashSkip(true);
      }
    } catch (err) {
      setScanFailed(true);
      setIsValidReceipt(null);
      setValue(
        "aiConfidenceNote",
        err instanceof Error
          ? err.message
          : "Couldn’t read the image — fill amount and reference below.",
      );
    } finally {
      setScanning(false);
      setOcrSettled(true);
      setPeriodConfirmed(false);
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
    if (!detailsReady) return false;
    if (!isCash && !ocrSettled) return false;

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
    const isCash = values.paymentChannel === "CASH";
    if (!isCash && !compressedFile) {
      showToast("err", "Attach a receipt image for digital payments.");
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

        showToast("ok", result.message ?? "Submitted for verification.");
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
        setCashSkip(false);
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
    detailsReady &&
    !scanning &&
    !pending &&
    Boolean(paidAt) &&
    (isCash || Boolean(compressedFile));
  const targetGroups = groupTargets(targets);
  const hasLateFee = selected ? Number(selected.penaltyAmount) > 0 : false;
  const attentionCount = (
    ["period", "amount", "channel", "paidAt", "reference"] as AttentionField[]
  ).filter((f) => attentionFor(f)).length;

  const scanStatus = scanning
    ? "Reading receipt…"
    : scanFailed
      ? "Couldn’t read receipt — fill details below."
      : isValidReceipt === false
        ? "This may not be a payment receipt."
        : confidenceNote
          ? confidenceNote
          : null;

  const useMapPicker = Boolean(kinsenasYearMap);
  const selectedTitle = selected
    ? selected.targetType === "CONTRIBUTION"
      ? selected.kinsenaIndex === 1
        ? "1st kinsenas · 15th"
        : "2nd kinsenas · EOM"
      : "Loan installment"
    : "Select a period";

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="ui-fund-frame ui-pay-page"
      noValidate
    >
      <PageHeader
        eyebrow="Pay"
        title="Cover a period"
        description={`${headsCount} head${headsCount === 1 ? "" : "s"} · ${formatPHP(kinsenasDue)} / kinsenas · ${formatPHP(monthlyDue)} / month`}
      />

      {targets.length === 0 ? (
        <div className="ui-pay-empty">
          <p className="type-title">Nothing open to pay</p>
          {setupHint ? (
            <div className="type-body-sm type-muted mt-2">{setupHint}</div>
          ) : null}
          {toast ? (
            <p
              className={
                toast.type === "ok"
                  ? "ui-alert ui-alert-ok mt-4"
                  : "ui-alert ui-alert-error mt-4"
              }
              role="status"
              aria-live="polite"
            >
              {toast.message}
            </p>
          ) : null}
        </div>
      ) : (
        <div
          className={`ui-desk ui-pay-shell${dues.overdueCount > 0 ? " ui-pay-shell--overdue" : ""}`}
        >
          <aside className="ui-pay-rail" aria-label="Open periods">
            <div className="ui-pay-rail-dues">
              <p className="type-caption">Total dues</p>
              <p className="ui-pay-rail-total">
                <Money amount={dues.totalDues} />
              </p>
              <p className="type-caption mt-1.5 tabular-nums">
                {dues.openCount} open
                {dues.penaltyTotal > 0
                  ? ` · ${formatPHP(dues.penaltyTotal)} late`
                  : ""}
                {dues.overdueCount > 0
                  ? ` · ${dues.overdueCount} overdue`
                  : ""}
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
              <div className="ui-pay-rail-list">
                <p className="type-label">Choose a period</p>
                <ul className="km-period-list mt-3">
                  {targets.map((t) => {
                    const selectedRow = t.id === targetId;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          className={`km-period-row${selectedRow ? " is-selected" : ""}${t.isOverdue ? " km-period-row--overdue" : ""}`}
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
                                  : "Open"}
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
              <div className="ui-pay-rail-loans">
                <p className="type-label">Loan installments</p>
                <ul className="km-period-list mt-2">
                  {loanTargets.map((t) => {
                    const selectedRow = t.id === targetId;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          className={`km-period-row${selectedRow ? " is-selected" : ""}${t.isOverdue ? " km-period-row--overdue" : ""}`}
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
                              Loan
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

            {/* Keep RHF targetId wired; rail buttons drive changes */}
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
              <p className="type-caption mt-2 text-[var(--danger)]" role="alert">
                {errors.targetId.message}
              </p>
            ) : null}
          </aside>

          <div className="ui-pay-work">
            <header className="ui-pay-context">
              <div className="min-w-0">
                <p className="type-caption">Paying</p>
                <p className="ui-pay-context-title">
                  {selectedTitle}
                  {selected?.isOverdue ? (
                    <span className="ui-pay-context-flag">Overdue</span>
                  ) : null}
                  {attentionFor("period") ? <AttentionBadge /> : null}
                </p>
                {selected ? (
                  <p className="type-caption mt-1 tabular-nums">
                    Due {formatUtcDate(selected.dueDate)}
                    {hasLateFee
                      ? ` · ${formatPHP(selected.baseRemaining)} + ${formatPHP(selected.penaltyAmount)} late`
                      : ` · ${formatPHP(selected.suggestedAmount)}`}
                  </p>
                ) : null}
              </div>
              <ol className="ui-pay-steps" aria-label="Payment progress">
                <li
                  className={`ui-pay-steps-item${detailsReady ? " is-done" : " is-current"}`}
                >
                  <span className="ui-pay-steps-mark" aria-hidden>
                    {detailsReady ? <Check className="h-3 w-3" /> : "1"}
                  </span>
                  {cashSkip ? "Cash" : "Proof"}
                </li>
                <li
                  className={`ui-pay-steps-item${detailsReady ? " is-current" : " is-locked"}`}
                >
                  <span className="ui-pay-steps-mark" aria-hidden>
                    {detailsReady ? "2" : <Lock className="h-2.5 w-2.5" />}
                  </span>
                  Confirm
                </li>
              </ol>
            </header>

            <section
              className={`ui-pay-panel${
                detailsReady
                  ? " is-complete"
                  : scanning
                    ? " is-scanning"
                    : " is-active"
              }`}
              aria-labelledby="pay-proof-heading"
              aria-busy={scanning || undefined}
            >
              <div className="ui-pay-panel-head">
                <h2 id="pay-proof-heading" className="type-body-sm font-semibold">
                  {cashSkip ? "Cash payment" : "Receipt proof"}
                </h2>
                {!cashSkip ? (
                  <button
                    type="button"
                    className="ui-btn ui-btn-ghost h-10 px-3 text-[13px]"
                    onClick={() => {
                      setCashSkip(true);
                      setValue("paymentChannel", "CASH", {
                        shouldValidate: true,
                      });
                      setOcrSettled(false);
                      setPeriodConfirmed(false);
                    }}
                  >
                    Pay with cash
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ui-btn ui-btn-ghost h-10 px-3 text-[13px]"
                    onClick={() => {
                      setCashSkip(false);
                      setValue("paymentChannel", "GCASH", {
                        shouldValidate: true,
                      });
                      clearReceipt();
                    }}
                  >
                    Use receipt
                  </button>
                )}
              </div>

              {previewUrl ? (
                <div
                  className={`ui-pay-dropzone ui-pay-dropzone--preview${
                    detailsReady ? " ui-pay-dropzone--compact-preview" : ""
                  }${scanning ? " is-scanning" : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Selected payment proof"
                    className="ui-pay-receipt-img"
                  />
                  {scanning ? (
                    <div className="ui-pay-scan-overlay" aria-live="polite">
                      <Loader2
                        className="h-5 w-5 animate-spin"
                        aria-hidden
                      />
                      <span>Reading receipt…</span>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="ui-pay-receipt-change"
                    onClick={() => clearReceipt()}
                    disabled={scanning}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <label
                  className={`ui-pay-dropzone${cashSkip ? " ui-pay-dropzone--compact" : ""}`}
                >
                  <Camera className="h-7 w-7 text-[var(--brand)]" aria-hidden />
                  <span className="type-body-sm font-medium text-[var(--brand)]">
                    {cashSkip ? "Optional photo" : "Add receipt photo"}
                  </span>
                  {!cashSkip ? (
                    <span className="type-caption">Confirm unlocks after scan</span>
                  ) : null}
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

              {scanStatus && !cashSkip ? (
                <p
                  className={`ui-pay-scan${
                    scanFailed || isValidReceipt === false
                      ? " ui-pay-scan--warn"
                      : ""
                  }`}
                  role="status"
                >
                  {scanning ? (
                    <Loader2
                      className="mt-0.5 h-4 w-4 shrink-0 animate-spin"
                      aria-hidden
                    />
                  ) : (
                    <ImageIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  )}
                  <span>{scanStatus}</span>
                </p>
              ) : null}
            </section>

            {detailsReady ? (
              <section
                ref={step2Ref}
                className="ui-pay-panel is-active"
                id="pay-step-2"
                aria-labelledby="pay-details-heading"
              >
                <div className="ui-pay-panel-head">
                  <h2
                    id="pay-details-heading"
                    className="type-body-sm font-semibold"
                  >
                    Confirm details
                    {attentionCount > 0 ? (
                      <span className="type-caption ml-2 font-normal text-[var(--warning)]">
                        {attentionCount} to review
                      </span>
                    ) : null}
                  </h2>
                </div>

                {selected ? (
                  <div className="ui-pay-amount-block">
                    <p className="ui-pay-amount-due">
                      {formatPHP(selected.suggestedAmount)}
                    </p>
                    <p className="type-caption tabular-nums">Suggested</p>

                    <div className="ui-pay-presets">
                      <button
                        type="button"
                        className={`ui-btn h-10 px-3 text-[13px]${
                          amount === selected.baseRemaining
                            ? " ui-btn-primary"
                            : " ui-btn-ghost"
                        }`}
                        onClick={() =>
                          applyAmountPreset(selected.baseRemaining)
                        }
                      >
                        Base only
                      </button>
                      {hasLateFee ? (
                        <button
                          type="button"
                          className={`ui-btn h-10 px-3 text-[13px]${
                            amount === selected.suggestedAmount
                              ? " ui-btn-primary"
                              : " ui-btn-ghost"
                          }`}
                          onClick={() =>
                            applyAmountPreset(selected.suggestedAmount)
                          }
                        >
                          Period + late
                        </button>
                      ) : null}
                      {selected.targetType === "CONTRIBUTION" &&
                      selected.monthlyTotalSuggestedAmount !==
                        selected.suggestedAmount ? (
                        <button
                          type="button"
                          className={`ui-btn h-10 px-3 text-[13px]${
                            amount === selected.monthlyTotalSuggestedAmount
                              ? " ui-btn-primary"
                              : " ui-btn-ghost"
                          }`}
                          onClick={() =>
                            applyAmountPreset(
                              selected.monthlyTotalSuggestedAmount,
                            )
                          }
                        >
                          Full month
                        </button>
                      ) : null}
                    </div>

                    <label
                      className={`ui-field mt-4${
                        attentionFor("amount") ? " ui-field-attention" : ""
                      }`}
                    >
                      <span className="ui-field-label">
                        You are paying
                        {attentionFor("amount") ? <AttentionBadge /> : null}
                      </span>
                      <div className="relative">
                        <span
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 type-body-sm text-[var(--ink-muted)]"
                          aria-hidden
                        >
                          ₱
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          {...register("amount")}
                          className="ui-input pl-8 tabular-nums text-lg font-semibold"
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

                    <button
                      type="button"
                      className="ui-pay-fee-toggle"
                      aria-expanded={detailsOpen}
                      onClick={() => setDetailsOpen((o) => !o)}
                    >
                      <span>Late fee details</span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 transition-transform duration-200${
                          detailsOpen ? " rotate-180" : ""
                        }`}
                        aria-hidden
                      />
                    </button>
                    {detailsOpen ? (
                      <div className="ui-pay-fee-body">
                        <p className="type-caption">
                          Policy due {formatUtcDate(selected.dueDate)} · Grace
                          ends {formatUtcDate(selected.graceDeadline)}
                        </p>
                        <p className="type-caption">
                          {selected.lateFeeBreakdown}
                        </p>
                        {hasLateFee ? (
                          <p className="type-body-sm tabular-nums">
                            Late fee: {formatPHP(selected.penaltyAmount)} (
                            {selected.daysDelayed} chargeable day
                            {selected.daysDelayed === 1 ? "" : "s"} × ₱
                            {selected.penaltyRatePerHeadPerDay}/head ×{" "}
                            {selected.headsSnapshot} head
                            {selected.headsSnapshot === 1 ? "" : "s"})
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="ui-pay-fields">
                  <fieldset
                    className={
                      attentionFor("channel") ? "ui-field-attention" : undefined
                    }
                  >
                    <legend className="ui-field-label">
                      Channel
                      {attentionFor("channel") ? <AttentionBadge /> : null}
                    </legend>
                    <div
                      className="ui-pay-channels"
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
                            className={`ui-btn h-10 px-2 text-[13px]${
                              active ? " ui-btn-primary" : " ui-btn-ghost"
                            }`}
                            onClick={() => {
                              setValue("paymentChannel", c.value, {
                                shouldValidate: true,
                              });
                              setCashSkip(c.value === "CASH");
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

                  <div className="ui-pay-field-row">
                    <label
                      className={`ui-field${
                        attentionFor("paidAt") ? " ui-field-attention" : ""
                      }`}
                    >
                      <span className="ui-field-label">
                        Payment date
                        {attentionFor("paidAt") ? <AttentionBadge /> : null}
                      </span>
                      <input
                        type="date"
                        max={todayLocalIsoDate()}
                        {...register("paidAt")}
                        className="ui-input"
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
                        className={`ui-field${
                          attentionFor("reference")
                            ? " ui-field-attention"
                            : ""
                        }`}
                      >
                        <span className="ui-field-label">
                          Reference
                          {attentionFor("reference") ? (
                            <AttentionBadge />
                          ) : null}
                        </span>
                        <input
                          type="text"
                          {...register("referenceNumber")}
                          placeholder="From receipt"
                          autoComplete="off"
                          className="ui-input font-mono"
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
                </div>

                <input type="hidden" {...register("aiExtractedAmount")} />
                <input type="hidden" {...register("aiExtractedRefNo")} />
                <input type="hidden" {...register("aiExtractedChannel")} />
                <input type="hidden" {...register("aiConfidenceNote")} />

                {toast ? (
                  <p
                    className={
                      toast.type === "ok"
                        ? "ui-alert ui-alert-ok mt-4"
                        : "ui-alert ui-alert-error mt-4"
                    }
                    role="status"
                    aria-live="polite"
                  >
                    {toast.message}
                  </p>
                ) : null}

                <div className="ui-pay-cta">
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="ui-btn ui-btn-primary ui-btn-lg ui-btn-block cursor-pointer shadow-[var(--shadow-elevated)] disabled:cursor-not-allowed"
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Upload className="h-4 w-4" aria-hidden />
                    )}
                    {pending ? "Submitting…" : "Submit payment"}
                  </button>
                </div>
              </section>
            ) : (
              <div
                ref={step2Ref}
                className="ui-pay-await"
                id="pay-step-2"
                aria-labelledby="pay-step-2-locked"
              >
                <Lock
                  className="h-4 w-4 shrink-0 text-[var(--ink-muted)]"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p
                    id="pay-step-2-locked"
                    className="type-body-sm font-medium text-[var(--ink-muted)]"
                  >
                    {scanning
                      ? "Reading receipt — confirm unlocks when done"
                      : scanFailed
                        ? "Couldn’t read receipt — enter details manually"
                        : "Add a receipt or pay with cash to confirm"}
                  </p>
                </div>
                {!scanning ? (
                  <button
                    type="button"
                    className="ui-btn ui-btn-ghost h-10 shrink-0 px-3 text-[13px]"
                    onClick={() => setManualUnlock(true)}
                  >
                    Enter manually
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
