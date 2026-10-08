import { cn } from "@/lib/cn";

// Three text bars per row, in different widths, so the placeholder reads like real rows.
const WIDTHS: [string, string, string][] = [
  ["w-36", "w-48", "w-24"],
  ["w-44", "w-32", "w-28"],
  ["w-28", "w-40", "w-20"],
  ["w-40", "w-36", "w-24"],
  ["w-32", "w-44", "w-28"],
  ["w-48", "w-28", "w-20"],
  ["w-36", "w-40", "w-24"],
  ["w-28", "w-32", "w-28"],
];

/** Rows shaped like LeadRow while the list loads: a circle, three bars, a badge pill and the round Call button. */
export function LeadListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status">
      <span className="sr-only">Loading leads</span>
      <ul aria-hidden="true" className="divide-y divide-line rounded-2xl border border-line-strong bg-surface px-3 motion-safe:animate-pulse sm:px-5">
        {Array.from({ length: rows }, (_, i) => {
          const [a, b, c] = WIDTHS[i % WIDTHS.length];
          return (
            <li key={i} className="flex items-center gap-3 py-3">
              <span className="h-10 w-10 shrink-0 rounded-full bg-bg-3" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className={cn("h-3.5 max-w-full rounded bg-bg-3", a)} />
                <span className={cn("h-3 max-w-full rounded bg-bg-3", b)} />
                <span className={cn("h-2.5 max-w-full rounded bg-bg-3", c)} />
              </div>
              <span className="h-5 w-14 shrink-0 rounded-full bg-bg-3" />
              <span className="h-11 w-11 shrink-0 rounded-full border border-line-strong" />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
