export default function DashboardLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-[var(--border)]" />
      <div className="h-32 rounded-2xl bg-[var(--border)]" />
      <div className="h-40 rounded-2xl bg-[var(--border)]" />
      <div className="h-12 rounded-2xl bg-[var(--border)]" />
    </div>
  );
}
