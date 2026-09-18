"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  ListChecks,
  ClipboardList,
  KeyRound,
  FolderUp,
  BadgeCheck,
  FileSignature,
  PhoneCall,
  CreditCard,
  Users,
  Settings,
  Sparkles,
  LogOut,
  Menu,
  X,
  Bell,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { business } from "@/config/site";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { ActionResult } from "@/components/portal/PortalForm";
import { LinkPending } from "@/components/portal/LinkPending";

/**
 * Which sections this client has. Booked appointments only make sense on growth
 * plans; a lead (signed up, not paid) sees the short menu plus Plans.
 */
export type PortalNavFeatures = { bookedCalls?: boolean; lead?: boolean; /** Created by a Stripe sandbox purchase. */ testAccount?: boolean };

export type PortalNavCounts = {
  onboarding?: number;
  approvals?: number;
  agreements?: number;
  notifications?: number;
};

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; countKey?: keyof PortalNavCounts };

const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/onboarding", label: "Onboarding", icon: ListChecks, countKey: "onboarding" },
  { href: "/intake", label: "Your business", icon: ClipboardList },
  { href: "/plans", label: "Plans", icon: Sparkles },
  { href: "/access", label: "Access", icon: KeyRound },
  { href: "/assets", label: "Files", icon: FolderUp },
  { href: "/approvals", label: "Approvals", icon: BadgeCheck, countKey: "approvals" },
  { href: "/agreements", label: "Agreements", icon: FileSignature, countKey: "agreements" },
  { href: "/calls", label: "Booked appointments", icon: PhoneCall },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/team", label: "Team", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

const LEAD_NAV = ["/", "/intake", "/plans", "/assets", "/team", "/settings"];

export function PortalShell({
  clientName,
  clients,
  activeClientId,
  memberName,
  email,
  counts,
  features = {},
  signOutAction,
  switchClientAction,
  children,
}: {
  clientName: string;
  clients: { id: string; name: string }[];
  activeClientId: string;
  memberName: string | null;
  email: string;
  counts: PortalNavCounts;
  features?: PortalNavFeatures;
  signOutAction: () => Promise<ActionResult>;
  switchClientAction: (formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // These change page, so they hard-navigate (see PortalForm for why).
  async function signOut() {
    const r = await signOutAction();
    window.location.assign(r?.redirect ?? "/login");
  }
  async function switchClient(formData: FormData) {
    const r = await switchClientAction(formData);
    window.location.assign(r?.redirect ?? "/");
  }

  // Close the drawer on navigation and lock scroll while it is open.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (href: string) => {
    const p = pathname?.replace(/^\/portal/, "") || "/";
    return href === "/" ? p === "/" : p.startsWith(href);
  };

  const items = NAV.filter((item) => {
    if (features.lead) return LEAD_NAV.includes(item.href);
    if (item.href === "/plans") return false;
    return item.href !== "/calls" || features.bookedCalls !== false;
  });

  const nav = (
    <nav className="flex flex-col gap-1 px-3 py-2">
      {items.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;
        const count = item.countKey ? counts[item.countKey] : undefined;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
              active ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-3 hover:bg-surface/60 hover:text-ink",
            )}
          >
            <LinkPending
              className="h-[18px] w-[18px] shrink-0 text-gold"
              idle={<Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-gold" : "text-ink-4")} />}
            />
            <span className="flex-1">{item.label}</span>
            {count ? (
              <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold-deep">{count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );

  const account = (
    <div className="border-t border-line p-3">
      {clients.length > 1 && (
        <form action={switchClient} className="mb-2 px-1">
          <label className="text-[10px] uppercase tracking-wide text-ink-4">Account</label>
          <div className="relative mt-1">
            <select
              name="client_id"
              defaultValue={activeClientId}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="w-full appearance-none rounded-xl border border-line-strong bg-surface px-3 py-2 pr-8 text-sm text-ink outline-none focus:border-gold"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" />
          </div>
        </form>
      )}
      <div className="flex items-center gap-3 rounded-xl px-2 py-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/15 font-display text-sm font-bold text-gold-deep">
          {(memberName || email).slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{memberName || email}</p>
          <p className="truncate text-xs text-ink-4">{clientName}</p>
        </div>
      </div>
      <form action={signOut}>
        <button
          type="submit"
          className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-3 transition-colors hover:bg-surface/60 hover:text-ink"
        >
          <LogOut className="h-[18px] w-[18px] text-ink-4" />
          Sign out
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <Image src="/images/logo/TMD2_logo.svg" alt="" width={28} height={28} className="h-7 w-7" />
          <span className="truncate font-display text-base font-bold text-ink">{clientName}</span>
        </Link>
        <div className="flex items-center gap-1">
          <Link href="/settings#notifications" aria-label="Notifications" className="relative rounded-lg p-2 text-ink-2">
            <Bell className="h-5 w-5" />
            {counts.notifications ? (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-gold" />
            ) : null}
          </Link>
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="rounded-lg border border-line-strong p-2 text-ink-2"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {open && (
        <button
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-72 flex-col border-r border-line bg-bg-2 transition-transform duration-200 lg:w-64 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/images/logo/TMD2_logo.svg" alt="" width={32} height={32} className="h-8 w-8" />
            <div className="leading-tight">
              <span className="block font-display text-base font-bold text-ink">{business.name}</span>
              <span className="block text-[10px] font-medium uppercase tracking-wide text-gold-deep">
                Client portal{features.testAccount ? " · test account" : ""}
              </span>
            </div>
          </Link>
          <button onClick={() => setOpen(false)} aria-label="Close menu" className="p-2 text-ink-3 lg:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <div className="px-5 pb-2 lg:hidden">
          <ThemeToggle />
        </div>
        {account}
      </aside>

      <div className="lg:pl-64">
        <div className="hidden items-center justify-end gap-2 px-8 pt-4 lg:flex">
          <Link href="/settings#notifications" aria-label="Notifications" className="relative rounded-lg p-2 text-ink-2 hover:text-ink">
            <Bell className="h-5 w-5" />
            {counts.notifications ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-gold" /> : null}
          </Link>
          <ThemeToggle />
        </div>
        <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
