"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { ArrowRight, Check } from "lucide-react";
import { newsletterCopy } from "@/config/site";
import { getAttribution } from "@/lib/attribution";

type Status = "idle" | "loading" | "success" | "error";

/** Read stored first-touch UTMs so a signup is attributed to its real source. */
function utmFields(): Record<string, string> {
  const attr = getAttribution();
  if (!attr) return {};
  const out: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const) {
    if (attr[k]) out[k] = attr[k] as string;
  }
  return out;
}

export function NewsletterSignup() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  // Distinguishes a bad-email problem (mark the field invalid) from a transient
  // network/server error (do not blame the field).
  const [fieldError, setFieldError] = useState(false);
  const successRef = useRef<HTMLDivElement>(null);

  // Move focus to the confirmation when the form is replaced, so keyboard and
  // screen-reader users are not dropped back to <body> with no signal.
  useEffect(() => {
    if (status === "success") successRef.current?.focus();
  }, [status]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "loading") return;

    const form = e.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") || "").trim();

    if (!email) {
      setStatus("error");
      setFieldError(true);
      setMessage("Please enter your email.");
      return;
    }

    setStatus("loading");
    setMessage("");
    setFieldError(false);

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          website: String(data.get("website") || ""), // honeypot
          source: "footer",
          path: typeof window !== "undefined" ? window.location.pathname : null,
          referrer: typeof document !== "undefined" ? document.referrer || null : null,
          ...utmFields(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; status?: string; error?: string };

      if (res.ok && json.ok) {
        setStatus("success");
        setMessage(
          json.status === "already_subscribed"
            ? "You're already on the list. Good to have you."
            : "You're in. Watch your inbox.",
        );
      } else if (json.error === "invalid_email") {
        setStatus("error");
        setFieldError(true);
        setMessage("That email doesn't look right.");
      } else if (res.status === 429) {
        setStatus("error");
        setFieldError(false);
        setMessage("Too many attempts. Please try again in a few minutes.");
      } else {
        setStatus("error");
        setFieldError(false);
        setMessage("Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setFieldError(false);
      setMessage("Network hiccup. Please try again.");
    }
  }

  return (
    <section
      aria-labelledby="newsletter-heading"
      className="grid gap-8 md:grid-cols-2 md:items-center md:gap-12"
    >
      {/* Persistent live region: exists before its text changes, so the
          confirmation and errors are reliably announced. */}
      <p role="status" aria-live="polite" className="sr-only">
        {status === "success" || status === "error" ? message : ""}
      </p>

      <div>
        <p className="eyebrow">{newsletterCopy.eyebrow}</p>
        <h2
          id="newsletter-heading"
          className="mt-3 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl"
        >
          {newsletterCopy.title}
        </h2>
        <p className="mt-3 max-w-md text-base leading-relaxed text-ink-3">{newsletterCopy.blurb}</p>
      </div>

      <div>
        {status === "success" ? (
          <div
            ref={successRef}
            tabIndex={-1}
            className="flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold/[0.07] px-5 py-4 outline-none"
          >
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold text-bg">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
            <p className="text-sm leading-relaxed text-ink-2">{message}</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
            {/* Honeypot: hidden from users, catches bots that fill every field. */}
            <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
              <label>
                Company website
                <input type="text" name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            <label htmlFor="newsletter-email" className="text-sm font-medium text-ink-2">
              Email address
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="newsletter-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder={newsletterCopy.placeholder}
                aria-describedby={status === "error" ? "newsletter-error" : "newsletter-hint"}
                aria-invalid={fieldError}
                className="min-h-[48px] flex-1 rounded-xl border border-line-strong bg-bg-2 px-4 text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-gold focus:ring-2 focus:ring-gold/20"
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="group inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-ink px-6 text-sm font-semibold text-bg transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === "loading" ? (
                  "Subscribing..."
                ) : (
                  <>
                    {newsletterCopy.cta}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </div>

            {status === "error" ? (
              <p id="newsletter-error" className="text-sm text-signal">
                {message}
              </p>
            ) : (
              <p id="newsletter-hint" className="text-xs leading-relaxed text-ink-4">
                {newsletterCopy.disclaimer}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
