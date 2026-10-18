export default function PayLoading() {
  return (
    <div className="rl-fund-frame rl-pay-page animate-pulse" aria-hidden>
      <div className="space-y-2 border-b border-[var(--border)] pb-4">
        <div className="h-3.5 w-28 rounded bg-[var(--border)]/70" />
        <div className="h-8 w-64 rounded bg-[var(--border)]/60" />
        <div className="h-4 w-80 rounded bg-[var(--border)]/45" />
      </div>
      <div className="rl-pay-grid">
        <div className="h-96 rounded-[var(--radius-card)] bg-[var(--border)]/50" />
        <div className="space-y-5">
          <div className="h-36 rounded-[var(--radius-card)] bg-[var(--border)]/50" />
          <div className="h-48 rounded-[var(--radius-card)] bg-[var(--border)]/45" />
          <div className="h-56 rounded-[var(--radius-card)] bg-[var(--border)]/40" />
        </div>
      </div>
    </div>
  );
}
