import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { JsonLd } from "@/components/JsonLd";
import { WeblineHero } from "@/components/webline/Hero";
import { CheckoutNotice } from "@/components/webline/CheckoutNotice";
import { StickyBar } from "@/components/webline/StickyBar";
import { Bnpl, Bonuses, Care, Compare, Faq, FinalCta, Fit, Guarantee, Problem, Process, Proof, Stack } from "@/components/webline/Sections";
import { fillWebline, webline, WEBLINE_ID, type WeblineMoney } from "@/config/webline";
import { business } from "@/config/site";
import { getDisplayProduct } from "@/lib/products-data";
import { formatMoney } from "@/lib/money";
import { crumbsJsonLd, faqPageJsonLd, productJsonLd } from "@/lib/seo";

/**
 * Public, indexable sales page for Webline. The price is read from the
 * products table (edited in the admin) and cached; saving a new price
 * revalidates this path.
 */
export const revalidate = 600;

const PATH = "/webline";

export const metadata: Metadata = {
  title: webline.meta.title,
  description: webline.meta.description,
  keywords: [
    "startup website",
    "startup website design",
    "website for startups Canada",
    "SEO website for startups",
    "GEO AEO website",
    "AI search optimized website",
    "pay in 4 website design",
    "Afterpay website design",
    "Klarna website design",
    "Webline",
    "Tekmadev",
  ],
  alternates: { canonical: `${business.url}${PATH}` },
  openGraph: {
    type: "website",
    url: `${business.url}${PATH}`,
    title: webline.meta.title,
    description: webline.meta.description,
    siteName: business.name,
  },
  twitter: {
    card: "summary_large_image",
    title: webline.meta.title,
    description: webline.meta.description,
  },
};

export default async function WeblinePage() {
  const product = await getDisplayProduct(WEBLINE_ID);
  if (!product) notFound();

  const money: WeblineMoney = {
    price: formatMoney(product.amount, product.currency),
    installment: formatMoney(product.installment, product.currency, { cents: true }),
    currency: product.currency,
    monthly: product.monthly ? formatMoney(product.monthly.amount, product.currency) : null,
    trialDays: product.monthly?.trialDays ?? 30,
  };
  const buy = { productId: product.id, purchasable: product.purchasable };

  return (
    <main className="relative min-h-screen bg-bg text-ink">
      <JsonLd
        data={productJsonLd({
          id: product.id,
          name: `${product.name} by ${business.name}`,
          description: webline.meta.description,
          path: PATH,
          priceCents: product.amount,
          currency: product.currency,
          image: `${business.url}${PATH}/opengraph-image`,
          features: webline.stack.items.map((i) => i.title),
          monthly: product.monthly ? { amountCents: product.monthly.amount, name: product.care?.name ?? "Monthly plan" } : null,
        })}
      />
      <JsonLd data={faqPageJsonLd(webline.faqs.map((f) => ({ q: fillWebline(f.q, money), a: fillWebline(f.a, money) })))} />
      <JsonLd
        data={crumbsJsonLd([
          { name: "Home", url: business.url },
          { name: product.name, url: `${business.url}${PATH}` },
        ])}
      />

      <Nav />
      <WeblineHero productId={product.id} purchasable={product.purchasable} money={money} />
      <CheckoutNotice productId={product.id} />
      <Problem />
      <Stack money={money} buy={buy} />
      <Bonuses />
      <Process />
      <Care money={money} />
      <Proof />
      <Compare money={money} />
      <Guarantee />
      <Bnpl money={money} buy={buy} />
      <Fit />
      <Faq money={money} />
      <FinalCta money={money} buy={buy} />
      <Footer />
      {/* Room for the sticky buy bar on phones and tablets. */}
      <div aria-hidden className="h-20 lg:hidden" />
      <StickyBar productId={product.id} purchasable={product.purchasable} price={money.price} installment={money.installment} monthly={money.monthly} />
    </main>
  );
}
