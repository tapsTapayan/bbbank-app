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
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Banknote,
  Receipt,
  CalendarClock,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { submitPaymentProof } from "@/actions/payment-submission";
import { compressReceiptImage } from "@/lib/storage/compress-receipt";
import { compressAndUploadReceipt } from "@/lib/storage/upload-receipt";
import { formatPHP } from "@/lib/finance/loan-calculator";
import { formatKinsenaDueLabel } from "@/lib/finance/cpe-policy";
import { graceDeadlineCaption } from "@/lib/finance/status-labels";
import { recomputePaymentTargetsAsOf } from "@/lib/finance/payment-targets-as-of";
import type { PaymentTargetOption } from "@/lib/queries/member-payment-targets";
import type { MemberKinsenasYearMap } from "@/lib/queries/member-kinsenas-year";
import { PayPeriodPicker } from "@/components/finance/pay-period-picker";
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
  const [lateFeeOpen, setLateFeeOpen] = useState(false);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  /** null until matchMedia runs — avoids desktop/mobile flash on first paint */
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [toast, setToast] = useState<{
    type: "ok" | "err";
    message: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const [amountFromOcr, setAmountFromOcr] = useState(false);
  const [ocrSettled, setOcrSettled] = useState(false);
  const [periodConfirmed, setPeriodConfirmed] = useState(Boolean(initialTargetId));
  /** Auto follows earliest overdue/open; manual is an explicit period pick. */
  const [periodMode, setPeriodMode] = useState<"auto" | "manual">(
    initialTargetId ? "manual" : "auto",
  );

  const linkedTarget =
    initialTargetId && targets.some((t) => t.id === initialTargetId)
      ? initialTargetId
      : null;
  const initialAutoId =
    targets.find((t) => t.isOverdue)?.id ??
    targets.find((t) => t.targetType === "CONTRIBUTION")?.id ??
    targets[0]?.id ??
    "";
  const defaultTargetId = linkedTarget ?? initialAutoId;
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

  /** Dues / late fees as of the payment transaction date (Rule #3). */
  const liveTargets = useMemo(
    () =>
      recomputePaymentTargetsAsOf(
        targets,
        paidAt?.trim() || todayLocalIsoDate(),
      ),
    [targets, paidAt],
  );

  const dues = useMemo(() => summarizeDues(liveTargets), [liveTargets]);

  const loanTargets = useMemo(
    () => liveTargets.filter((t) => t.targetType === "LOAN_AMORTIZATION"),
    [liveTargets],
  );
  const contributionTargets = useMemo(
    () => liveTargets.filter((t) => t.targetType === "CONTRIBUTION"),
    [liveTargets],
  );
  const autoPeriodId =
    dues.earliestOverdueId ??
    dues.earliestOpenId ??
    contributionTargets[0]?.id ??
    liveTargets[0]?.id ??
    "";
  const selected =
    liveTargets.find((t) => t.id === targetId) ?? liveTargets[0];

  const isCash = paymentChannel === "CASH";
  const paidAtRef = useRef(paidAt);

  useEffect(() => {
    if (paidAtRef.current === paidAt) return;
    paidAtRef.current = paidAt;
    if (amountFromOcr) return;
    const next = liveTargets.find((t) => t.id === targetId) ?? liveTargets[0];
    if (next) {
      setValue("amount", defaultAmountFor(next), { shouldValidate: true });
    }
  }, [paidAt, liveTargets, targetId, amountFromOcr, setValue]);

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
      onTargetChange(preferTargetId, "manual");
    }
    setValue("amount", nextAmount, { shouldValidate: true });
  }

  function matchTargetToOcrAmount(ocrAmount: number) {
    const fixed = ocrAmount.toFixed(2);
    if (Math.abs(ocrAmount - dues.totalDues) < 0.011) {
      const anchor = dues.earliestOverdueId ?? dues.earliestOpenId;
      if (anchor) {
        onTargetChange(anchor, "auto");
      }
      return;
    }
    const exact = liveTargets.find(
      (t) =>
        t.suggestedAmount === fixed ||
        t.baseRemaining === fixed ||
        t.monthlyTotalSuggestedAmount === fixed,
    );
    if (exact) {
      onTargetChange(exact.id, "manual");
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

  function onTargetChange(id: string, mode: "auto" | "manual" = "manual") {
    setPeriodMode(mode);
    setValue("targetId", id, { shouldValidate: true });
    setPeriodConfirmed(true);
    const next = liveTargets.find((t) => t.id === id);
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
    liveTargets.length > 0 &&
    !scanning &&
    !pending &&
    Boolean(paidAt) &&
    (isCash || Boolean(compressedFile));

  /** Details only after cash mode or receipt OCR has finished. */
  const detailsReady = isCash || (ocrSettled && !scanning);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!detailsReady) {
      setMobileDetailsOpen(false);
      return;
    }
    if (isMobile === true) setMobileDetailsOpen(true);
  }, [detailsReady, isMobile]);

  useEffect(() => {
    if (isMobile !== true || !mobileDetailsOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileDetailsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [isMobile, mobileDetailsOpen]);

  const targetGroups = groupTargets(liveTargets);
  const hasLateFee = selected ? Number(selected.penaltyAmount) > 0 : false;
  const useMapPicker = Boolean(kinsenasYearMap);

  const selectedTitle = selected
    ? selected.targetType === "CONTRIBUTION"
      ? `${formatKinsenaDueLabel(new Date(selected.dueDate))} · ${
          selected.kinsenaIndex === 1 ? "15th Kinsenas" : "EOM Kinsenas"
        }`
      : selected.label.replace(/\s·\s₱[\d,]+\.\d{2}$/, "")
    : "Select an obligation";

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="rl-fund-frame rl-pay-page"
      noValidate
    >
      <PageHeader
        title="Pay"
        description={`${headsCount} head${headsCount === 1 ? "" : "s"} · ${formatPHP(kinsenasDue)} / kinsenas · ${formatPHP(monthlyDue)} / month`}
      />

      {targets.length === 0 ? (
        <div className="rl-panel mx-auto max-w-lg py-12 text-center">
          <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-[var(--radius)] bg-[var(--success-soft)] text-[var(--success)]">
            <CheckCircle2 className="h-6 w-6" aria-hidden />
          </div>
          <p className="type-title">Nothing due</p>
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
              <p className="type-label">Total Open Dues</p>
              <p className="type-metric mt-2">
                <Money amount={dues.totalDues} metric />
              </p>
              {dues.penaltyTotal > 0 ? (
                <p className="type-caption mt-1 font-mono tabular-nums">
                  {formatPHP(dues.baseTotal)} base +{" "}
                  {formatPHP(dues.penaltyTotal)} late ({dues.overdueCount}{" "}
                  overdue)
                </p>
              ) : null}
            </div>

            {useMapPicker && kinsenasYearMap ? (
              <PayPeriodPicker
                map={kinsenasYearMap}
                contributionTargets={contributionTargets}
                autoPeriodId={autoPeriodId}
                periodMode={
                  selected?.targetType === "CONTRIBUTION" ? periodMode : "auto"
                }
                selectedPeriodId={
                  selected?.targetType === "CONTRIBUTION" ? targetId : undefined
                }
                onPeriodModeChange={(mode, id) => onTargetChange(id, mode)}
              />
            ) : (
              <label className="rl-field">
                <span className="rl-field-label">Period</span>
                <select
                  className="rl-select"
                  value={
                    periodMode === "auto" &&
                    selected?.targetType === "CONTRIBUTION"
                      ? "__auto__"
                      : targetId
                  }
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "__auto__") {
                      onTargetChange(autoPeriodId, "auto");
                      return;
                    }
                    onTargetChange(value, "manual");
                  }}
                >
                  <option value="__auto__">Auto</option>
                  {contributionTargets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                      {t.isOverdue ? " · Overdue" : ""} ·{" "}
                      {formatPHP(t.suggestedAmount)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {loanTargets.length > 0 ? (
              <div className="border-t border-[var(--border-subtle)] pt-3">
                <p className="type-label mb-2">Loans</p>
                <div className="flex flex-wrap gap-1.5">
                  {loanTargets.map((t) => {
                    const selectedRow = t.id === targetId;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`rl-chip !min-h-8 !px-2.5 ${
                          selectedRow ? "rl-chip-selected" : ""
                        }`}
                        aria-pressed={selectedRow}
                        onClick={() => onTargetChange(t.id)}
                      >
                        <span className="truncate max-w-[7.5rem] sm:max-w-[9rem]">
                          {t.label}
                        </span>
                        <span className="shrink-0 font-mono tabular-nums">
                          {formatPHP(t.suggestedAmount)}
                        </span>
                      </button>
                    );
                  })}
                </div>
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

          {/* Right Continuous Workstation: Receipt + Details */}
          <div className="rl-pay-work">
            {/* 1. Smart Receipt Proof & AI OCR Scanner */}
            <section
              className="rl-panel rl-stack"
              aria-labelledby="pay-proof-heading"
              aria-busy={scanning || undefined}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="pay-proof-heading" className="type-title">
                  {isCash ? "Cash" : "Receipt"}
                </h2>
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
                    Switch to cash
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
                    Switch to receipt
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
                      <span>Scanning…</span>
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
                  <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] bg-[var(--brand-soft)] text-[var(--brand)]">
                    <Camera className="h-5 w-5" aria-hidden />
                  </div>
                  <span className="type-body-sm font-semibold text-[var(--brand)]">
                    {isCash ? "Optional photo" : "Upload or capture receipt"}
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
                      ? "Reading receipt…"
                      : scanFailed
                        ? "Couldn’t read receipt — check fields below."
                        : isValidReceipt === false
                          ? "Unrecognized receipt — verify details."
                          : confidenceNote ?? "Review extracted details."}
                  </span>
                </div>
              ) : null}
            </section>

            {/* 2. Details — only after cash mode or receipt OCR finishes */}
            {detailsReady && isMobile === true && !mobileDetailsOpen ? (
              <button
                type="button"
                className="rl-btn rl-btn-primary rl-btn-lg rl-btn-block"
                onClick={() => setMobileDetailsOpen(true)}
              >
                Review & submit
              </button>
            ) : null}

            {detailsReady &&
            ((isMobile === true && mobileDetailsOpen) ||
              isMobile === false) ? (
              isMobile ? (
                <div
                  className="rl-modal-backdrop"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="pay-details-heading"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) {
                      setMobileDetailsOpen(false);
                    }
                  }}
                >
                  <div className="rl-modal-dialog rl-pay-details-dialog">
                    <div className="rl-pay-details-dialog__head">
                      <h2 id="pay-details-heading" className="type-title">
                        Details
                      </h2>
                      <button
                        type="button"
                        className="rl-icon-btn rl-icon-btn-sm"
                        aria-label="Close details"
                        onClick={() => setMobileDetailsOpen(false)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="rl-pay-details-dialog__body rl-stack">
                      <PayDetailsFields
                        selected={selected}
                        selectedTitle={selectedTitle}
                        hasLateFee={hasLateFee}
                        isCash={isCash}
                        amount={amount}
                        paymentChannel={paymentChannel}
                        lateFeeOpen={lateFeeOpen}
                        setLateFeeOpen={setLateFeeOpen}
                        attentionFor={attentionFor}
                        applyAmountPreset={applyAmountPreset}
                        register={register}
                        setValue={setValue}
                        errors={errors}
                        toast={toast}
                        canSubmit={canSubmit}
                        pending={pending}
                        compressedFile={compressedFile}
                        showSubmit={false}
                        totalOpenDues={dues.totalDues.toFixed(2)}
                        autoPeriodId={autoPeriodId}
                      />
                    </div>
                    <div className="rl-pay-details-dialog__foot">
                      <PayDetailsSubmit
                        canSubmit={canSubmit}
                        pending={pending}
                        isCash={isCash}
                        compressedFile={compressedFile}
                        amount={amount}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <section
                  className="rl-panel rl-stack"
                  aria-labelledby="pay-details-heading"
                >
                  <div className="border-b border-[var(--border-subtle)] pb-3">
                    <h2 id="pay-details-heading" className="type-title">
                      Details
                    </h2>
                  </div>
                  <PayDetailsFields
                    selected={selected}
                    selectedTitle={selectedTitle}
                    hasLateFee={hasLateFee}
                    isCash={isCash}
                    amount={amount}
                    paymentChannel={paymentChannel}
                    lateFeeOpen={lateFeeOpen}
                    setLateFeeOpen={setLateFeeOpen}
                    attentionFor={attentionFor}
                    applyAmountPreset={applyAmountPreset}
                    register={register}
                    setValue={setValue}
                    errors={errors}
                    toast={toast}
                    canSubmit={canSubmit}
                    pending={pending}
                    compressedFile={compressedFile}
                    showSubmit
                    totalOpenDues={dues.totalDues.toFixed(2)}
                    autoPeriodId={autoPeriodId}
                  />
                </section>
              )
            ) : null}

            <input type="hidden" {...register("aiExtractedAmount")} />
            <input type="hidden" {...register("aiExtractedRefNo")} />
            <input type="hidden" {...register("aiExtractedChannel")} />
            <input type="hidden" {...register("aiConfidenceNote")} />
          </div>
        </div>
      )}
    </form>
  );
}

