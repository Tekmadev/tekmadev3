"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { LAST_LIST_KEY } from "@/lib/leads-ui";

/** The list itself, with or without a query: never a lead (/admin/leads/<id>) or Add lead (/admin/leads/new). */
const LIST_PATH = /^\/admin\/leads(?:[?#]|$)/;

/**
 * "Leads" back to the list the person came from, with its search and
 * filters (the list keeps its last address in session storage). The
 * home-screen app has no browser back button, so this is the way back. It
 * never goes back in history: the page may have been opened from a
 * notification or a shared link.
 */
export function BackToLeads() {
  const [href, setHref] = useState("/admin/leads");

  useEffect(() => {
    try {
      const last = window.sessionStorage.getItem(LAST_LIST_KEY);
      if (last && LIST_PATH.test(last)) setHref(last);
    } catch {
      // Storage blocked: the plain list is fine.
    }
  }, []);

  return (
    <Link href={href} className="-ml-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm text-ink-3 transition-colors hover:text-ink">
      <ChevronLeft className="h-4 w-4" aria-hidden />
      Leads
    </Link>
  );
}
