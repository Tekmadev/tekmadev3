import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Section, Eyebrow } from "@/components/Section";
import { Reveal } from "@/components/webline/Reveal";
import { webline, WEBLINE_ID } from "@/config/webline";
import { getDisplayProduct } from "@/lib/products-data";
import { formatMoney } from "@/lib/money";

/**
 * The Webline block on the home page. Server-rendered so the price and the
 * pay-in-4 instalment come from the products table, the same source the
 * /webline page and Stripe use, and can never drift from what someone is
 * actually charged. Renders nothing if the product is unknown.
 */
export async function Webline() {
  const product = await getDisplayProduct(WEBLINE_ID);
  if (!product) return null;

  const price = formatMoney(product.amount, product.currency);
  const installment = formatMoney(product.installment, product.currency, { cents: true });
  const anchor = formatMoney(
    webline.stack.items.reduce((sum, item) => sum + item.worth, 0) * 100,
    product.currency,
  );

  const h = webline.home;
  const c = h.card;

  return (
    <div id="webline" className="relative isolate overflow-hidden border-y border-line bg-bg-2 py-24 sm:py-32">
      <div aria-hidden className="pointer-events-none absolute inset-0 grain" />

      <Section className="relative">
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <Reveal>
              <Eyebrow>{h.eyebrow}</Eyebrow>
              <h2 className="display-xl mt-6 max-w-2xl text-balance text-4xl sm:text-5xl lg:text-6xl">
                {h.headline}{" "}
                <span className="gold-gradient-text">
                  {h.accent.replace("{installment}", installment)}
                </span>
              </h2>
              <p className="mt-7 max-w-xl text-balance text-lg leading-snug text-ink-2">{h.sub}</p>
            </Reveal>

            <dl className="mt-12 grid grid-cols-1 gap-x-10 gap-y-7 sm:grid-cols-2">
              {h.points.map((p, i) => (
                <Reveal key={p.title} delay={0.06 + i * 0.06}>
                  <dt className="flex items-center gap-2.5 text-base font-semibold text-ink">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/15">
                      <Check className="h-3 w-3 text-gold-deep" />
                    </span>
                    {p.title}
                  </dt>
                  <dd className="mt-2 pl-[1.9rem] text-base leading-relaxed text-ink-2">{p.body}</dd>
                </Reveal>
              ))}
            </dl>

            <Reveal delay={0.3} className="mt-11 flex max-w-xl items-start gap-3 rounded-2xl border border-line-strong bg-surface p-5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold-deep" />
              <p className="text-sm leading-relaxed text-ink-2">{h.guarantee}</p>
            </Reveal>
          </div>

          <div className="lg:col-span-5">
            <Reveal delay={0.12}>
              <div className="relative overflow-hidden rounded-3xl border border-line-strong bg-surface p-7 sm:p-9">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm text-ink-3">{c.anchor}</p>
                  <p className="display-m text-xl text-ink-4 line-through decoration-signal/60 decoration-2">
                    {anchor}
                  </p>
                </div>

                <div className="my-7 h-px w-full bg-line" />

                <p className="eyebrow">{c.installHead}</p>
                <p className="display-xxl number-tabular mt-2 text-6xl text-ink sm:text-7xl">
                  {installment}
                </p>

                <div className="mt-6 grid grid-cols-4 gap-1.5">
                  {c.schedule.map((label, i) => (
                    <div
                      key={label}
                      className={
                        i === 0
                          ? "rounded-xl border border-gold/40 bg-gold/[0.09] px-1 py-2 text-center"
                          : "rounded-xl border border-line bg-bg-2 px-1 py-2 text-center"
                      }
                    >
                      <p className={`number-tabular text-xs font-semibold ${i === 0 ? "text-ink" : "text-ink-3"}`}>
                        {installment}
                      </p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-4">{label}</p>
                    </div>
                  ))}
                </div>

                <p className="mt-4 text-sm leading-relaxed text-ink-3">{c.installNote}</p>

                <div className="my-7 h-px w-full bg-line" />

                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm text-ink-3">{c.onceLabel}</p>
                  <p className="display-l number-tabular text-3xl text-ink">{price}</p>
                </div>

                <a
                  href="/webline"
                  className="group mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-4 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
                >
                  {c.cta}
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </a>

                <p className="mt-4 text-center text-xs text-ink-4">{c.fine}</p>

                <ul className="mt-7 flex flex-wrap justify-center gap-x-2 gap-y-2 border-t border-line pt-6">
                  {c.badges.map((b) => (
                    <li
                      key={b}
                      className="rounded-full border border-line-strong bg-bg-2 px-3 py-1 text-xs text-ink-2"
                    >
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </Section>
    </div>
  );
}
