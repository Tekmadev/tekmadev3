const BAR = "rounded-full bg-bg-3";

/** A card with a title and label/value rows, shaped like the portal Panel and Row. */
function CardSkeleton({ rows, titleWidth }: { rows: number; titleWidth: string }) {
  return (
    <div className="rounded-2xl border border-line-strong bg-surface p-5 sm:p-6">
      <div className={`mb-4 h-4 ${titleWidth} ${BAR}`} />
      <div className="-my-2.5 divide-y divide-line">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:gap-6">
            <div className={`h-3 w-20 sm:w-28 ${BAR}`} />
            <div className={`h-4 ${i % 2 === 0 ? "w-2/3" : "w-1/2"} max-w-xs ${BAR}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The lead page while it loads on the server, shaped like the page so
 * nothing jumps: the way back, the title, the badges, the contact dock (fixed
 * at the bottom on phones, a row under the title from lg), the main button,
 * Outreach and Details.
 */
export default function LeadLoading() {
  return (
    <div className="flex flex-col gap-5 lg:max-w-3xl">
      <span role="status" className="sr-only">
        Loading lead
      </span>
      {/* The pulse only runs when the phone allows motion (Reduce Motion off). */}
      <div aria-hidden className="flex flex-col gap-5 motion-safe:animate-pulse">
        <div className="flex min-h-11 items-center justify-between gap-2">
          <div className={`h-4 w-16 ${BAR}`} />
          <div className={`h-4 w-20 ${BAR}`} />
        </div>

        <div className="flex flex-col gap-2">
          <div className="h-8 w-3/4 max-w-sm rounded-lg bg-bg-3 sm:h-9" />
          <div className="h-4 w-1/2 max-w-xs rounded bg-bg-3" />
          <div className="flex gap-2 pt-1">
            <div className={`h-6 w-16 ${BAR}`} />
            <div className={`h-6 w-20 ${BAR}`} />
          </div>
        </div>

        {/* Same box as the contact dock. */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0">
          <div className="mx-auto flex min-h-16 max-w-lg items-stretch gap-1 px-2 py-1 lg:mx-0 lg:max-w-md lg:px-0">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1">
                <div className="h-10 w-10 rounded-full bg-bg-3" />
                <div className={`h-2.5 w-8 ${BAR}`} />
              </div>
            ))}
          </div>
        </div>

        <div className={`h-11 w-full sm:w-60 ${BAR}`} />

        <CardSkeleton rows={5} titleWidth="w-24" />
        <CardSkeleton rows={5} titleWidth="w-20" />
      </div>
    </div>
  );
}
