"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from "motion/react";
import { Menu, X, Phone } from "lucide-react";
import { cn } from "@/lib/cn";
import { business, navLinks } from "@/config/site";
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
            className="fixed inset-0 z-[60] bg-bg md:hidden"
          >
            <div className="flex h-full flex-col px-6 pt-6">
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

              <nav className="mt-14 flex flex-col gap-3">
                {navLinks.map((l, i) => (
                  <motion.a
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    initial={{ x: 24, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.08 + i * 0.05 }}
                    className="display-l text-5xl text-ink hover:text-gold"
                  >
                    {l.label}
                  </motion.a>
                ))}
              </nav>

              <div className="mt-auto mb-12 flex flex-col gap-3">
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
