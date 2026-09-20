import { Bell, Building2, CreditCard, Mail, Receipt, Shield, UserRound, Wrench } from "lucide-react";
import type { AdminCategory, AdminSeverity } from "@/lib/admin-notify";

/**
 * How a notification looks, shared by the bell (a client component) and the
 * notifications page (a server component). It lives in its own plain module on
 * purpose: a server component that imports a value from a "use client" file
 * gets a reference, not the object, so these lookups silently returned
 * undefined when they lived next to the bell.
 */

export const CATEGORY_ICON: Record<AdminCategory, typeof Bell> = {
  leads: UserRound,
  sales: Receipt,
  billing: CreditCard,
  clients: Building2,
  audience: Mail,
  team: Shield,
  system: Wrench,
};

export const SEVERITY_TONE: Record<AdminSeverity, string> = {
  info: "bg-ink/[0.06] text-ink-3",
  success: "bg-gold/15 text-gold-deep",
  warning: "bg-signal/10 text-signal",
  critical: "bg-signal text-bg",
};

/** "now", "5m", "3h", "2d", then a short date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86_400) return `${Math.round(s / 3600)}h`;
  if (s < 7 * 86_400) return `${Math.round(s / 86_400)}d`;
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "America/Toronto" });
}
