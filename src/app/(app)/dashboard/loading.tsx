export default function DashboardLoading() {
  return (
    <div className="rl-fund-frame animate-pulse" aria-hidden>
      <div className="space-y-2 border-b border-[var(--border)] pb-4">
        <div className="h-3.5 w-32 rounded bg-[var(--border)]/70" />
        <div className="h-8 w-56 rounded bg-[var(--border)]/60" />
        <div className="h-4 w-72 rounded bg-[var(--border)]/45" />
      </div>
      <div className="rl-dash-grid">
        <div className="rl-dash-primary rl-fund-stack">
          <div className="h-64 rounded-[var(--radius-lg)] bg-[var(--border)]/60" />
        </div>
        <div className="rl-dash-secondary rl-fund-stack">
          <div className="grid grid-cols-2 gap-3">
            <div className="h-24 rounded-[var(--radius-card)] bg-[var(--border)]/50" />
            <div className="h-24 rounded-[var(--radius-card)] bg-[var(--border)]/50" />
          </div>
          <div className="h-56 rounded-[var(--radius-card)] bg-[var(--border)]/45" />
        </div>
        <div className="rl-dash-ledger">
          <div className="h-52 rounded-[var(--radius-card)] bg-[var(--border)]/45" />
        </div>
      </div>
    </div>
  );
}
