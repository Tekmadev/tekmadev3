import { cn } from "@/lib/cn";
import { canadian } from "@/config/site";

/**
 * The maple leaf from the Flag of Canada. Taken from the official flag
 * geometry rather than redrawn by hand, so it is the real eleven-point leaf
 * with the correct proportions at any size. The viewBox is the leaf's own
 * bounding box padded out to a square, so it centres inside a square slot.
 */
export function MapleLeaf({ className }: { className?: string }) {
  return (
    <svg
      viewBox="2785 400 4030 4030"
      fill="currentColor"
      aria-hidden
      focusable="false"
      className={className}
    >
      <path d="m4890 4430-45-863a95 95 0 0 1 111-98l859 151-116-320a65 65 0 0 1 20-73l941-762-212-99a65 65 0 0 1-34-79l186-572-542 115a65 65 0 0 1-73-38l-105-247-423 454a65 65 0 0 1-111-57l204-1052-327 189a65 65 0 0 1-91-27l-332-652-332 652a65 65 0 0 1-91 27l-327-189 204 1052a65 65 0 0 1-111 57l-423-454-105 247a65 65 0 0 1-73 38l-542-115 186 572a65 65 0 0 1-34 79l-212 99 941 762a65 65 0 0 1 20 73l-116 320 859-151a95 95 0 0 1 111 98l-45 863z" />
    </svg>
  );
}

type Variant = "pill" | "inline" | "block";

/**
 * "Proudly Canadian". One component so the wording, the leaf, and the red are
 * identical everywhere it appears.
 *
 * - `pill`   bordered chip, for hero and marketing rows
 * - `inline` leaf plus text with no chrome, for the footer bar
 * - `block`  leaf, headline, and a supporting line, for a trust panel. It names
 *            no city on purpose: the team works from more than one.
 */
export function CanadianBadge({
  variant = "pill",
  label,
  className,
}: {
  variant?: Variant;
  /** Override the wording. Defaults to the short form. */
  label?: string;
  className?: string;
}) {
  const text = label ?? canadian.short;

  if (variant === "inline") {
    return (
      <span className={cn("inline-flex items-center gap-1.5", className)} title={canadian.label}>
        <MapleLeaf className="h-3 w-3 shrink-0 text-canada" />
        {text}
      </span>
    );
  }

  if (variant === "block") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-3 rounded-2xl border border-line-strong bg-surface px-4 py-3",
          className,
        )}
      >
        <MapleLeaf className="h-6 w-6 shrink-0 text-canada" />
        <div>
          <p className="text-sm font-semibold text-ink">{canadian.label}</p>
          <p className="mt-0.5 text-xs text-ink-3">{canadian.tagline}</p>
        </div>
      </div>
    );
  }

  return (
    <span
      title={canadian.label}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface/70 px-3 py-1.5 text-xs font-medium text-ink-2",
        className,
      )}
    >
      <MapleLeaf className="h-3.5 w-3.5 shrink-0 text-canada" />
      {text}
    </span>
  );
}
