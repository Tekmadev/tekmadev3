"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { business } from "@/config/site";
import { GROW_WELCOME_PATH, growNeeds, revenueBands, type GrowPath } from "@/config/grow";
import { UTM_KEYS, getFirstTouch, getLastTouch } from "@/lib/attribution";
import { captureEvent } from "@/lib/analytics";
import { getMetaContextId, newEventId, trackMeta } from "@/lib/meta-pixel";
import { cn } from "@/lib/cn";
import { GROW_SESSION_KEY, type GrowSession } from "@/components/grow/session";

type FieldError = "need" | "revenue_band" | "name" | "email" | "phone";
type Status = "idle" | "sending" | "error";

const INPUT =
  "w-full rounded-xl border border-line-strong bg-bg px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-ink-5 focus:border-gold aria-[invalid=true]:border-signal";
const CHIP =
  "flex cursor-pointer items-center gap-3 rounded-xl border border-line-strong bg-bg px-4 py-3 text-sm text-ink-2 transition-colors hover:border-gold/60 has-[:checked]:border-gold has-[:checked]:bg-gold/10 has-[:checked]:text-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold";

const MESSAGES: Record<FieldError, string> = {
  need: "Pick the one that fits best.",
  revenue_band: "Pick a rough range. It only helps us prepare.",
  name: "Tell us your name.",
  email: "Check your email address.",
  phone: "Enter a phone number with the area code.",
};

const SERVER_FIELD: Record<string, FieldError> = {
  invalid_need: "need",
  invalid_band: "revenue_band",
  missing_name: "name",
  invalid_email: "email",
  invalid_phone: "phone",
};

/**
 * The /grow form. Two questions that decide which offer the welcome page
 * leads with, then who to call. Posts to /api/grow and moves on client-side,
 * so the Meta Lead event (same id as the server's, counted once) is not cut
 * off by a page load.
 */
