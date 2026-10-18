export default function PayLoading() {
  return (
    <div className="ui-pay-page animate-pulse" aria-hidden>
      <div className="h-8 w-48 rounded-[var(--radius)] bg-[var(--border)]" />
      <div className="ui-desk ui-pay-shell min-h-[28rem]">
        <div className="ui-pay-rail gap-3">
          <div className="h-16 rounded-[var(--radius)] bg-[var(--border)]" />
          <div className="h-40 rounded-[var(--radius)] bg-[var(--border)]" />
        </div>
        <div className="ui-pay-work">
          <div className="h-16 border-b border-[var(--border)] bg-[var(--border)]/40" />
          <div className="m-5 h-36 rounded-[var(--radius)] bg-[var(--border)]" />
          <div className="mx-5 mb-5 h-24 rounded-[var(--radius)] bg-[var(--border)]" />
        </div>
      </div>
    </div>
  );
}
