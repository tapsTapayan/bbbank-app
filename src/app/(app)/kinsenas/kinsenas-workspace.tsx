"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2 } from "lucide-react";
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
      title="Kinsenas"
      description={
        cycleName
          ? `${cycleName} · auto-opens on each due day`
          : "Auto-opens on each due day"
      }
      actions={
        <>
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
            <span>Activate a fund cycle first.</span>
            <Link href="/cycle" className="rl-btn rl-btn-primary rl-btn-sm">
              Cycle settings
            </Link>
          </div>
        ) : (
          <p className="type-caption text-[var(--ink-muted)]">
            New periods open automatically at midnight PH when a kinsena due
            day arrives (15th or month-end). Use the buttons below only to
            catch up early or recover a missed run.
          </p>
        )}

        {/* Recommended Bulk Window Card */}
        <section className="rl-vault-card">
          <div className="rl-vault-body">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">
                  Manual catch-up
                </h2>
                <p className="mt-1.5 text-xs text-white/80">
                  Open cycle start through next payable kinsena · ₱250 × heads
                </p>
              </div>
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
                Open YTD + next
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
              Open current
            </button>
          </div>

          <div className="rl-desk rl-desk-section flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="type-label">Next kinsena</span>
                <span className="rl-pill rl-pill-neutral">
                  Kinsena #{previewNext.kinsenaIndex}
                </span>
              </div>
              <h2 className="type-heading mt-2">{previewNext.label}</h2>
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
              Open next
            </button>
          </div>
        </div>
      </div>
    </OpsWorkstation>
  );
}
