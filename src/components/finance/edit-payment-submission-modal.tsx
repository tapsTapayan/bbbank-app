"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { updatePaymentSubmission } from "@/actions/payment-submission";
import { fetchReceiptSignedUrl } from "@/actions/receipts";
import { compressAndUploadReceipt } from "@/lib/storage/upload-receipt";
import { formatPHP } from "@/lib/finance/loan-calculator";
import type { MemberPendingSubmission } from "@/lib/queries/member-pending-submissions";

const CHANNELS = [
  { value: "GCASH", label: "GCash" },
  { value: "MAYA", label: "Maya" },
  { value: "BANK_TRANSFER", label: "Bank" },
  { value: "OTHER_DIGITAL", label: "Other Digital" },
  { value: "CASH", label: "Cash" },
] as const;

type Channel = (typeof CHANNELS)[number]["value"];

function todayLocalIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function cashRefBlank(submission: MemberPendingSubmission): string {
  return submission.paymentChannel === "CASH" &&
    submission.referenceNumber.startsWith("CASH-")
    ? ""
    : submission.referenceNumber;
}

type EditPaymentSubmissionModalProps = {
  submission: MemberPendingSubmission;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
};

export function EditPaymentSubmissionModal({
  submission,
  userId,
  onClose,
  onSaved,
}: EditPaymentSubmissionModalProps) {
  const [amount, setAmount] = useState(submission.amount.toFixed(2));
  const [paidAt, setPaidAt] = useState(submission.paidAt);
  const [paymentChannel, setPaymentChannel] = useState<Channel>(
    submission.paymentChannel,
  );
  const [referenceNumber, setReferenceNumber] = useState(
    cashRefBlank(submission),
  );
  const [existingReceiptPath, setExistingReceiptPath] = useState(
    submission.receiptUrl,
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isCash = paymentChannel === "CASH";
  const hasReceipt = Boolean(newFile) || Boolean(existingReceiptPath);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    if (!submission.receiptUrl) {
      setPreviewUrl(null);
      return;
    }
    void (async () => {
      const signed = await fetchReceiptSignedUrl(submission.receiptUrl!);
      if (!cancelled && signed.success) {
        setPreviewUrl(signed.data.url);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [submission.receiptUrl]);

  function onFileSelected(file: File | null) {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setNewFile(null);
    setExistingReceiptPath(null);
    setPreviewUrl(null);
    if (!file) return;
    setNewFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function handleSave() {
    setError(null);
    const trimmedAmount = amount.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(trimmedAmount) || Number(trimmedAmount) <= 0) {
      setError("Enter a valid amount greater than zero.");
      return;
    }
    if (!paidAt || paidAt > todayLocalIsoDate()) {
      setError("Payment date is required and cannot be in the future.");
      return;
    }
    if (!isCash && !referenceNumber.trim()) {
      setError("Reference number is required for digital payments.");
      return;
    }
    if (!isCash && !hasReceipt) {
      setError("Attach a receipt image for digital payments.");
      return;
    }

    startTransition(async () => {
      try {
        let receiptPath: string | null = null;
        if (newFile) {
          receiptPath = await compressAndUploadReceipt({
            file: newFile,
            cycleId: submission.cycleId,
            userId,
            referenceNumber:
              referenceNumber.trim() ||
              `CASH-${paidAt.replace(/-/g, "")}`,
          });
        }

        const result = await updatePaymentSubmission({
          submissionId: submission.id,
          amount: trimmedAmount,
          targetType: submission.targetType,
          targetId: submission.targetId,
          paymentChannel,
          referenceNumber: referenceNumber.trim(),
          receiptPath,
          paidAt,
        });

        if (!result.success) {
          setError(result.error);
          return;
        }
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save changes.");
      }
    });
  }

  return (
    <div
      className="rl-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-payment-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="rl-modal-dialog max-w-md">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="edit-payment-heading"
              className="type-title text-[var(--ink)]"
            >
              Edit payment
            </h2>
            <p className="type-caption mt-1 text-[var(--ink-secondary)]">
              {submission.label} · still awaiting verification
            </p>
          </div>
          <button
            type="button"
            className="rl-icon-btn rl-icon-btn-sm"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rl-stack">
          <label className="rl-field">
            <span className="type-label">Amount</span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="rl-input font-mono"
              autoComplete="off"
            />
          </label>

          <label className="rl-field">
            <span className="type-label">Payment date</span>
            <input
              type="date"
              value={paidAt}
              max={todayLocalIsoDate()}
              onChange={(e) => setPaidAt(e.target.value)}
              className="rl-input font-mono"
            />
          </label>

          <fieldset className="rl-field">
            <legend className="type-label">Channel</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {CHANNELS.map((ch) => (
                <button
                  key={ch.value}
                  type="button"
                  className={`rl-chip !min-h-9 ${
                    paymentChannel === ch.value ? "rl-chip-selected" : ""
                  }`}
                  aria-pressed={paymentChannel === ch.value}
                  onClick={() => setPaymentChannel(ch.value)}
                >
                  {ch.label}
                </button>
              ))}
            </div>
          </fieldset>

          {!isCash ? (
            <label className="rl-field">
              <span className="type-label">Reference number</span>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="rl-input font-mono"
                autoComplete="off"
                placeholder="e.g. 901234567890"
              />
            </label>
          ) : null}

          <div className="rl-field">
            <span className="type-label">
              Receipt{isCash ? " (optional)" : ""}
            </span>
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed / blob preview
              <img
                src={previewUrl}
                alt="Payment receipt"
                className="mt-1.5 max-h-40 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-contain bg-[var(--surface)]"
              />
            ) : (
              <p className="type-caption mt-1.5 text-[var(--ink-muted)]">
                No receipt image
              </p>
            )}
            <label className="rl-btn rl-btn-secondary rl-btn-sm mt-2 inline-flex cursor-pointer">
              <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {hasReceipt ? "Replace receipt" : "Attach receipt"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) =>
                  onFileSelected(e.target.files?.[0] ?? null)
                }
              />
            </label>
          </div>

          {error ? (
            <p className="rl-alert rl-alert-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t border-[var(--border-subtle)] pt-4">
            <button
              type="button"
              className="rl-btn rl-btn-primary rl-btn-sm"
              disabled={pending}
              onClick={handleSave}
            >
              {pending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              {pending
                ? "Saving…"
                : `Save ${formatPHP(Number(amount) || 0)}`}
            </button>
            <button
              type="button"
              className="rl-btn rl-btn-ghost rl-btn-sm"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