type PayDetailsFieldsProps = {
  selected: PaymentTargetOption | undefined;
  selectedTitle: string;
  hasLateFee: boolean;
  isCash: boolean;
  amount: string;
  paymentChannel: PayFormValues["paymentChannel"];
  lateFeeOpen: boolean;
  setLateFeeOpen: (updater: boolean | ((o: boolean) => boolean)) => void;
  attentionFor: (field: AttentionField) => boolean;
  applyAmountPreset: (nextAmount: string, preferTargetId?: string) => void;
  register: ReturnType<typeof useForm<PayFormValues>>["register"];
  setValue: ReturnType<typeof useForm<PayFormValues>>["setValue"];
  errors: ReturnType<typeof useForm<PayFormValues>>["formState"]["errors"];
  toast: { type: "ok" | "err"; message: string } | null;
  canSubmit: boolean;
  pending: boolean;
  compressedFile: File | null;
  showSubmit?: boolean;
  /** Sum of all open obligations (cash “pay all” preset). */
  totalOpenDues: string;
  autoPeriodId: string;
};

function PayDetailsSubmit({
  canSubmit,
  pending,
  isCash,
  compressedFile,
  amount,
}: {
  canSubmit: boolean;
  pending: boolean;
  isCash: boolean;
  compressedFile: File | null;
  amount: string;
}) {
  return (
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
        ? "Submitting…"
        : !isCash && !compressedFile
          ? "Attach receipt to submit"
          : `Submit ${formatPHP(Number(amount) || 0)}`}
    </button>
  );
}

