import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";
import { business, unsubscribeCopy as copy } from "@/config/site";
import { getSubscriberByToken, type TokenSubscriber } from "@/lib/subscribers-data";
import { confirmUnsubscribeAction, resubscribeAction, unsubscribeReasonAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
  // The URL carries the person's token. Never hand it to the next site they visit.
  referrer: "no-referrer",
};

type Search = { t?: string; e?: string; stay?: string; back?: string };
type State = "confirm" | "stay" | "done" | "back" | "invalid" | "error";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
const primary = `inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-ink px-6 text-sm font-semibold text-bg transition-colors hover:bg-gold ${focusRing}`;
// Same size as the primary on purpose: leaving must be exactly as easy as staying.
const secondary = `inline-flex min-h-[52px] w-full items-center justify-center rounded-xl border border-line-strong px-6 text-sm font-semibold text-ink transition-colors hover:border-ink/40 hover:bg-ink/[0.04] ${focusRing}`;

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Search> }) {
  const { t, e, stay, back } = await searchParams;

  // The page only ever reads. Every change is a button press (see actions.ts).
  let state: State;
  let sub: TokenSubscriber | null = null;
  if (e && e !== "notfound") state = "error";
  else if (!t || e === "notfound") state = "invalid";
  else {
    const found = await getSubscriberByToken(t);
    if (!found.ok) state = found.reason === "config" ? "error" : "invalid";
    else {
      sub = found.subscriber;
      if (sub.status === "unsubscribed") state = "done";
      else if (sub.status === "active" && back) state = "back";
      else if (sub.status === "active" && stay) state = "stay";
      else state = "confirm";
    }
  }

  const withEmail = (text: string) => text.replace("{email}", sub?.maskedEmail ?? "your address");
  // A plain anchor, not <Link>: leaving this page must be a full page load. The
  // Meta pixel is kept off this document, and a client-side navigation would
  // load it into the same document that has the token in its history.
  const homeLink = (className: string) => (
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a href="/" className={className}>
      {copy.home}
    </a>
  );
  const home = homeLink(`${secondary} mt-8`);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-5 py-8 text-ink sm:py-12">
      <div className="w-full max-w-md rounded-2xl border border-line-strong bg-surface p-7 shadow-sm sm:p-10">
        <Image
          src="/images/logo/TMD2_logo.svg"
          alt={`${business.name} mark`}
          width={44}
          height={44}
          className="h-11 w-11"
        />

        {state === "confirm" && (
          <>
            <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.22em] text-gold">{copy.eyebrow}</p>
            <h1 className="mt-3 font-display text-2xl font-bold leading-tight text-ink">{copy.confirm.title}</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-3">{copy.confirm.lead}</p>

            <ul className="mt-5 space-y-2.5">
              {copy.confirm.points.map((point) => (
                <li key={point} className="flex items-start gap-3 text-[15px] leading-snug text-ink-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-tint text-gold">
                    <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                  </span>
                  {point}
                </li>
              ))}
            </ul>

            <p className="mt-5 text-sm leading-relaxed text-ink-3">{copy.confirm.nudge}</p>

            <div className="mt-6 space-y-3">
              <Link href={`/unsubscribe?t=${encodeURIComponent(t ?? "")}&stay=1`} className={primary}>
                {copy.confirm.stay}
              </Link>
              <form action={confirmUnsubscribeAction}>
                <input type="hidden" name="t" value={t} />
                <button type="submit" className={secondary}>
                  {copy.confirm.leave}
                </button>
              </form>
            </div>

            <p className="mt-4 text-center text-xs text-ink-4">{withEmail(copy.confirm.address)}</p>
          </>
        )}

        {state === "stay" && (
          <>
            <h1 className="mt-7 font-display text-2xl font-bold leading-tight text-ink">{copy.stay.title}</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-3">{copy.stay.body}</p>
            {home}
          </>
        )}

        {state === "back" && (
          <>
            <h1 className="mt-7 font-display text-2xl font-bold leading-tight text-ink">{copy.back.title}</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-3">{copy.back.body}</p>
            {home}
          </>
        )}

        {state === "done" && (
          <>
            <h1 className="mt-7 font-display text-2xl font-bold leading-tight text-ink">{copy.done.title}</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-3">{withEmail(copy.done.body)}</p>

            <div className="mt-7 border-t border-line pt-6">
              {sub?.unsubscribe_reason ? (
                <p className="text-sm text-ink-3">{copy.done.reasonThanks}</p>
              ) : (
                <form action={unsubscribeReasonAction}>
                  <input type="hidden" name="t" value={t} />
                  <p className="text-sm text-ink-3">{copy.done.reasonPrompt}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {copy.reasons.map((r) => (
                      <button
                        key={r.key}
                        type="submit"
                        name="reason"
                        value={r.key}
                        className={`rounded-full border border-line-strong px-3.5 py-2 text-xs font-medium text-ink-2 transition-colors hover:border-gold/60 hover:text-gold ${focusRing}`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </form>
              )}
            </div>

            <div className="mt-6 border-t border-line pt-6">
              <p className="text-sm text-ink-3">{copy.done.mistake}</p>
              <form action={resubscribeAction} className="mt-3">
                <input type="hidden" name="t" value={t} />
                <button type="submit" className={secondary}>
                  {copy.done.resubscribe}
                </button>
              </form>
            </div>

            {homeLink(`mt-6 block text-center text-sm text-ink-4 transition-colors hover:text-gold ${focusRing}`)}
          </>
        )}

        {(state === "invalid" || state === "error") && (
          <>
            <h1 className="mt-7 font-display text-2xl font-bold leading-tight text-ink">{copy[state].title}</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-3">{copy[state].body}</p>
            <a href={`mailto:${business.email}?subject=Unsubscribe`} className={`${secondary} mt-8`}>
              {copy.invalid.cta}
            </a>
          </>
        )}
      </div>
    </main>
  );
}
