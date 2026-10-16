/** Skeleton shown while a dashboard route's data resolves. */
export default function DashboardLoading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <div className="mb-6 h-7 w-56 rounded-control bg-[color:var(--color-border)]" />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[104px] rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-elevated)]"
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-72 rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] lg:col-span-2" />
        <div className="h-72 rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-elevated)]" />
      </div>
    </div>
  );
}
