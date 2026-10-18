"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  CheckCircle2,
  Loader2,
  Sparkles,
  CalendarClock,
} from "lucide-react";
import {
  openCurrentKinsenaAction,
  openNextKinsenaAction,
  openPayableWindowAction,
} from "@/actions/contributions";
import { OpsWorkstation } from "@/components/ui/ops-workstation";

type PreviewPeriod = {
  year: number;
  monthIndex: number;
  kinsenaIndex: 1 | 2;
  label: string;
};

export function KinsenasWorkspace({
  cycleName,
  previewCurrent,
  previewNext,
}: {
  cycleName: string | null;
  previewCurrent: PreviewPeriod;
  previewNext: PreviewPeriod;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const hasActiveCycle = Boolean(cycleName);

  function openPeriod(target: "current" | "next" | "window") {
    startTransition(async () => {
      const result =
        target === "current"
          ? await openCurrentKinsenaAction()
          : target === "next"
            ? await openNextKinsenaAction()
            : await openPayableWindowAction();
      if (!result.success) {
        setToast({ type: "err", text: result.error });
        return;
      }
      setToast({
        type: "ok",
        text: result.message ?? "Kinsena obligations opened.",
      });
      router.refresh();
    });
  }

  return (
    <OpsWorkstation
      title="Kinsenas Period Generator"
      description={
        cycleName
          ? `Active cycle: ${cycleName} · Generate 15th & EOM contribution rows (₱250 × heads)`
          : "No active fund cycle configured"
      }
      actions={
        <>
          <span
            className={
              hasActiveCycle
                ? "rl-pill rl-pill-verified"
                : "rl-pill rl-pill-rejected"
            }
          >
            {hasActiveCycle ? `Cycle: ${cycleName}` : "No Active Cycle"}
          </span>
          {toast ? (
            <p
              className={`rl-alert !py-1.5 !px-3 type-caption ${
                toast.type === "ok" ? "rl-alert-ok" : "rl-alert-error"
              }`}
              role="status"
            >
              {toast.text}
            </p>
          ) : null}
        </>
      }
    >
      <div className="mx-auto max-w-4xl rl-stack">
        {!hasActiveCycle ? (
          <div className="rl-alert rl-alert-warn flex flex-wrap items-center justify-between gap-3">
            <span>
              Create or activate a fund cycle before opening kinsenas contribution periods.
            </span>
            <Link href="/cycle" className="rl-btn rl-btn-primary rl-btn-sm">
              Configure Cycle Settings
            </Link>
          </div>
        ) : null}

        {/* Recommended Bulk Window Card */}
        <section className="rl-vault-card">
          <div className="rl-vault-body">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="rl-vault-eyebrow">Recommended Bulk Action</p>
                <h2 className="mt-1 text-xl font-bold text-white">
                  Synchronize Payable Window (YTD + Next Kinsena)
                </h2>
                <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-white/80">
                  Idempotently creates all 15th & EOM contribution rows from the start of the active cycle through the upcoming kinsena so members can settle past-due, current, or advance obligations immediately.
                </p>
              </div>
              <span className="rl-vault-badge">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Idempotent
              </span>
            </div>

            <div className="pt-2">
              <button
                type="button"
                disabled={pending || !hasActiveCycle}
                onClick={() => openPeriod("window")}
                className="rl-btn rl-btn-vault rl-btn-lg"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CalendarPlus className="h-4 w-4" />
                )}
                Open All Payable Periods (YTD + Next)
              </button>
            </div>
          </div>
        </section>

        {/* Individual Period Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rl-desk rl-desk-section flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="type-label text-[var(--brand)]">
                  Current Kinsena
                </span>
                <span className="rl-pill rl-pill-neutral">
                  Kinsena #{previewCurrent.kinsenaIndex}
                </span>
              </div>
              <h2 className="type-heading mt-2">{previewCurrent.label}</h2>
              <p className="type-caption mt-1.5 flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                Generates ₱250 × heads rows for the current half-month window.
              </p>
            </div>
            <button
              type="button"
              disabled={pending || !hasActiveCycle}
              onClick={() => openPeriod("current")}
              className="rl-btn rl-btn-primary rl-btn-block mt-4"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarPlus className="h-4 w-4" />
              )}
              Open Current Kinsena
            </button>
          </div>

          <div className="rl-desk rl-desk-section flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="type-label">Next Kinsena (Advance)</span>
                <span className="rl-pill rl-pill-neutral">
                  Kinsena #{previewNext.kinsenaIndex}
                </span>
              </div>
              <h2 className="type-heading mt-2">{previewNext.label}</h2>
              <p className="type-caption mt-1.5 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Opens the upcoming kinsena early so members can pay in advance.
              </p>
            </div>
            <button
              type="button"
              disabled={pending || !hasActiveCycle}
              onClick={() => openPeriod("next")}
              className="rl-btn rl-btn-secondary rl-btn-block mt-4"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarPlus className="h-4 w-4" />
              )}
              Open Next Kinsena
            </button>
          </div>
        </div>
      </div>
    </OpsWorkstation>
  );
}
