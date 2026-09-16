import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { requireClient } from "@/lib/portal-auth";
import { getDisplayTiers } from "@/lib/pricing-data";
import { getDisplayProduct } from "@/lib/products-data";
import { formatMoney } from "@/lib/money";
import { PROMO } from "@/config/pricing";
import { WEBLINE_ID, webline } from "@/config/webline";
import { business, portal } from "@/config/site";
import { Badge, Notice, PageHeader, Panel, btnPrimary, btnSecondary } from "@/components/portal/ui";
import { PortalForm } from "@/components/portal/PortalForm";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { startCheckoutAction } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Plans for a free account. Checkout starts from here with the member's
 * email and account id attached, so the webhook turns THIS account into the
 * onboarding rather than creating a second one.
 */
export default async function PlansPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const [{ client, member }, params] = await Promise.all([requireClient(), searchParams]);
  const canBuy = member.role === "owner" || member.role === "admin";

  if (client.status !== "lead") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Plans" subtitle="Your account already has a plan." />
        <Panel>
          <p className="text-sm text-ink-3">
            To change or add a plan, email {business.email} or call {business.phone.display} and we will set it up with you.
          </p>
          <Link href="/" className={btnSecondary + " mt-4"}>
            Back home
          </Link>
        </Panel>
      </div>
    );
  }

  const [tiers, product] = await Promise.all([getDisplayTiers(), getDisplayProduct(WEBLINE_ID)]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pick your plan"
        subtitle="Pay and your onboarding starts the same minute. Growth plans: cancel any month. Webline: a build fee you can pay in 4 with Afterpay or Klarna, then monthly hosting and care."
      />

      {params.checkout === "cancelled" && <Notice kind="info">Checkout cancelled. No charge was made.</Notice>}
      {!canBuy && <Notice kind="info">Only account owners and admins can choose a plan. Ask {client.primary_email}.</Notice>}
      {PROMO.active && <Notice kind="ok">{PROMO.text}</Notice>}

      <div className="grid gap-6 lg:grid-cols-3">
        {tiers.map((tier) => {
          const custom = tier.monthlyAmount === null;
          return (
            <Panel
              key={tier.id}
              title={tier.name}
              action={tier.badge ? <Badge tone="gold">{tier.badge}</Badge> : undefined}
              className={tier.highlighted ? "ring-1 ring-gold/40" : undefined}
            >
              <p className="text-sm text-ink-3">{tier.blurb}</p>
              <div className="mt-5">
                {custom ? (
                  <p className="font-display text-3xl font-bold text-ink">Custom</p>
                ) : (
                  <p className="font-display text-3xl font-bold text-ink">
                    {formatMoney(tier.monthlyAmount as number, tier.currency)}
                    <span className="text-sm font-medium text-ink-4"> /mo</span>
                  </p>
                )}
                <p className="mt-1 text-xs text-ink-4">
                  {custom
                    ? "scoped one-to-one"
                    : tier.setupAmount && tier.setupAmount > 0
                      ? `${formatMoney(tier.setupAmount, tier.currency)} setup today, first monthly in 30 days`
                      : "billed monthly"}
                </p>
              </div>
              {tier.guarantee && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-gold/30 bg-gold/[0.06] px-3 py-2.5 text-xs text-ink-2">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-deep" />
                  <span>30 booked appointments in 60 days, or we work free and pause your billing until you hit it.</span>
                </div>
              )}
              <ul className="mt-5 flex flex-col gap-2.5">
                {tier.features.slice(0, 6).map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-ink-2">
                    {f.endsWith("plus:") ? (
                      <span className="font-medium text-ink">{f}</span>
                    ) : (
                      <>
                        <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-gold/15">
                          <Check className="h-2.5 w-2.5 text-gold-deep" />
                        </span>
                        <span>{f}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {tier.cta.type === "checkout" ? (
                  canBuy ? (
                    <PortalForm action={startCheckoutAction}>
                      <input type="hidden" name="offer" value={tier.id} />
                      <SubmitButton className="w-full" pendingLabel="Opening secure checkout" variant={tier.highlighted ? "primary" : "secondary"}>
                        Choose {tier.name}
                      </SubmitButton>
                    </PortalForm>
                  ) : null
                ) : (
                  <a href={portal.kickoffCalUrl} target="_blank" rel="noopener" className={btnSecondary + " w-full"}>
                    {tier.cta.label}
                  </a>
                )}
              </div>
            </Panel>
          );
        })}
      </div>

      {product && (
        <Panel title={`${product.name}: just the website`} action={<Badge tone="neutral">Build + care</Badge>}>
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <p className="text-sm text-ink-3">{product.tagline}</p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {webline.stack.items.map((it) => (
                  <li key={it.title} className="flex items-start gap-2.5 text-sm text-ink-2">
                    <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-gold/15">
                      <Check className="h-2.5 w-2.5 text-gold-deep" />
                    </span>
                    {it.title}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-ink-4">
                {webline.guarantee.headline} Full details at{" "}
                <a href={`${business.url}${product.path}`} target="_blank" rel="noopener" className="text-ink underline-offset-2 hover:underline">
                  {business.domain}
                  {product.path}
                </a>
                .
              </p>
            </div>
            <div className="rounded-2xl border border-line-strong bg-bg p-5 lg:w-72">
              <p className="font-display text-3xl font-bold text-ink">{formatMoney(product.amount, product.currency)}</p>
              <p className="mt-1 text-xs text-ink-4">to build. Or 4 × {formatMoney(product.installment, product.currency, { cents: true })} with Afterpay or Klarna, 0% interest.</p>
              {product.monthly && (
                <p className="mt-1 text-xs text-ink-4">
                  Then {formatMoney(product.monthly.amount, product.currency)}/month hosting and care, starting {product.monthly.trialDays} days after you buy.
                  Cancel anytime.
                </p>
              )}
              <div className="mt-4">
                {canBuy ? (
                  product.purchasable ? (
                    <PortalForm action={startCheckoutAction}>
                      <input type="hidden" name="offer" value={product.id} />
                      <SubmitButton className="w-full" pendingLabel="Opening secure checkout">
                        Get {product.name}
                      </SubmitButton>
                    </PortalForm>
                  ) : (
                    <a href={portal.kickoffCalUrl} target="_blank" rel="noopener" className={btnPrimary + " w-full"}>
                      Book a call
                    </a>
                  )
                ) : null}
              </div>
            </div>
          </div>
        </Panel>
      )}

      <p className="text-xs text-ink-4">
        Checkout is handled by Stripe. Growth plans: a short qualification call confirms fit before kickoff. Prices in {tiers[0]?.currency ?? "CAD"}, taxes added where applicable.
      </p>
    </div>
  );
}