function PayDetailsFields({
  selected,
  selectedTitle,
  hasLateFee,
  isCash,
  amount,
  paymentChannel,
  lateFeeOpen,
  setLateFeeOpen,
  attentionFor,
  applyAmountPreset,
  register,
  setValue,
  errors,
  toast,
  canSubmit,
  pending,
  compressedFile,
  showSubmit = true,
  totalOpenDues,
  autoPeriodId,
}: PayDetailsFieldsProps) {
  const showAllOpen =
    Number(totalOpenDues) > Number(selected?.suggestedAmount ?? 0) + 0.001;
  const showFullMonth =
    selected?.targetType === "CONTRIBUTION" &&
    selected.monthlyTotalSuggestedAmount !== selected.suggestedAmount &&
    Number(selected.monthlyTotalSuggestedAmount) <
      Number(totalOpenDues) - 0.001;

  return (
    <>
      {selected ? (
        <div
          className="space-y-3 border-b border-[var(--border-subtle)] pb-4"
          aria-labelledby="selected-target-heading"
        >
          <div className="min-w-0">
            <p className="type-label sr-only" id="selected-target-heading">
              Selected period
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <p className="type-heading">{selectedTitle}</p>
              {selected.isOverdue ? (
                <span className="rl-pill rl-pill-rejected">Overdue</span>
              ) : selected.isAdvance ? (
                <span className="rl-pill rl-pill-audited">Advance</span>
              ) : null}
              {attentionFor("period") ? (
                <AttentionBadge label="Confirm" />
              ) : null}
            </div>
            <p className="type-caption mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono tabular-nums">
              <span>Due {formatUtcDate(selected.dueDate)}</span>
              <span>·</span>
              <span>
                {graceDeadlineCaption(selected.graceDeadline, {
                  isWithinGrace: selected.isWithinGrace,
                  isAdvance: selected.isAdvance,
                  isOverdue: selected.isOverdue,
                })}
              </span>
            </p>
            <p className="type-caption mt-1 font-mono tabular-nums type-muted">
              {formatPHP(selected.suggestedAmount)}
              {hasLateFee
                ? ` · ${formatPHP(selected.baseRemaining)} base + ${formatPHP(selected.penaltyAmount)} late`
                : " due"}
            </p>
          </div>

          <div
            className={`flex flex-wrap items-center gap-3 ${
              isCash ? "justify-between" : "justify-end"
            }`}
          >
            {isCash ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={`rl-chip ${
                    amount === selected.suggestedAmount
                      ? "rl-chip-selected"
                      : ""
                  }`}
                  onClick={() => applyAmountPreset(selected.suggestedAmount)}
                >
                  {hasLateFee ? "Due + late" : "Due"}{" "}
                  {formatPHP(selected.suggestedAmount)}
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
                    Base {formatPHP(selected.baseRemaining)}
                  </button>
                ) : null}
                {showFullMonth ? (
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
                    Full month (
                    {formatPHP(selected.monthlyTotalSuggestedAmount)})
                  </button>
                ) : null}
                {showAllOpen ? (
                  <button
                    type="button"
                    className={`rl-chip ${
                      amount === totalOpenDues ? "rl-chip-selected" : ""
                    }`}
                    onClick={() =>
                      applyAmountPreset(
                        totalOpenDues,
                        autoPeriodId || undefined,
                      )
                    }
                  >
                    All open ({formatPHP(totalOpenDues)})
                  </button>
                ) : null}
              </div>
            ) : null}

            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--brand)] hover:underline"
              aria-expanded={lateFeeOpen}
              onClick={() => setLateFeeOpen((o) => !o)}
            >
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              <span>Late fee</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${
                  lateFeeOpen ? "rotate-180" : ""
                }`}
                aria-hidden
              />
            </button>
          </div>

          {lateFeeOpen ? (
            <div className="rl-inset space-y-1.5">
              <p className="type-caption font-medium text-[var(--ink)]">
                Due {formatUtcDate(selected.dueDate)} ·{" "}
                {graceDeadlineCaption(selected.graceDeadline, {
                  isWithinGrace: selected.isWithinGrace,
                  isAdvance: selected.isAdvance,
                  isOverdue: selected.isOverdue,
                })}
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
        </div>
      ) : null}

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
            <span className="type-caption text-[var(--danger)]" role="alert">
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
            className="grid grid-cols-2 gap-2 sm:grid-cols-3"
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
                  className={`rl-chip ${active ? "rl-chip-selected" : ""}`}
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
            <span className="type-caption text-[var(--danger)]" role="alert">
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
              <span className="type-caption text-[var(--danger)]" role="alert">
                {errors.referenceNumber.message}
              </span>
            ) : null}
          </label>
        )}
      </div>

      {toast ? (
        <p
          className={
            toast.type === "ok" ? "rl-alert rl-alert-ok" : "rl-alert rl-alert-error"
          }
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </p>
      ) : null}

      {showSubmit ? (
        <div className="border-t border-[var(--border-subtle)] pt-3">
          <PayDetailsSubmit
            canSubmit={canSubmit}
            pending={pending}
            isCash={isCash}
            compressedFile={compressedFile}
            amount={amount}
          />
        </div>
      ) : null}
    </>
  );
}
