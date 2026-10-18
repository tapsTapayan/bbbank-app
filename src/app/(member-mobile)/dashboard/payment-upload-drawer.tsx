"use client";

import { useEffect, useState, useTransition } from "react";
import { Drawer } from "vaul";
import { Loader2, Upload, X } from "lucide-react";
import { submitPaymentProof } from "@/actions/payment-submission";
import { compressAndUploadReceipt } from "@/lib/storage/upload-receipt";
import type { PaymentTargetOption } from "@/lib/queries/member-payment-targets";

type PaymentUploadDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  targets: PaymentTargetOption[];
};

const CHANNELS = [
  { value: "GCASH", label: "GCash" },
  { value: "MAYA", label: "Maya" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CASH", label: "Cash" },
] as const;

export function PaymentUploadDrawer({
  open,
  onOpenChange,
  userId,
  targets,
}: PaymentUploadDrawerProps) {
  const [targetId, setTargetId] = useState(targets[0]?.id ?? "");
  const [paymentChannel, setPaymentChannel] =
    useState<(typeof CHANNELS)[number]["value"]>("GCASH");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [amount, setAmount] = useState(targets[0]?.suggestedAmount ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [toast, setToast] = useState<{
    type: "ok" | "err";
    message: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = targets.find((t) => t.id === targetId) ?? targets[0];

  useEffect(() => {
    if (!open) return;
    const first = targets[0];
    if (first) {
      setTargetId(first.id);
      setAmount(first.suggestedAmount);
    }
  }, [open, targets]);

  useEffect(() => {
    if (!selected) return;
    setAmount(selected.suggestedAmount);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(type: "ok" | "err", message: string) {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 4500);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) {
      showToast("err", "No open contribution or loan installment to pay.");
      return;
    }
    if (!file) {
      showToast("err", "Please attach a receipt image.");
      return;
    }
    if (!referenceNumber.trim()) {
      showToast("err", "Reference number is required.");
      return;
    }

    startTransition(async () => {
      try {
        const receiptPath = await compressAndUploadReceipt({
          file,
          cycleId: selected.cycleId,
          userId,
          referenceNumber,
        });

        const result = await submitPaymentProof({
          amount,
          targetType: selected.targetType,
          targetId: selected.id,
          paymentChannel,
          referenceNumber,
          receiptPath,
        });

        if (!result.success) {
          showToast("err", result.error);
          return;
        }

        showToast("ok", result.message ?? "Payment proof submitted.");
        setReferenceNumber("");
        setFile(null);
        onOpenChange(false);
      } catch (err) {
        showToast(
          "err",
          err instanceof Error ? err.message : "Upload failed.",
        );
      }
    });
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-[70] flex max-h-[92dvh] flex-col rounded-t-2xl bg-[var(--surface-elevated)] outline-none">
          <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-[var(--border)]" />
          <div className="flex items-center justify-between px-4 pb-2 pt-3">
            <Drawer.Title className="text-base font-semibold text-[var(--ink)]">
              Upload proof of payment
            </Drawer.Title>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface)]"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Drawer.Description className="px-4 pb-3 text-xs text-[var(--ink-muted)]">
            Compresses your receipt to WebP and queues it for treasurer
            verification.
          </Drawer.Description>

          <form
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          >
            {targets.length === 0 ? (
              <p className="rounded-xl bg-[var(--surface)] px-3 py-4 text-sm text-[var(--ink-muted)]">
                No open contributions or loan installments right now.
              </p>
            ) : (
              <>
                <label className="block text-xs font-medium text-[var(--ink-muted)]">
                  Paying for
                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)]"
                  >
                    {targets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.targetType === "CONTRIBUTION" ? "Contribution" : "Loan"}{" "}
                        · {t.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs font-medium text-[var(--ink-muted)]">
                  Amount (₱)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm tabular-nums text-[var(--ink)]"
                    required
                  />
                </label>

                <label className="block text-xs font-medium text-[var(--ink-muted)]">
                  Channel
                  <select
                    value={paymentChannel}
                    onChange={(e) =>
                      setPaymentChannel(
                        e.target.value as (typeof CHANNELS)[number]["value"],
                      )
                    }
                    className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)]"
                  >
                    {CHANNELS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs font-medium text-[var(--ink-muted)]">
                  Reference number
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="e.g. GCASH-9823746510"
                    className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 font-mono text-sm text-[var(--ink)]"
                    required
                  />
                </label>

                <label className="block text-xs font-medium text-[var(--ink-muted)]">
                  Receipt image
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="mt-1.5 block w-full text-sm text-[var(--ink)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--brand-soft)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[var(--brand)]"
                    required
                  />
                </label>
              </>
            )}

            {toast && (
              <p
                className={
                  toast.type === "ok"
                    ? "rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"
                    : "rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800"
                }
                role="status"
              >
                {toast.message}
              </p>
            )}

            <button
              type="submit"
              disabled={pending || targets.length === 0}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--brand)] px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {pending ? "Uploading…" : "Submit for verification"}
            </button>
          </form>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
