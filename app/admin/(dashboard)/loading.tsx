/** Instant placeholder while an admin page renders on the server. */
export default function AdminLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div>
        <div className="h-8 w-48 rounded-lg bg-bg-3" />
        <div className="mt-3 h-4 w-64 max-w-full rounded bg-bg-3" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-line-strong bg-surface p-5">
            <div className="h-3 w-20 rounded bg-bg-3" />
            <div className="mt-3 h-8 w-16 rounded bg-bg-3" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-line-strong bg-surface p-5">
        <div className="h-4 w-32 rounded bg-bg-3" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="mt-4 h-4 w-full rounded bg-bg-3" />
        ))}
      </div>
    </div>
  );
}
