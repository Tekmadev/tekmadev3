"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { CalendarClock, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  COPY,
  DEFAULT_LEAD_LIST_PARAMS,
  LAST_LIST_KEY,
  LEAD_NEED_OPTIONS,
  LEAD_SOURCE_OPTIONS,
  LEAD_STATUS_OPTIONS,
  fieldCls,
  isNarrowed,
  isOffline,
  leadListHref,
  type LeadListParams,
} from "@/lib/leads-ui";

const SEARCH_DELAY_MS = 350;

const chipCls =
  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold";
const chipOff = "border-line-strong bg-surface text-ink-2 hover:border-gold hover:text-gold";
const chipOn = "border-gold bg-gold/10 font-medium text-gold-deep";

// A scroller row on phones (chips scroll inside it, the page never scrolls sideways), wrapping on desktop.
const rowCls = "flex gap-2 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-wrap lg:overflow-visible";

type FilterKey = "source" | "status" | "need" | "sort";

/**
 * The Leads list's search, quick views and filters. Everything lives in the URL
 * (router.replace, no new history entry per keystroke); the server filters
 * through the shared list. Offline it never navigates (a failed navigation can
 * fall back to a full page load and the home-screen app's offline page): it
 * says the connection is down instead.
 */
export function LeadListControls({ params }: { params: LeadListParams }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [offline, setOffline] = useState(false);
  const [hasText, setHasText] = useState(params.q !== "");
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The params a delayed search builds on (the newest, not the ones from when
  // typing started), and the search last sent (the URL may not show it yet).
  const latest = useRef(params);
  const requested = useRef(params.q);
  useEffect(() => {
    latest.current = params;
    requested.current = params.q;
  }, [params]);

  const stopTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  /** What the search box holds now (a chip or a filter applies to it, even before its delay ran out). */
  const typed = (): string => {
    const value = inputRef.current?.value;
    return typeof value === "string" ? value.trim().slice(0, 100) : latest.current.q;
  };

  /** Replace the URL; false (and the network message) when offline. */
  const go = (build: (p: LeadListParams) => string): boolean => {
    stopTimer();
    if (isOffline()) {
      setOffline(true);
      return false;
    }
    setOffline(false);
    const q = typed();
    const href = build({ ...latest.current, q });
    requested.current = q;
    startTransition(() => router.replace(href, { scroll: false }));
    return true;
  };

  // The detail page's Back link and the tab bar's Leads tab return to this list.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.pathname !== "/admin/leads") return;
      url.searchParams.delete("added");
      window.sessionStorage.setItem(LAST_LIST_KEY, url.pathname + url.search);
    } catch {
      // Private mode or blocked storage: Back falls back to the plain list.
    }
  }, [params]);

  // Back, Clear filters or a chip changed the search: show it, unless the person is typing.
  useEffect(() => {
    const input = inputRef.current;
    if (!input || document.activeElement === input) return;
    if (input.value.trim() !== params.q) input.value = params.q;
    setHasText(input.value !== "");
  }, [params.q]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** The search box's text, sent once (typing pauses, or Search on the keyboard). */
  const search = () => {
    if (typed() === requested.current) {
      stopTimer();
      return;
    }
    go((p) => leadListHref(p));
  };

  const onType = (value: string) => {
    setHasText(value !== "");
    stopTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      search();
    }, SEARCH_DELAY_MS);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    search();
    // Close the keyboard so the results show.
    inputRef.current?.blur();
  };

  const clearSearch = () => {
    const input = inputRef.current;
    if (input) {
      input.value = "";
      input.focus();
    }
    setHasText(false);
    search();
  };

  /** A chip: a real link (open in a new tab works), replaced in place on a plain tap. */
  const onChip = (build: (p: LeadListParams) => string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(build);
  };

  const onFilter = (key: FilterKey) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    const select = e.currentTarget;
    const value = select.value;
    const patch: Partial<LeadListParams> = key === "sort" ? { sort: value === "followup" ? "followup" : "newest" } : { [key]: value };
    if (!go((p) => leadListHref(p, patch))) {
      // Offline: put the picker back so it matches the list on screen.
      select.value = key === "sort" ? params.sort : params[key];
    }
  };

  const due = params.view === "due";
  const mine = params.view === "mine";
  const isNew = params.status === "new";
  const all = !isNarrowed(params);

  // Each chip builds its URL from the list's params; a tap uses the search box's current text.
  const chips: { label: string; to: (p: LeadListParams) => string; on: boolean; icon?: boolean }[] = [
    {
      label: "Follow-ups due",
      to: (p) => (due ? leadListHref(p, { view: "all", everyone: false }) : leadListHref(p, { view: "due" })),
      on: due,
      icon: true,
    },
    { label: "New", to: (p) => leadListHref(p, { status: isNew ? "" : "new" }), on: isNew },
    { label: "Mine", to: (p) => (mine ? leadListHref(p, { view: "all" }) : leadListHref(p, { view: "mine", everyone: false })), on: mine },
    { label: "All", to: (p) => leadListHref(DEFAULT_LEAD_LIST_PARAMS, { q: p.q }), on: all },
  ];

  const filters: { key: FilterKey; label: string; value: string; set: boolean; options: { value: string; label: string }[] }[] = [
    {
      key: "source",
      label: "Source",
      value: params.source,
      set: params.source !== "",
      options: [{ value: "", label: "All sources" }, ...LEAD_SOURCE_OPTIONS],
    },
    {
      key: "status",
      label: "Status",
      value: params.status,
      set: params.status !== "",
      options: [{ value: "", label: "All statuses" }, ...LEAD_STATUS_OPTIONS.map(({ value, label }) => ({ value, label }))],
    },
    {
      key: "need",
      label: "Need",
      value: params.need,
      set: params.need !== "",
      options: [{ value: "", label: "All needs" }, ...LEAD_NEED_OPTIONS],
    },
  ];
  if (!due) {
    filters.push({
      key: "sort",
      label: "Sort",
      value: params.sort,
      set: params.sort !== "newest",
      options: [
        { value: "newest", label: "Newest first" },
        { value: "followup", label: "Soonest follow-up" },
      ],
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <form role="search" action="/admin/leads" method="get" onSubmit={onSubmit} className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" />
        <input
          ref={inputRef}
          type="search"
          name="q"
          defaultValue={params.q}
          maxLength={100}
          placeholder="Search name, business or email"
          aria-label="Search leads by name, business, email or phone"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          onChange={(e) => onType(e.currentTarget.value)}
          className={cn(fieldCls, "pl-11 pr-12 [&::-webkit-search-cancel-button]:appearance-none")}
        />
        <span
          role="status"
          aria-live="polite"
          className={cn(
            "pointer-events-none absolute inset-y-0 flex items-center bg-surface pl-2 text-xs text-ink-4",
            hasText ? "right-12" : "right-4",
            !pending && "sr-only",
          )}
        >
          {pending ? "Updating" : ""}
        </span>
        {hasText && (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 transition-colors hover:text-ink"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </form>

      {offline && (
        <p role="alert" className="text-sm text-signal">
          {COPY.network}
        </p>
      )}

      <nav aria-label="Lead views" className={rowCls}>
        {chips.map((chip) => (
          <Link
            key={chip.label}
            href={chip.to(params)}
            replace
            scroll={false}
            onClick={onChip(chip.to)}
            aria-current={chip.on ? "true" : undefined}
            className={cn(chipCls, chip.on ? chipOn : chipOff)}
          >
            {chip.icon && <CalendarClock aria-hidden="true" className="h-4 w-4" />}
            {chip.label}
          </Link>
        ))}
      </nav>

      <div role="group" aria-label="Filters" className={rowCls}>
        {filters.map((f) => {
          const id = `lead-filter-${f.key}`;
          return (
            <div key={f.key} className="relative shrink-0">
              <label htmlFor={id} className="sr-only">
                {f.label}
              </label>
              <select
                // Remounts when the URL changes it, so Back and Clear filters show the right value.
                key={`${f.key}:${f.value}`}
                id={id}
                defaultValue={f.value}
                onChange={onFilter(f.key)}
                className={cn(
                  "min-h-11 max-w-[220px] cursor-pointer appearance-none truncate rounded-full border py-2 pl-4 pr-9 text-base outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold lg:text-sm",
                  f.set ? chipOn : chipOff,
                )}
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className={cn("pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2", f.set ? "text-gold-deep" : "text-ink-4")}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
