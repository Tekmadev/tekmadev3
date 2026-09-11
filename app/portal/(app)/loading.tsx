/**
 * Instant placeholder while a portal page renders on the server. Mirrors the
 * dashboard's shape (header, tracker card, two panels) so the swap to real
 * content is calm rather than a jump.
 */
export default function PortalLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div>
        <div className="h-8 w-56 max-w-full rounded-lg bg-bg-3" />
        <div className="mt-3 h-4 w-80 max-w-full rounded bg-bg-3" />
      </div>
      <div className="rounded-2xl border border-line-strong bg-surface p-5 sm:p-6">
        <div className="h-3 w-24 rounded bg-bg-3" />
        <div className="mt-2 h-6 w-40 rounded bg-bg-3" />
        <div className="mt-4 h-2 w-full rounded-full bg-bg-3" />
        <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className={i > 2 ? "hidden sm:block" : ""}>
              <div className="h-7 w-7 rounded-full bg-bg-3" />
              <div className="mt-2 h-3 w-14 rounded bg-bg-3" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="rounded-2xl border border-line-strong bg-surface p-5 sm:p-6 lg:col-span-3">
          <div className="h-4 w-44 rounded bg-bg-3" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="mt-5 flex gap-3">
              <div className="h-4 w-4 rounded-full bg-bg-3" />
              <div className="flex-1">
                <div className="h-4 w-3/4 rounded bg-bg-3" />
                <div className="mt-2 h-3 w-1/2 rounded bg-bg-3" />
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-line-strong bg-surface p-5 sm:p-6 lg:col-span-2">
          <div className="h-4 w-32 rounded bg-bg-3" />
          <div className="mt-4 h-3 w-full rounded bg-bg-3" />
          <div className="mt-2 h-3 w-5/6 rounded bg-bg-3" />
          <div className="mt-6 h-11 w-36 rounded-full bg-bg-3" />
        </div>
      </div>
    </div>
  );
}
