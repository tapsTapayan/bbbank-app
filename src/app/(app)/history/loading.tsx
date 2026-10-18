export default function HistoryLoading() {
  return (
    <div className="rl-fund-frame animate-pulse" aria-hidden>
      <div className="space-y-2 border-b border-[var(--border)] pb-4">
        <div className="h-3.5 w-32 rounded bg-[var(--border)]/70" />
        <div className="h-8 w-48 rounded bg-[var(--border)]/60" />
        <div className="h-4 w-64 rounded bg-[var(--border)]/45" />
      </div>
      <div className="rl-fund-stack mt-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="h-20 rounded-[var(--radius-card)] bg-[var(--border)]/45"
            style={{ opacity: 1 - i * 0.1 }}
          />
        ))}
      </div>
    </div>
  );
}
