import { LeadListSkeleton } from "@/components/admin/leads/LeadListSkeleton";

/** The Leads list while it loads: the header, the search and chips, then rows shaped like the real ones. */
export default function LeadsLoading() {
  return (
    <div className="flex flex-col gap-5 lg:max-w-5xl">
      <div aria-hidden="true" className="flex flex-col gap-4 motion-safe:animate-pulse sm:flex-row sm:items-end sm:justify-between">
        <span className="h-8 w-28 rounded-lg bg-bg-3 sm:h-9" />
        <span className="flex gap-3">
          <span className="h-11 w-32 rounded-full bg-bg-3" />
          <span className="h-11 w-28 rounded-full bg-bg-3" />
        </span>
      </div>
      <div aria-hidden="true" className="flex flex-col gap-3 motion-safe:animate-pulse">
        <span className="h-12 w-full rounded-xl border border-line-strong bg-surface" />
        <span className="flex gap-2 overflow-hidden">
          {["w-36", "w-20", "w-20", "w-16"].map((w, i) => (
            <span key={i} className={`h-11 shrink-0 rounded-full bg-bg-3 ${w}`} />
          ))}
        </span>
      </div>
      <LeadListSkeleton />
    </div>
  );
}
