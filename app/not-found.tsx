"use client";

import { motion } from "motion/react";
import { ArrowLeft, Phone } from "lucide-react";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Section } from "@/components/Section";
import { business } from "@/config/site";

export default function NotFound() {
  return (
    <main className="relative min-h-screen bg-bg text-ink">
      <Nav />

      <div className="relative isolate flex min-h-[100svh] items-center overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 h-[700px] w-[1100px] -translate-x-1/2"
          animate={{ scale: [1, 1.04, 1], opacity: [0.4, 0.55, 0.4] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        >
          <div
            className="absolute inset-0 blur-3xl"
            style={{
              background:
                "radial-gradient(closest-side at 50% 35%, rgba(220, 195, 153, 0.55), rgba(220, 195, 153, 0) 70%)",
            }}
          />
        </motion.div>
        <div className="pointer-events-none absolute inset-0 grain" />

        <Section className="relative">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
            className="inline-flex items-center gap-3"
          >
            <span className="h-px w-8 bg-ink-4" />
            <span className="eyebrow">Page not found</span>
          </motion.div>

          <h1 className="display-xxl mt-7 text-[28vw] leading-[0.88] sm:text-[14rem] lg:text-[18rem]">
            <motion.span
              initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 0.61, 0.36, 1] }}
              className="block number-tabular gold-gradient-text"
            >
              404
            </motion.span>
          </h1>

          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="display-xl mt-8 max-w-2xl text-balance text-4xl text-ink sm:text-5xl lg:text-6xl"
          >
            That page is off the calendar.
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.45 }}
            className="mt-6 max-w-xl text-balance text-base leading-relaxed text-ink-2 sm:text-lg"
          >
            The link you followed may be broken, or the page may have moved. The good news: the
            booking page still works.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.6 }}
            className="mt-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center"
          >
            <a
              href="/"
              className="group inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-bg transition-all duration-300 hover:bg-ink-2"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              Back to home
            </a>
            <a
              href={`tel:${business.phone.tel}`}
              className="group inline-flex items-center gap-2 rounded-full border border-line-strong bg-bg-2/40 px-5 py-3.5 text-sm text-ink-2 transition-all duration-300 hover:border-ink hover:text-ink"
            >
              <Phone className="h-3.5 w-3.5 text-gold" />
              {business.phone.display}
            </a>
          </motion.div>
        </Section>
      </div>

      <Footer />
    </main>
  );
}
