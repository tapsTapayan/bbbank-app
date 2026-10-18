export default function DashboardLoading() {
  return (
    <div className="ui-fund-frame ui-dash animate-pulse" aria-hidden>
      <div className="space-y-2">
        <div className="h-7 w-36 rounded-[var(--radius)] bg-[var(--border)]" />
        <div className="h-4 w-52 rounded-[var(--radius)] bg-[var(--border)]" />
      </div>
      <div className="ui-desk h-52 bg-[var(--border)]/50" />
      <div className="ui-desk h-44 bg-[var(--border)]/40" />
      <div className="ui-desk h-36 bg-[var(--border)]/40" />
    </div>
  );
}
