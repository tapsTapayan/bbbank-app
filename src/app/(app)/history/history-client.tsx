"use client";

import { useEffect, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Flag,
  HandCoins,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { FundCanvas } from "@/components/system/frames/fund-canvas";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill, NeutralPill } from "@/components/ui/status-pill";
import type { MemberHistoryEvent } from "@/lib/queries/member-transaction-history";

function EventIcon({ kind }: { kind: MemberHistoryEvent["kind"] }) {
  const className = "h-4 w-4";
  switch (kind) {
    case "PAYMENT_SUBMITTED":
      return <Upload className={className} aria-hidden />;
    case "PAYMENT_VERIFIED":
    case "PAYMENT_AUDITED":
      return <CheckCircle2 className={className} aria-hidden />;
    case "PAYMENT_REJECTED":
    case "LOAN_REJECTED":
    case "PAYMENT_FLAGGED":
      return kind === "PAYMENT_FLAGGED" ? (
        <Flag className={className} aria-hidden />
      ) : (
        <XCircle className={className} aria-hidden />
      );
    case "LOAN_REQUESTED":
    case "LOAN_APPROVED":
      return <HandCoins className={className} aria-hidden />;
    case "LOAN_RELEASED":
      return <Banknote className={className} aria-hidden />;
    default:
      return <CircleDot className={className} aria-hidden />;
  }
}

function toneClass(tone: MemberHistoryEvent["tone"]): string {
  switch (tone) {
    case "success":
      return "rl-history-dot--success";
    case "danger":
      return "rl-history-dot--danger";
    case "pending":
      return "rl-history-dot--pending";
    case "brand":
      return "rl-history-dot--brand";
    default:
      return "rl-history-dot--neutral";
  }
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function EventStatus({ event }: { event: MemberHistoryEvent }) {
  if (event.pill) {
    return (
      <StatusPill status={event.pill} label={event.pillLabel ?? undefined} />
    );
  }
  if (event.pillLabel) {
    return <NeutralPill>{event.pillLabel}</NeutralPill>;
  }
  return null;
}

function HistoryDetailModal({
  event,
  onClose,
}: {
  event: MemberHistoryEvent;
  onClose: () => void;
}) {
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

  return (
    <div
      className="rl-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-detail-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="rl-modal-dialog rl-history-dialog">
        <div className="rl-history-dialog__head">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={`rl-history-dot ${toneClass(event.tone)}`}
              aria-hidden
            >
              <EventIcon kind={event.kind} />
            </span>
            <h2
              id="history-detail-heading"
              className="type-title truncate text-[var(--ink)]"
            >
              {event.title}
            </h2>
          </div>
          <button
            type="button"
            className="rl-icon-btn rl-icon-btn-sm"
            aria-label="Close details"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rl-history-dialog__body rl-stack">
          <div className="flex flex-wrap items-end justify-between gap-3">
            {event.amountLabel ? (
              <p className="font-mono text-2xl font-bold tabular-nums tracking-tight text-[var(--ink)]">
                {event.amountLabel}
              </p>
            ) : (
              <span />
            )}
            <EventStatus event={event} />
          </div>

          <dl className="rl-history-detail-grid">
            <div>
              <dt className="type-label text-[var(--ink-muted)]">When</dt>
              <dd className="type-body-sm mt-0.5 font-mono tabular-nums text-[var(--ink)]">
                {formatWhen(event.at)}
              </dd>
            </div>
            <div>
              <dt className="type-label text-[var(--ink-muted)]">Details</dt>
              <dd className="type-body-sm mt-0.5 text-[var(--ink-secondary)]">
                {event.detail}
              </dd>
            </div>
          </dl>

          {event.allocations.length > 0 ? (
            <div>
              <p className="type-label text-[var(--ink-muted)]">
                Allocated periods
              </p>
              <ul className="mt-2 space-y-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface)] p-3">
                {event.allocations.map((line) => (
                  <li
                    key={line}
                    className="type-caption font-mono tabular-nums text-[var(--ink-secondary)]"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function HistoryClient({ events }: { events: MemberHistoryEvent[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = events.find((e) => e.id === selectedId) ?? null;

  const groups = new Map<string, MemberHistoryEvent[]>();
  for (const event of events) {
    const key = dayKey(event.at);
    const list = groups.get(key) ?? [];
    list.push(event);
    groups.set(key, list);
  }

  return (
    <FundCanvas>
      <PageHeader
        title="Transaction history"
        description="Payments, verifications, and loan activity on your account."
      />

      {events.length === 0 ? (
        <section className="rl-dash-panel" aria-label="Empty history">
          <div className="rl-dash-empty py-12">
            <p className="type-body-sm font-medium text-[var(--ink-secondary)]">
              No transactions yet
            </p>
            <p className="type-caption mt-1 max-w-sm text-center">
              Submitted payments, treasurer verifications, and loan request /
              release events will appear here.
            </p>
          </div>
        </section>
      ) : (
        <div className="rl-history space-y-8">
          {[...groups.entries()].map(([day, dayEvents], dayIndex) => (
            <section key={day} aria-labelledby={`history-day-${dayIndex}`}>
              <h2
                className="type-label mb-3 text-[var(--ink-muted)]"
                id={`history-day-${dayIndex}`}
              >
                {day}
              </h2>
              <ol className="rl-history-list">
                {dayEvents.map((event) => (
                  <li key={event.id} className="rl-history-item">
                    <span
                      className={`rl-history-dot ${toneClass(event.tone)}`}
                      aria-hidden
                    >
                      <EventIcon kind={event.kind} />
                    </span>
                    <button
                      type="button"
                      className="rl-history-card rl-history-card--interactive min-w-0"
                      onClick={() => setSelectedId(event.id)}
                      aria-haspopup="dialog"
                    >
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="type-body-sm font-semibold text-[var(--ink)]">
                            {event.title}
                          </p>
                          <p className="type-caption mt-0.5 font-mono tabular-nums text-[var(--ink-muted)]">
                            {formatTime(event.at)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <div className="flex flex-col items-end gap-1.5">
                            {event.amountLabel ? (
                              <span className="font-mono text-sm font-bold tabular-nums text-[var(--ink)]">
                                {event.amountLabel}
                              </span>
                            ) : null}
                            <EventStatus event={event} />
                          </div>
                          <ChevronRight
                            className="h-4 w-4 shrink-0 text-[var(--ink-muted)]"
                            aria-hidden
                          />
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {selected ? (
        <HistoryDetailModal
          event={selected}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </FundCanvas>
  );
}
