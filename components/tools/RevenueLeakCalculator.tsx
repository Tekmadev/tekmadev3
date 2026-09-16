"use client";

import { useMemo, useState, useRef, useEffect, type FormEvent } from "react";
import { ArrowRight, Check, Lock, TrendingDown } from "lucide-react";
import { revenueLeakCopy, REVENUE_LEAK_SLUG } from "@/config/lead-magnets";
import {
  calculateLeak,
  formatDollars,
  normalizeAnswers,
  LIMITS,
  type LeakAnswers,
  type LeakResult,
  type ReplyBand,
  type FollowUpBand,
} from "@/lib/revenue-leak";
import { getAttribution } from "@/lib/attribution";

type Status = "idle" | "loading" | "done" | "error";

const c = revenueLeakCopy;

/** Sensible starting point: a small service business with an average process. */
const DEFAULTS: LeakAnswers = {
  leadsPerMonth: 60,
  dealValue: 2500,
  closeRate: 20,
  replyBand: "under_2h",
  missedCallsPerWeek: 8,
  followUpBand: "one_two",
};

function utmFields(): Record<string, string> {
  const attr = getAttribution();
  if (!attr) return {};
  const out: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const) {
    if (attr[k]) out[k] = attr[k] as string;
  }
  return out;
}

export function RevenueLeakCalculator() {
  const [answers, setAnswers] = useState<LeakAnswers>(DEFAULTS);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [fieldError, setFieldError] = useState(false);
  const [serverResult, setServerResult] = useState<LeakResult | null>(null);
  const [emailed, setEmailed] = useState(false);
  const breakdownRef = useRef<HTMLDivElement>(null);

  // Typing is allowed to pass through zero and empty, so the preview runs on
  // the same normalization the API applies. The server recomputes on submit and
  // that result is what the breakdown renders, so the page can never show a
  // number the stored record disagrees with.
  const normalized = useMemo(
    () => normalizeAnswers(answers as unknown as Record<string, unknown>),
    [answers],
  );
  const preview = useMemo(() => calculateLeak(normalized), [normalized]);
  const result = serverResult ?? preview;
  const unlocked = status === "done";

  // A business that already replies fast with deep follow-up should be told
  // that, not shown a manufactured emergency.
  const tight = result.monthlyLeak < Math.max(500, result.currentRevenue * 0.02);

  useEffect(() => {
    if (status === "done") breakdownRef.current?.focus();
  }, [status]);

  // Clamped to the upper bound only, so a field can be cleared and retyped.
  // The lower bound is applied by normalizeAnswers, here and on the server.
  function setNumber(key: keyof typeof LIMITS, raw: string) {
    const digits = raw.replace(/[^0-9]/g, "");
    const n = digits === "" ? 0 : Number(digits);
    setAnswers((a) => ({ ...a, [key]: Math.min(Math.max(n, 0), LIMITS[key].max) }));
  }

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
      const res = await fetch("/api/lead-magnet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          magnet: REVENUE_LEAK_SLUG,
          email,
          name: String(data.get("name") || ""),
          company: String(data.get("company") || ""),
          consent_marketing: data.get("consent_marketing") === "on",
          website: String(data.get("website") || ""), // honeypot
          answers: normalized,
          path: typeof window !== "undefined" ? window.location.pathname : null,
          referrer: typeof document !== "undefined" ? document.referrer || null : null,
          ...utmFields(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        result?: LeakResult;
        emailed?: boolean;
      };

      if (res.ok && json.ok) {
        if (json.result) setServerResult(json.result);
        setEmailed(Boolean(json.emailed));
        setStatus("done");
      } else if (json.error === "invalid_email") {
        setStatus("error");
        setFieldError(true);
        setMessage("That email doesn't look right.");
      } else if (res.status === 429) {
        setStatus("error");
        setMessage("Too many attempts. Please try again in a few minutes.");
      } else {
        setStatus("error");
        setMessage("Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Network hiccup. Please try again.");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-14">
      {/* Inputs */}
      <div className="lg:col-span-7">
        <div className="rounded-3xl border border-line-strong bg-surface p-6 sm:p-8">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <NumberField
              id="leadsPerMonth"
              label={c.fields.leadsPerMonth.label}
              help={c.fields.leadsPerMonth.help}
              suffix={c.fields.leadsPerMonth.suffix}
              value={answers.leadsPerMonth}
              onChange={(v) => setNumber("leadsPerMonth", v)}
            />
            <NumberField
              id="dealValue"
              label={c.fields.dealValue.label}
              help={c.fields.dealValue.help}
              prefix={c.fields.dealValue.prefix}
              value={answers.dealValue}
              onChange={(v) => setNumber("dealValue", v)}
            />
            <NumberField
              id="closeRate"
              label={c.fields.closeRate.label}
              help={c.fields.closeRate.help}
              suffix={c.fields.closeRate.suffix}
              value={answers.closeRate}
              onChange={(v) => setNumber("closeRate", v)}
            />
            <NumberField
              id="missedCallsPerWeek"
              label={c.fields.missedCallsPerWeek.label}
              help={c.fields.missedCallsPerWeek.help}
              suffix={c.fields.missedCallsPerWeek.suffix}
              value={answers.missedCallsPerWeek}
              onChange={(v) => setNumber("missedCallsPerWeek", v)}
            />
            <SelectField
              id="replyBand"
              label={c.fields.replyBand.label}
              help={c.fields.replyBand.help}
              value={answers.replyBand}
              options={c.fields.replyBand.options}
              onChange={(v) => setAnswers((a) => ({ ...a, replyBand: v as ReplyBand }))}
              className="sm:col-span-2"
            />
            <SelectField
              id="followUpBand"
              label={c.fields.followUpBand.label}
              help={c.fields.followUpBand.help}
              value={answers.followUpBand}
              options={c.fields.followUpBand.options}
              onChange={(v) => setAnswers((a) => ({ ...a, followUpBand: v as FollowUpBand }))}
              className="sm:col-span-2"
            />
          </div>
        </div>

        {/* The breakdown, revealed in place the moment the form is submitted. */}
        {unlocked && (
          <div
            ref={breakdownRef}
            tabIndex={-1}
            className="mt-6 rounded-3xl border border-line-strong bg-surface p-6 outline-none sm:p-8"
          >
            <p className="eyebrow">{c.breakdown.heading}</p>

            {tight ? (
              <p className="mt-5 text-base leading-relaxed text-ink-2">{c.result.tightBody}</p>
            ) : (
              <dl className="mt-6 flex flex-col gap-5">
                <LineItem
                  label={c.breakdown.slowReply.label}
                  body={c.breakdown.slowReply.body}
                  amount={result.slowReplyLoss}
                />
                <LineItem
                  label={c.breakdown.missedCalls.label}
                  body={c.breakdown.missedCalls.body}
                  amount={result.missedCallLoss}
                />
                <LineItem
                  label={c.breakdown.followUp.label}
                  body={c.breakdown.followUp.body}
                  amount={result.followUpLoss}
                />
              </dl>
            )}

            <div className="mt-8 grid grid-cols-2 gap-4 border-t border-line pt-6">
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-4">{c.breakdown.rateNow}</p>
                <p className="display-m number-tabular mt-1 text-2xl text-ink-2">{normalized.closeRate}%</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-4">{c.breakdown.rateFixed}</p>
                <p className="display-m number-tabular mt-1 text-2xl text-ink">
                  {result.recoveredCloseRate}%
                </p>
              </div>
            </div>

            {!tight && (
              <p className="mt-6 text-base leading-relaxed text-ink-2">
                <span className="number-tabular font-semibold text-ink">
                  {result.extraDealsPerMonth}
                </span>{" "}
                {c.breakdown.extra}, and about{" "}
                <span className="number-tabular font-semibold text-ink">
                  {result.extraAppointmentsPerMonth}
                </span>{" "}
                {c.breakdown.appointments}.
              </p>
            )}

            <p className="mt-6 flex items-start gap-2 text-sm leading-relaxed text-ink-3">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold-deep" />
              {emailed
                ? "A copy is on its way to your inbox."
                : "Saved. If the emailed copy does not arrive, this page has everything."}
            </p>
          </div>
        )}
      </div>

      {/* Result + gate */}
      <div className="lg:col-span-5">
        <div className="lg:sticky lg:top-28">
          <div className="relative overflow-hidden rounded-3xl border border-line-strong bg-bg-2 p-7 sm:p-8">
            <p className="eyebrow">{c.result.eyebrow}</p>

            <p role="status" aria-live="polite" className="sr-only">
              {tight
                ? c.result.tightHeading
                : `You are leaking about ${formatDollars(result.monthlyLeak)} a month.`}
            </p>

            {tight ? (
              <>
                <p className="display-l mt-4 text-2xl leading-tight text-ink sm:text-3xl">
                  {c.result.tightHeading}
                </p>
                <p className="mt-4 text-sm leading-relaxed text-ink-3">{c.result.tightBody}</p>
              </>
            ) : (
              <>
                <p className="mt-4 text-sm text-ink-3">{c.result.heading}</p>
                <p className="display-xxl number-tabular mt-1 text-5xl text-ink sm:text-6xl">
                  {formatDollars(result.monthlyLeak)}
                </p>
                <p className="mt-1 text-sm text-ink-3">{c.result.perMonth}</p>

                <div className="mt-6 flex items-start gap-2.5 rounded-2xl border border-signal/30 bg-signal/[0.06] px-4 py-3">
                  <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
                  <p className="text-sm leading-relaxed text-ink-2">
                    {c.result.annualPrefix}{" "}
                    <span className="number-tabular font-semibold text-ink">
                      {formatDollars(result.annualLeak)}
                    </span>{" "}
                    {c.result.annualSuffix}
                  </p>
                </div>
              </>
            )}

            <div className="my-7 h-px w-full bg-line" />

            {unlocked ? (
              <div>
                <p className="text-sm font-semibold text-ink">{c.plan.heading}</p>
                <a
                  href={c.plan.ctaHref}
                  className="group mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-4 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
                >
                  {c.plan.cta}
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </a>
                <p className="mt-4 text-center text-xs leading-relaxed text-ink-4">{c.plan.ctaNote}</p>
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
                <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
                  <label>
                    Company website
                    <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                  </label>
                </div>

                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Lock className="h-3.5 w-3.5 text-gold-deep" />
                    {c.gate.heading}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-3">{c.gate.body}</p>
                </div>

                <Text id="leak-name" name="name" label={c.gate.nameLabel} autoComplete="given-name" />
                <Text
                  id="leak-company"
                  name="company"
                  label={c.gate.companyLabel}
                  autoComplete="organization"
                />
                <Text
                  id="leak-email"
                  name="email"
                  label={c.gate.emailLabel}
                  type="email"
                  autoComplete="email"
                  required
                  invalid={fieldError}
                />

                <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-ink-3">
                  <input
                    type="checkbox"
                    name="consent_marketing"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-gold"
                  />
                  {c.gate.consentLabel}
                </label>

                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="group inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-ink px-6 text-sm font-medium text-bg transition-colors hover:bg-ink-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === "loading" ? (
                    c.gate.submitting
                  ) : (
                    <>
                      {c.gate.submit}
                      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>

                {status === "error" ? (
                  <p className="text-sm text-signal">{message}</p>
                ) : (
                  <p className="text-xs leading-relaxed text-ink-4">{c.gate.fine}</p>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LineItem({ label, body, amount }: { label: string; body: string; amount: number }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <dt className="text-base font-semibold text-ink">{label}</dt>
        <dd className="mt-1 max-w-sm text-sm leading-relaxed text-ink-3">{body}</dd>
      </div>
      <p className="display-m number-tabular shrink-0 text-xl text-ink sm:text-2xl">
        {formatDollars(amount)}
      </p>
    </div>
  );
}

function NumberField({
  id,
  label,
  help,
  prefix,
  suffix,
  value,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  prefix?: string;
  suffix?: string;
  value: number;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-line-strong bg-bg-2 px-3.5 transition-colors focus-within:border-gold focus-within:ring-2 focus-within:ring-gold/20">
        {prefix && <span className="text-sm text-ink-3">{prefix}</span>}
        <input
          id={id}
          inputMode="numeric"
          aria-describedby={`${id}-help`}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="number-tabular min-h-[48px] w-full bg-transparent text-base text-ink outline-none"
        />
        {suffix && <span className="shrink-0 text-sm text-ink-4">{suffix}</span>}
      </div>
      <p id={`${id}-help`} className="mt-1.5 text-xs leading-relaxed text-ink-4">
        {help}
      </p>
    </div>
  );
}

function SelectField({
  id,
  label,
  help,
  value,
  options,
  onChange,
  className,
}: {
  id: string;
  label: string;
  help: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <select
        id={id}
        value={value}
        aria-describedby={`${id}-help`}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 min-h-[48px] w-full rounded-xl border border-line-strong bg-bg-2 px-3.5 text-base text-ink outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <p id={`${id}-help`} className="mt-1.5 text-xs leading-relaxed text-ink-4">
        {help}
      </p>
    </div>
  );
}

function Text({
  id,
  name,
  label,
  type = "text",
  autoComplete,
  required,
  invalid,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  invalid?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-ink-2">
        {label}
        {!required && <span className="ml-1 text-xs text-ink-4">optional</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        aria-invalid={invalid}
        autoComplete={autoComplete}
        className="mt-1.5 min-h-[48px] w-full rounded-xl border border-line-strong bg-surface px-3.5 text-base text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-gold focus:ring-2 focus:ring-gold/20"
      />
    </div>
  );
}
