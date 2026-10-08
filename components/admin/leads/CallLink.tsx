"use client";

import { firstName, savePendingLog, telHref, type Lead } from "@/lib/leads-ui";

/**
 * A plain tel: link (no target, no preventDefault: iOS opens the call sheet)
 * that leaves a "Log this call" reminder behind, so it waits when the person
 * comes back, even if iOS relaunched the home-screen app at Leads. Nothing
 * renders without a usable phone number.
 */
export function CallLink({
  lead,
  className,
  children,
  label,
}: {
  lead: Pick<Lead, "id" | "name" | "email" | "business" | "phone">;
  className?: string;
  children: React.ReactNode;
  label: string;
}) {
  const href = telHref(lead.phone);
  if (!href) return null;
  return (
    <a
      href={href}
      className={className}
      aria-label={label}
      onClick={() => savePendingLog({ leadId: lead.id, name: firstName(lead), kind: "call", at: Date.now() })}
    >
      {children}
    </a>
  );
}
