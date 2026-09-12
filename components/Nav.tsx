"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from "motion/react";
import { Menu, X, Phone, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { business, navLinks, productNav, type NavProduct } from "@/config/site";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 24);
  });

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-300",
          scrolled ? "py-2" : "py-4",
        )}
      >
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <div
            className={cn(
              "flex items-center justify-between rounded-full border px-4 py-2.5 transition-all duration-300",
              scrolled
                ? "border-line-strong bg-bg/85 backdrop-blur-xl shadow-[0_8px_32px_-12px_rgba(13,12,10,0.12)]"
                : "border-transparent bg-transparent",
            )}
          >
            <Brand />

            <nav className="hidden items-center gap-1 md:flex">
              <ProductMenu />
              {navLinks.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="rounded-full px-3.5 py-2 text-sm text-ink-3 transition-colors duration-200 hover:bg-ink/[0.04] hover:text-ink"
                >
                  {l.label}
                </a>
              ))}
            </nav>

            <div className="hidden items-center gap-2 md:flex">
              <ThemeToggle />
              <a
                href={`tel:${business.phone.tel}`}
                aria-label={`Call ${business.phone.display}`}
                className="group inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm text-ink-3 transition-colors hover:text-ink"
              >
                <Phone className="h-3.5 w-3.5 text-gold" />
                <span className="hidden lg:inline">{business.phone.display}</span>
              </a>
              <a
                href="/#book"
                className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-bg transition-all duration-300 hover:bg-ink-2"
              >
                Book a call
              </a>
            </div>

            <div className="flex items-center gap-2 md:hidden">
              <ThemeToggle />
              <button
                onClick={() => setOpen(true)}
                aria-label="Open menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line-strong"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] overflow-y-auto bg-bg md:hidden"
          >
            <div className="flex min-h-full flex-col px-6 pt-6">
              <div className="flex items-center justify-between">
                <Brand size="lg" />
                <div className="flex items-center gap-2">
                  <ThemeToggle />
                  <button
                    onClick={() => setOpen(false)}
                    aria-label="Close menu"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line-strong"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <MobileProducts onNavigate={() => setOpen(false)} />

              <nav className="mt-8 flex flex-col gap-3">
                {navLinks.map((l, i) => (
                  <motion.a
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    initial={{ x: 24, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.16 + i * 0.05 }}
                    className="display-l text-4xl text-ink hover:text-gold"
                  >
                    {l.label}
                  </motion.a>
                ))}
              </nav>

              <div className="mt-auto mb-12 flex flex-col gap-3 pt-10">
                <a
                  href={`tel:${business.phone.tel}`}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-line-strong px-6 py-4 text-base text-ink"
                >
                  <Phone className="h-4 w-4 text-gold" />
                  {business.phone.display}
                </a>
                <a
                  href="/#book"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-4 text-base font-medium text-bg"
                >
                  Book your call
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Small pill next to a product name: Flagship, New, Coming soon. */
function Badge({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        muted ? "bg-ink/[0.06] text-ink-4" : "bg-gold/15 text-gold-deep",
      )}
    >
      {children}
    </span>
  );
}

function ProductRow({ item, onNavigate }: { item: NavProduct; onNavigate?: () => void }) {
  const soon = !item.href;

  const inner = (
    <>
      <div className="flex items-center gap-2">
        <span className={cn("text-sm font-semibold", soon ? "text-ink-4" : "text-ink")}>{item.name}</span>
        {item.badge && <Badge muted={soon}>{item.badge}</Badge>}
      </div>
      {item.blurb && <p className="mt-1 text-sm leading-snug text-ink-3">{item.blurb}</p>}
    </>
  );

  if (soon) {
    return (
      <div aria-disabled="true" className="rounded-xl px-3 py-2.5">
        {inner}
      </div>
    );
  }

  return (
    <a
      href={item.href}
      onClick={onNavigate}
      className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-ink/[0.04]"
    >
      {inner}
    </a>
  );
}

/** Desktop dropdown. Opens on hover and on click, closes on Escape or outside click. */
function ProductMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  // Hover and click both drive one piece of state. Without this, moving the
  // mouse onto the button opens the panel and the click that follows closes
  // it again. The first click after a hover-open pins it instead.
  const hoverOpened = useRef(false);

  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  // Clear any pending close when the component goes away mid-hover.
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  function hoverOpen() {
    window.clearTimeout(closeTimer.current);
    if (!open) hoverOpened.current = true;
    setOpen(true);
  }
  // Small delay so crossing the gap from button to panel does not close it.
  function hoverClose() {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      hoverOpened.current = false;
      setOpen(false);
    }, 120);
  }

  function toggle() {
    if (open && hoverOpened.current) {
      hoverOpened.current = false; // pin it open; the next click closes
      return;
    }
    hoverOpened.current = false;
    setOpen((v) => !v);
  }

  return (
    <div ref={wrapRef} className="relative" onMouseEnter={hoverOpen} onMouseLeave={hoverClose}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={toggle}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm transition-colors duration-200 hover:bg-ink/[0.04] hover:text-ink",
          open ? "text-ink" : "text-ink-3",
        )}
      >
        {productNav.label}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
            className="absolute left-0 top-full z-50 w-[22rem] pt-3"
          >
            <div className="overflow-hidden rounded-2xl border border-line-strong bg-bg/95 p-2 shadow-[0_24px_60px_-24px_rgba(13,12,10,0.35)] backdrop-blur-xl">
              <p className="px-3 pb-1 pt-2 text-xs leading-snug text-ink-4">{productNav.blurb}</p>
              <div className="mt-1 flex flex-col">
                {productNav.items.map((item) => (
                  <ProductRow key={item.name} item={item} onNavigate={() => setOpen(false)} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Mobile menu: the products get their own labelled group above the page links. */
function MobileProducts({ onNavigate }: { onNavigate: () => void }) {
  return (
    <motion.div
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: 0.08 }}
      className="mt-12"
    >
      <p className="eyebrow">{productNav.label}</p>
      <div className="mt-4 flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line-strong bg-surface">
        {productNav.items.map((item) => {
          const soon = !item.href;
          const body = (
            <>
              <div className="flex items-center gap-2">
                <span className={cn("text-lg font-semibold", soon ? "text-ink-4" : "text-ink")}>{item.name}</span>
                {item.badge && <Badge muted={soon}>{item.badge}</Badge>}
              </div>
              {item.blurb && <p className="mt-1 text-sm leading-snug text-ink-3">{item.blurb}</p>}
            </>
          );
          return soon ? (
            <div key={item.name} aria-disabled="true" className="px-4 py-3.5">
              {body}
            </div>
          ) : (
            <a key={item.name} href={item.href} onClick={onNavigate} className="px-4 py-3.5">
              {body}
            </a>
          );
        })}
      </div>
    </motion.div>
  );
}

function Brand({ size = "md" }: { size?: "md" | "lg" }) {
  const dim = size === "lg" ? 44 : 36;
  return (
    <a href="/#top" className="group flex items-center gap-2.5" aria-label={business.name}>
      <Image
        src="/images/logo/TMD2_logo.svg"
        alt={`${business.name} mark`}
        width={dim}
        height={dim}
        className={size === "lg" ? "h-11 w-11" : "h-9 w-9"}
        priority
      />
      <span
        className={cn(
          "font-display font-bold tracking-tight text-ink",
          size === "lg" ? "text-2xl" : "text-xl",
        )}
      >
        {business.name}
      </span>
    </a>
  );
}
