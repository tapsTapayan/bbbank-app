"use client";

import {
  Banknote,
  CheckCircle2,
  CircleDot,
  Flag,
  HandCoins,
  Upload,
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

function dayKey(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function HistoryClient({ events }: { events: MemberHistoryEvent[] }) {
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
              Submitted payments, treasurer verifications, and loan
              request / release events will appear here.
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
                    <div className="rl-history-card min-w-0">
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="type-body-sm font-semibold text-[var(--ink)]">
                            {event.title}
                          </p>
                          <p className="type-caption mt-0.5 font-mono tabular-nums text-[var(--ink-muted)]">
                            {formatWhen(event.at)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {event.amountLabel ? (
                            <span className="font-mono text-sm font-bold tabular-nums text-[var(--ink)]">
                              {event.amountLabel}
                            </span>
                          ) : null}
                          {event.pill ? (
                            <StatusPill
                              status={event.pill}
                              label={event.pillLabel ?? undefined}
                            />
                          ) : event.pillLabel ? (
                            <NeutralPill>{event.pillLabel}</NeutralPill>
                          ) : null}
                        </div>
                      </div>
                      <p className="type-caption mt-2 text-[var(--ink-secondary)]">
                        {event.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </FundCanvas>
  );
}
