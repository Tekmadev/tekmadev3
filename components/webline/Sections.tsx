import { ArrowUpRight, Check, Minus, Phone, ShieldCheck, X } from "lucide-react";
import { Section, Eyebrow } from "@/components/Section";
import { Reveal } from "@/components/webline/Reveal";
import { CheckoutButton } from "@/components/webline/CheckoutButton";
import { webline, type WeblineCompareValue } from "@/config/webline";
import { business, proofWins, aggregateStats } from "@/config/site";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";

type Money = { price: string; installment: string; currency: string };
type Buy = { productId: string; purchasable: boolean };

/* ------------------------------------------------------------------------ */
/* The three bad options                                                    */
/* ------------------------------------------------------------------------ */

export function Problem() {
  const p = webline.problem;
  return (
    <Section id="problem" className="py-24 sm:py-32">
      <Reveal>
        <Eyebrow>{p.eyebrow}</Eyebrow>
        <h2 className="display-xl mt-6 max-w-4xl text-balance text-4xl sm:text-5xl lg:text-6xl">{p.headline}</h2>
      </Reveal>

      <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-line bg-line md:grid-cols-3">
        {p.options.map((o, i) => (
          <Reveal key={o.name} delay={i * 0.08} className="bg-surface p-7 sm:p-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-signal">Option {i + 1}</p>
            <h3 className="display-m mt-4 text-2xl text-ink">{o.name}</h3>
            <p className="mt-2 text-sm font-medium text-ink-3">{o.cost}</p>
            <p className="mt-4 text-base leading-relaxed text-ink-2">{o.body}</p>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-8 rounded-3xl border border-gold/30 bg-gold/[0.06] p-7 sm:p-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-gold-deep">Option 4</p>
        <p className="mt-3 max-w-3xl text-lg leading-snug text-ink sm:text-xl">{p.resolve}</p>
      </Reveal>
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* Value stack                                                              */
/* ------------------------------------------------------------------------ */

export function Stack({ money, buy }: { money: Money; buy: Buy }) {
  const s = webline.stack;
  const total = s.items.reduce((sum, it) => sum + it.worth, 0);

  return (
    <Section id="included" className="border-t border-line bg-bg-2 py-24 sm:py-32">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-4">
          <Reveal>
            <Eyebrow>{s.eyebrow}</Eyebrow>
            <h2 className="display-xl mt-6 text-balance text-4xl sm:text-5xl">{s.headline}</h2>
            <p className="mt-6 text-base leading-relaxed text-ink-2">{s.intro}</p>
          </Reveal>

          <Reveal delay={0.1} className="mt-10 rounded-3xl border border-line-strong bg-surface p-7">
            <p className="text-sm text-ink-3">{s.totalLabel}</p>
            <p className="display-l mt-1 text-3xl text-ink-4 line-through decoration-signal/60 decoration-2">
              {formatMoney(total * 100, money.currency)}
            </p>
            <div className="my-6 h-px w-full bg-line" />
            <p className="text-sm text-ink-3">{s.priceLabel}</p>
            <p className="display-xl mt-1 text-6xl text-ink">{money.price}</p>
            <p className="mt-2 text-sm text-ink-3">once. Or 4 × {money.installment} with Afterpay or Klarna.</p>
            <div className="mt-6">
              <CheckoutButton productId={buy.productId} purchasable={buy.purchasable} className="w-full" location="stack">
                Get Webline for {money.price}
              </CheckoutButton>
            </div>
          </Reveal>
        </div>

        <ol className="lg:col-span-8">
          {s.items.map((it, i) => (
            <Reveal key={it.title} delay={i * 0.05}>
              <li className="grid grid-cols-[auto_1fr_auto] gap-x-4 gap-y-1 border-t border-line py-6 last:border-b sm:gap-x-6">
                <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-gold/15">
                  <Check className="h-3.5 w-3.5 text-gold-deep" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-ink">{it.title}</h3>
                  <p className="mt-1.5 text-base leading-relaxed text-ink-2">{it.body}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-4">{s.worthLabel}</p>
                  <p className="number-tabular text-sm font-medium text-ink-3">{formatMoney(it.worth * 100, money.currency)}</p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* Bonuses                                                                  */
/* ------------------------------------------------------------------------ */

export function Bonuses() {
  const b = webline.bonuses;
  return (
    <Section className="py-24 sm:py-32">
      <Reveal>
        <Eyebrow>{b.eyebrow}</Eyebrow>
        <h2 className="display-xl mt-6 max-w-3xl text-balance text-4xl sm:text-5xl">{b.headline}</h2>
      </Reveal>
      <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
        {b.items.map((it, i) => (
          <Reveal key={it.title} delay={i * 0.08} className="rounded-3xl border border-line-strong bg-surface p-7">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-gold">Bonus 0{i + 1}</p>
            <h3 className="display-m mt-4 text-xl text-ink">{it.title}</h3>
            <p className="mt-3 text-base leading-relaxed text-ink-2">{it.body}</p>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* Process                                                                  */
/* ------------------------------------------------------------------------ */

export function Process() {
  const p = webline.process;
  return (
    <Section id="process" className="border-t border-line bg-bg-2 py-24 sm:py-32">
      <Reveal>
        <Eyebrow>{p.eyebrow}</Eyebrow>
        <h2 className="display-xl mt-6 text-balance text-4xl sm:text-5xl lg:text-6xl">
          {p.headline.split(". ")[0]}. <span className="gold-gradient-text">{p.headline.split(". ").slice(1).join(". ")}</span>
        </h2>
      </Reveal>
      <ol className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-4 md:gap-6">
        {p.steps.map((s, i) => (
          <Reveal key={s.title} delay={i * 0.08}>
            <li className="relative border-t-2 border-line-strong pt-6 md:border-t md:pt-7">
              <span className="absolute -top-[2px] left-0 h-[2px] w-12 bg-gold md:-top-px md:h-px" />
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-gold">{s.day}</p>
              <h3 className="display-m mt-3 text-2xl text-ink">{s.title}</h3>
              <p className="mt-3 text-base leading-relaxed text-ink-2">{s.body}</p>
            </li>
          </Reveal>
        ))}
      </ol>
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* Proof                                                                    */
/* ------------------------------------------------------------------------ */

export function Proof() {
  const p = webline.proof;
  return (
    <Section id="proof" className="py-24 sm:py-32">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
        <Reveal className="lg:col-span-5">
          <Eyebrow>{p.eyebrow}</Eyebrow>
          <h2 className="display-xl mt-6 text-balance text-4xl sm:text-5xl">{p.headline}</h2>
          <p className="mt-6 text-base leading-relaxed text-ink-2">{p.body}</p>
          <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8">
            {aggregateStats.map((s) => (
              <div key={s.label}>
                <dd className="display-m number-tabular text-3xl text-ink">{s.value}</dd>
                <dt className="mt-1 text-xs text-ink-3">{s.label}</dt>
              </div>
            ))}
          </dl>
        </Reveal>
        <ul className="lg:col-span-7">
          {proofWins.map((w, i) => (
            <Reveal key={w.company} delay={i * 0.06}>
              <li className="grid grid-cols-1 gap-3 border-t border-line py-6 last:border-b sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-4">{w.industry}</p>
                  {w.url ? (
                    <a
                      href={w.url}
                      target="_blank"
                      rel="noopener"
                      className="group mt-2 inline-flex items-center gap-1.5 text-xl font-semibold text-ink transition-colors hover:text-gold"
                    >
                      {w.company}
                      <ArrowUpRight className="h-4 w-4 text-ink-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </a>
                  ) : (
                    <p className="mt-2 text-xl font-semibold text-ink">{w.company}</p>
                  )}
                  <p className="mt-1 text-sm text-ink-3">
                    {w.framing}: {w.before} to {w.after}. {w.note}.
                  </p>
                </div>
                <p className="display-l number-tabular text-4xl text-ink sm:text-right">
                  {w.prefix}
                  {w.metric.toLocaleString("en-US")}
                  {w.suffix}
                </p>
              </li>
            </Reveal>
          ))}
        </ul>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* Comparison                                                               */
/* ------------------------------------------------------------------------ */

function Cell({ value, highlight }: { value: WeblineCompareValue; highlight: boolean }) {
  if (value === true) return <Check className={cn("mx-auto h-4 w-4", highlight ? "text-gold-deep" : "text-ink-2")} />;
  if (value === false) return <X className="mx-auto h-4 w-4 text-ink-5" />;
  return <span className={cn("text-sm", highlight ? "font-medium text-ink" : "text-ink-2")}>{value}</span>;
}

export function Compare({ money }: { money: Money }) {
  const c = webline.compare;
  const last = c.columns.length - 1;
  return (
    <Section id="compare" className="border-t border-line bg-bg-2 py-24 sm:py-32">
      <Reveal>
        <Eyebrow>{c.eyebrow}</Eyebrow>
        <h2 className="display-xl mt-6 text-balance text-4xl sm:text-5xl">{c.headline}</h2>
      </Reveal>
      <Reveal delay={0.1} className="mt-12 overflow-x-auto rounded-3xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-line">
              <th className="px-5 py-4 text-xs font-medium uppercase tracking-wide text-ink-4">What you get</th>
              {c.columns.map((col, i) => (
                <th
                  key={col}
                  className={cn(
                    "px-4 py-4 text-center text-xs font-semibold uppercase tracking-wide",
                    i === last ? "bg-gold/[0.08] text-gold-deep" : "text-ink-3",
                  )}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.rows.map((row) => (
              <tr key={row.label} className="border-b border-line last:border-0">
                <th scope="row" className="px-5 py-3.5 text-sm font-medium text-ink">
                  {row.label}
                </th>
                {row.values.map((v, i) => (
                  <td key={i} className={cn("px-4 py-3.5 text-center", i === last && "bg-gold/[0.08]")}>
                    <Cell value={typeof v === "string" ? v.replace("{price}", money.price) : v} highlight={i === last} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Reveal>
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* Guarantee                                                                */
/* ------------------------------------------------------------------------ */

export function Guarantee() {
  const g = webline.guarantee;
  return (
    <Section id="guarantee" className="py-24 sm:py-32">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
        <Reveal className="lg:col-span-7">
          <Eyebrow>{g.eyebrow}</Eyebrow>
          <h2 className="display-xl mt-6 text-balance text-4xl sm:text-5xl lg:text-6xl">
            {g.headline.split(", ")[0]}, <span className="gold-gradient-text">{g.headline.split(", ").slice(1).join(", ")}</span>
          </h2>
          <p className="mt-8 max-w-xl text-lg leading-snug text-ink-2">{g.body}</p>
        </Reveal>
        <Reveal delay={0.1} className="lg:col-span-5">
          <div className="rounded-3xl border border-line-strong bg-surface p-8 sm:p-10">
            <p className="eyebrow">Risk, reversed</p>
            <p className="display-xxl mt-6 text-7xl text-ink">Day 5</p>
            <p className="mt-2 text-sm text-ink-3">you see your homepage design</p>
            <div className="my-8 h-px w-full bg-line" />
            <ul className="flex flex-col gap-3.5">
              {g.points.map((pt) => (
                <li key={pt} className="flex items-start gap-3 text-base text-ink-2">
                  <ShieldCheck className="mt-0.5 h-4.5 w-4.5 shrink-0 text-gold-deep" />
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* Pay in 4                                                                 */
/* ------------------------------------------------------------------------ */

export function Bnpl({ money, buy }: { money: Money; buy: Buy }) {
  const b = webline.bnpl;
  return (
    <Section id="pay-in-4" className="border-t border-line bg-bg-2 py-24 sm:py-32">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
        <Reveal className="lg:col-span-6">
          <Eyebrow>{b.eyebrow}</Eyebrow>
          <h2 className="display-xl mt-6 text-balance text-4xl sm:text-5xl">{b.headline}</h2>
          <p className="mt-6 max-w-xl text-lg leading-snug text-ink-2">{b.body}</p>
          <div className="mt-8 flex flex-wrap gap-2">
            {["Afterpay", "Klarna", "Affirm"].map((n) => (
              <span key={n} className="rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-sm font-medium text-ink">
                {n}
              </span>
            ))}
          </div>
          <p className="mt-6 max-w-xl text-xs leading-relaxed text-ink-4">{b.fine}</p>
        </Reveal>
        <Reveal delay={0.1} className="lg:col-span-6">
          <div className="rounded-3xl border border-line-strong bg-surface p-8 sm:p-10">
            <p className="text-sm text-ink-3">Today</p>
            <p className="display-xl mt-1 text-6xl text-ink">{money.installment}</p>
            <p className="mt-2 text-sm text-ink-3">then 3 more of {money.installment}, every two weeks. {money.price} total, 0% interest.</p>
            <ol className="mt-8 flex flex-col gap-3">
              {b.steps.map((st, i) => (
                <li key={st} className="flex items-start gap-3 text-base text-ink-2">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs font-semibold text-gold-deep">
                    {i + 1}
                  </span>
                  <span>{st}</span>
                </li>
              ))}
            </ol>
            <div className="mt-8">
              <CheckoutButton productId={buy.productId} purchasable={buy.purchasable} variant="gold" className="w-full" location="bnpl">
                Start for {money.installment} today
              </CheckoutButton>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* Fit                                                                      */
/* ------------------------------------------------------------------------ */

export function Fit() {
  const f = webline.fit;
  return (
    <Section id="fit" className="py-24 sm:py-32">
      <Reveal>
        <Eyebrow>{f.eyebrow}</Eyebrow>
      </Reveal>
      <div className="mt-8 grid grid-cols-1 gap-x-12 gap-y-12 md:grid-cols-2">
        <Reveal>
          <p className="display-m text-2xl text-ink">{f.yes.title}</p>
          <ul className="mt-6 flex flex-col gap-3.5">
            {f.yes.items.map((it) => (
              <li key={it} className="flex items-start gap-3 text-base text-ink-2">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/15">
                  <Check className="h-3 w-3 text-gold-deep" />
                </span>
                {it}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="display-m text-2xl text-ink-3">{f.no.title}</p>
          <ul className="mt-6 flex flex-col gap-3.5">
            {f.no.items.map((it) => (
              <li key={it} className="flex items-start gap-3 text-base text-ink-3">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink/[0.06]">
                  <Minus className="h-3 w-3 text-ink-4" />
                </span>
                {it}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* FAQ                                                                      */
/* ------------------------------------------------------------------------ */

export function Faq() {
  return (
    <Section id="faq" className="border-t border-line bg-bg-2 py-24 sm:py-32">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-20">
        <Reveal className="lg:col-span-4">
          <Eyebrow>Straight answers</Eyebrow>
          <h2 className="display-xl mt-6 text-balance text-4xl sm:text-5xl">
            The questions, <span className="gold-gradient-text">handled.</span>
          </h2>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-ink-2">
            Anything not here: email {business.email} or call {business.phone.display}. A human answers.
          </p>
        </Reveal>
        <ul className="lg:col-span-8">
          {webline.faqs.map((f, i) => (
            <Reveal key={f.q} delay={Math.min(i * 0.03, 0.2)}>
              <li className="grid grid-cols-1 gap-3 border-t border-line py-7 last:border-b sm:grid-cols-[1fr_2fr] sm:gap-10">
                <h3 className="text-base font-semibold text-ink sm:text-lg">{f.q}</h3>
                <p className="text-base leading-relaxed text-ink-2">{f.a}</p>
              </li>
            </Reveal>
          ))}
        </ul>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* Final CTA                                                                */
/* ------------------------------------------------------------------------ */

export function FinalCta({ money, buy }: { money: Money; buy: Buy }) {
  const f = webline.finalCta;
  return (
    <div id="get-started" className="relative isolate overflow-hidden border-t border-line py-24 sm:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-[700px] w-[1100px] -translate-x-1/2 opacity-60 blur-3xl"
      >
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(closest-side at 50% 35%, rgba(220,195,153,0.45), rgba(220,195,153,0) 70%)" }}
        />
      </div>
      <Section className="relative">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <Eyebrow centered>{f.eyebrow}</Eyebrow>
            <h2 className="display-xl mt-6 text-balance text-5xl sm:text-6xl lg:text-7xl">
              {f.headline.split(", ")[0]}, <span className="gold-gradient-text">{f.headline.split(", ").slice(1).join(", ")}</span>
            </h2>
            <p className="mx-auto mt-7 max-w-2xl text-balance text-lg leading-snug text-ink-2">{f.body}</p>
          </Reveal>
          <Reveal delay={0.1} className="mt-10 flex flex-col items-center gap-4">
            <CheckoutButton productId={buy.productId} purchasable={buy.purchasable} size="lg" location="final">
              {f.cta} for {money.price}
            </CheckoutButton>
            <p className="text-sm text-ink-3">or 4 × {money.installment} with Afterpay or Klarna</p>
          </Reveal>
          <Reveal delay={0.15}>
            <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-ink-2">
              {f.reassurance.map((r) => (
                <li key={r} className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-gold-deep" />
                  {r}
                </li>
              ))}
            </ul>
            <a
              href={`tel:${business.phone.tel}`}
              className="mt-10 inline-flex items-center gap-3 rounded-2xl border border-line-strong bg-surface px-5 py-4 text-left transition-colors hover:border-ink"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15">
                <Phone className="h-4 w-4 text-gold-deep" />
              </span>
              <span>
                <span className="eyebrow block">Rather talk first?</span>
                <span className="block text-base font-semibold text-ink">{business.phone.display}</span>
              </span>
            </a>
          </Reveal>
        </div>
      </Section>
    </div>
  );
}