export function GrowForm() {
  const router = useRouter();
  const id = useId();
  const [status, setStatus] = useState<Status>("idle");
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    router.prefetch(GROW_WELCOME_PATH);
  }, [router]);

  function fail(field: FieldError) {
    setStatus("error");
    setFieldError(field);
    setFormError(null);
    const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${field}"]`);
    el?.focus();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    const fd = new FormData(e.currentTarget);
    const value = (k: string) => String(fd.get(k) ?? "").trim();

    if (!value("need")) return fail("need");
    if (!value("revenue_band")) return fail("revenue_band");
    if (!value("name")) return fail("name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value("email"))) return fail("email");
    const digits = value("phone").replace(/\D/g, "").length;
    if (digits < 10 || digits > 15) return fail("phone");

    setStatus("sending");
    setFieldError(null);
    setFormError(null);

    // The ad that brought them now gets the credit; the first visit rides along.
    const touch = getLastTouch();
    const utm = Object.fromEntries(UTM_KEYS.map((k) => [k, touch?.[k] ?? null]));
    const metaContext = getMetaContextId();
    const metaEventId = metaContext ? newEventId("lead") : null;

    try {
      const res = await fetch("/api/grow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          need: value("need"),
          revenue_band: value("revenue_band"),
          name: value("name"),
          email: value("email"),
          phone: value("phone"),
          business_name: value("business_name") || null,
          site_url: value("site_url") || null,
          message: value("message") || null,
          consent_marketing: fd.get("consent_marketing") === "on",
          website: value("website"),
          ...utm,
          click_id: touch?.clickId ?? null,
          referrer: touch?.referrer ?? externalReferrer(),
          path: window.location.pathname,
          first_touch: getFirstTouch(),
          mctx: metaContext,
          meta_event_id: metaEventId,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        path?: GrowPath;
        lead?: string;
        duplicate?: boolean;
      };

      if (res.ok && json.ok) {
        const path: GrowPath = json.path ?? "growth";
        try {
          const session: GrowSession = {
            name: value("name"),
            email: value("email"),
            lead: json.lead ?? null,
            path,
          };
          sessionStorage.setItem(GROW_SESSION_KEY, JSON.stringify(session));
        } catch {
          /* private mode: the welcome page works without it */
        }
        // A repeat of a submission the server already had is not a second lead.
        if (metaEventId && !json.duplicate) {
          trackMeta("Lead", { content_name: "grow", content_category: "lead_form" }, metaEventId);
        }
        captureEvent("lead", {
          form: "grow",
          need: value("need"),
          revenue_band: value("revenue_band"),
          ...(touch?.utm_source ? { utm_source: touch.utm_source } : {}),
          ...(touch?.utm_medium ? { utm_medium: touch.utm_medium } : {}),
          ...(touch?.utm_campaign ? { utm_campaign: touch.utm_campaign } : {}),
        });
        router.push(`${GROW_WELCOME_PATH}?for=${path}`);
        return;
      }

      const field = json.error ? SERVER_FIELD[json.error] : undefined;
      if (field) return fail(field);
      setStatus("error");
      setFormError(
        res.status === 429
          ? `Too many tries from this connection. Give it a few minutes, or call us on ${business.phone.display}.`
          : `Something went wrong on our side. Try again, or call us on ${business.phone.display}.`,
      );
    } catch {
      setStatus("error");
      setFormError("Network hiccup. Check your connection and try again.");
    }
  }

  const err = (f: FieldError) => (fieldError === f ? MESSAGES[f] : null);
  const describedBy = (f: FieldError) => (fieldError === f ? `${id}-${f}-error` : undefined);

  return (
    // method="post": if someone submits before the script has loaded, the browser
    // posts the fields in the body instead of putting them in the page address.
    <form ref={formRef} onSubmit={onSubmit} method="post" noValidate className="flex flex-col gap-7">
      <fieldset aria-describedby={describedBy("need")}>
        <legend className="text-sm font-medium text-ink">What do you need most right now?</legend>
        <div className="mt-3 grid gap-2">
          {growNeeds.map((n, i) => (
            <label key={n.value} className={CHIP}>
              <input
                type="radio"
                name="need"
                value={n.value}
                className="h-4 w-4 accent-gold"
                data-field={i === 0 ? "need" : undefined}
                aria-invalid={fieldError === "need" || undefined}
                onChange={() => fieldError === "need" && setFieldError(null)}
              />
              {n.label}
            </label>
          ))}
        </div>
        <FieldMessage id={`${id}-need-error`} text={err("need")} />
      </fieldset>

      <fieldset aria-describedby={describedBy("revenue_band")}>
        <legend className="text-sm font-medium text-ink">Roughly what does the business bring in?</legend>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {revenueBands.map((b, i) => (
            <label key={b.value} className={CHIP}>
              <input
                type="radio"
                name="revenue_band"
                value={b.value}
                className="h-4 w-4 accent-gold"
                data-field={i === 0 ? "revenue_band" : undefined}
                aria-invalid={fieldError === "revenue_band" || undefined}
                onChange={() => fieldError === "revenue_band" && setFieldError(null)}
              />
              {b.label}
            </label>
          ))}
        </div>
        <FieldMessage id={`${id}-revenue_band-error`} text={err("revenue_band")} />
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor={`${id}-name`} error={err("name")} errorId={`${id}-name-error`}>
          <input
            id={`${id}-name`}
            name="name"
            autoComplete="name"
            maxLength={120}
            className={INPUT}
            data-field="name"
            aria-invalid={fieldError === "name" || undefined}
            aria-describedby={describedBy("name")}
          />
        </Field>
        <Field label="Business name" hint="Optional. A working name is fine." htmlFor={`${id}-business`}>
          <input id={`${id}-business`} name="business_name" autoComplete="organization" maxLength={200} className={INPUT} />
        </Field>
        <Field label="Email" htmlFor={`${id}-email`} error={err("email")} errorId={`${id}-email-error`}>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={254}
            className={INPUT}
            data-field="email"
            aria-invalid={fieldError === "email" || undefined}
            aria-describedby={describedBy("email")}
          />
        </Field>
        <Field label="Phone" htmlFor={`${id}-phone`} error={err("phone")} errorId={`${id}-phone-error`}>
          <input
            id={`${id}-phone`}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={40}
            className={INPUT}
            data-field="phone"
            aria-invalid={fieldError === "phone" || undefined}
            aria-describedby={describedBy("phone")}
          />
        </Field>
      </div>

      <Field label="Your website" hint="Optional. If you have one, we will look at it before the call." htmlFor={`${id}-site`}>
        <input
          id={`${id}-site`}
          name="site_url"
          type="text"
          inputMode="url"
          autoComplete="url"
          maxLength={300}
          placeholder="yourbusiness.com"
          className={INPUT}
        />
      </Field>

      <Field label="Anything we should know?" hint="Optional." htmlFor={`${id}-message`}>
        <textarea id={`${id}-message`} name="message" rows={3} maxLength={2000} className={cn(INPUT, "resize-y")} />
      </Field>

      {/* Honeypot. People never see it; bots fill it and get a polite nothing. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Leave this empty
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="flex items-start gap-3 text-sm leading-relaxed text-ink-3">
        <input type="checkbox" name="consent_marketing" className="mt-1 h-4 w-4 shrink-0 accent-gold" />
        <span>Send me the Growth Memo as well: one or two emails a month on the plays that fill calendars. Unsubscribe in one click.</span>
      </label>

      <div className="flex flex-col gap-3">
        <button
          type="submit"
          disabled={status === "sending"}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-4 text-[15px] font-medium text-bg transition-colors hover:bg-ink-2 disabled:cursor-wait disabled:opacity-70"
        >
          {status === "sending" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Sending
            </>
          ) : (
            <>
              Show me how you would grow it
              <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
        {formError && (
          <p role="alert" className="text-sm text-signal">
            {formError}
          </p>
        )}
        <p className="text-xs leading-relaxed text-ink-4">
          We use this to prepare for your call and contact you about it. No marketing emails unless you tick the box, and
          we never sell your details. If you accepted advertising cookies, we let Meta know a form was sent, as our privacy
          policy explains.{" "}
          <a href="/privacy" className="underline decoration-line-strong underline-offset-4 hover:text-gold">
            Privacy policy
          </a>
          .
        </p>
      </div>
    </form>
  );
}

/** The page that sent them here, unless it was one of ours (a reload, or the homepage). */
function externalReferrer(): string | null {
  const ref = document.referrer;
  return ref && !ref.startsWith(window.location.origin) ? ref : null;
}

function Field({
  label,
  hint,
  htmlFor,
  error,
  errorId,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  error?: string | null;
  errorId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !error && <span className="text-xs text-ink-4">{hint}</span>}
      <FieldMessage id={errorId} text={error ?? null} />
    </div>
  );
}

function FieldMessage({ id, text }: { id?: string; text: string | null }) {
  if (!text) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-xs text-signal">
      {text}
    </p>
  );
}
