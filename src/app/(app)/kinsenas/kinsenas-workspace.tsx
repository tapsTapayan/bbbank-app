"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2 } from "lucide-react";
import {
  openCurrentKinsenaAction,
  openNextKinsenaAction,
  openKinsenaPeriodAction,
  openPayableWindowAction,
} from "@/actions/contributions";
import { OpsWorkstation } from "@/components/ui/ops-workstation";

export function KinsenasWorkspace({
  cycleName,
  previewCurrent,
  previewNext,
}: {
  cycleName: string | null;
  previewCurrent: {
    year: number;
    monthIndex: number;
    kinsenaIndex: 1 | 2;
    label: string;
  };
  previewNext: {
    year: number;
    monthIndex: number;
    kinsenaIndex: 1 | 2;
    label: string;
  };
}) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(
    action: () => Promise<{
      success: boolean;
      error?: string;
      message?: string;
    }>,
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setToast(result.error ?? "Failed.");
        return;
      }
      setToast(result.message ?? "Kinsena opened.");
      router.refresh();
    });
  }

  return (
    <OpsWorkstation
      title="Open contribution periods"
      description={cycleName ?? "No active cycle"}
      bodyClassName="ui-page max-w-4xl"
    >
      {toast ? (
        <p className="ui-alert ui-alert-info mb-4" role="status">
          {toast}
        </p>
      ) : null}

      {!cycleName ? (
        <p className="ui-alert ui-alert-warn mb-4">
          No active cycle — start one on Cycle settings.
        </p>
      ) : null}

      <div className="ui-desk ui-desk-col">
        <section className="ui-desk-section">
          <h2 className="type-title">Open payable window</h2>
          <p className="type-caption">
            Cycle start through next period (catch-up, current, advance).
          </p>
          <button
            type="button"
            disabled={pending || !cycleName}
            className="ui-btn ui-btn-primary sm:w-auto"
            onClick={() => run(() => openPayableWindowAction())}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Open year to date + next
          </button>
        </section>

        <div className="ui-desk-split">
          <section>
            <div className="flex items-center gap-2">
              <CalendarPlus
                className="h-4 w-4 text-[var(--brand)]"
                aria-hidden
              />
              <h2 className="type-title">Current</h2>
            </div>
            <p className="type-body-sm font-medium">{previewCurrent.label}</p>
            <button
              type="button"
              disabled={pending || !cycleName}
              className="ui-btn ui-btn-primary mt-auto sm:w-auto"
              onClick={() => run(() => openCurrentKinsenaAction())}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Open current
            </button>
          </section>

          <section>
            <div className="flex items-center gap-2">
              <CalendarPlus
                className="h-4 w-4 text-[var(--brand)]"
                aria-hidden
              />
              <h2 className="type-title">Next (advance)</h2>
            </div>
            <p className="type-body-sm font-medium">{previewNext.label}</p>
            <div className="mt-auto flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending || !cycleName}
                className="ui-btn ui-btn-secondary"
                onClick={() => run(() => openNextKinsenaAction())}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Open next
              </button>
              <button
                type="button"
                disabled={pending || !cycleName}
                className="ui-btn ui-btn-ghost"
                onClick={() =>
                  run(() =>
                    openKinsenaPeriodAction({
                      year: previewNext.year,
                      monthIndex: previewNext.monthIndex,
                      kinsenaIndex: previewNext.kinsenaIndex,
                    }),
                  )
                }
              >
                Open {previewNext.label}
              </button>
            </div>
          </section>
        </div>
      </div>
    </OpsWorkstation>
  );
}
