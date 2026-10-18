import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--surface)] px-6 text-center">
      <h1 className="text-2xl font-bold text-[var(--ink)]">Access denied</h1>
      <p className="mt-2 max-w-md text-sm text-[var(--ink-muted)]">
        Your role does not have permission to view this console area. Contact an
        admin if you need Treasurer or Auditor access.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white"
      >
        Go to member dashboard
      </Link>
    </div>
  );
}
