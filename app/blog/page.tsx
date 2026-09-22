import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Section } from "@/components/Section";
import { JsonLd } from "@/components/JsonLd";
import { PostCard } from "@/components/blog/PostCard";
import { getPublishedPosts, getPublishedPostSlugs, type BlogCategory } from "@/lib/blog-data";
import { business } from "@/config/site";
import { crumbsJsonLd } from "@/lib/seo";

export const revalidate = 300;

const TITLE = "The Tekmadev growth blog";
const DESCRIPTION =
  "Straight, practical plays on getting more clients: answering every lead, booking more calls, following up, and using AI and automation to grow a service business. Or hand it all to us and we run it.";

/**
 * An empty blog index is thin content: a title, a promise and nothing under it.
 * Until the first post is published the page asks not to be indexed (and the
 * sitemap leaves it out), then switches itself on with no code change.
 */
export async function generateMetadata(): Promise<Metadata> {
  const hasPosts = (await getPublishedPostSlugs()).length > 0;
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${business.url}/blog` },
    openGraph: { title: TITLE, description: DESCRIPTION, url: `${business.url}/blog`, type: "website", images: ["/opengraph-image"] },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/twitter-image"] },
    ...(hasPosts ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function BlogIndex({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  // One read, then filter in memory: the chips are only the categories that
  // have a live post, so a category created for a draft never shows up empty.
  const all = await getPublishedPosts();
  const categories = [...new Map(all.flatMap((p) => (p.category ? [[p.category.id, p.category] as const] : []))).values()].sort(
    (a: BlogCategory, b: BlogCategory) => a.name.localeCompare(b.name),
  );
  const posts = category ? all.filter((p) => p.category?.slug === category) : all;

  return (
    <Section className="pt-32 pb-24 sm:pt-40">
      <JsonLd
        data={crumbsJsonLd([
          { name: "Home", url: business.url },
          { name: "Blog", url: `${business.url}/blog` },
        ])}
      />
      {posts.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "Blog",
            "@id": `${business.url}/blog#blog`,
            name: TITLE,
            description: DESCRIPTION,
            url: `${business.url}/blog`,
            publisher: { "@id": `${business.url}#organization` },
            blogPost: posts.slice(0, 20).map((p) => ({
              "@type": "BlogPosting",
              headline: p.title,
              url: `${business.url}/blog/${p.slug}`,
              datePublished: p.published_at ?? p.created_at,
            })),
          }}
        />
      )}

      <div className="mx-auto max-w-3xl">
        <p className="eyebrow">Blog</p>
        <h1 className="display-xl mt-6 text-balance text-4xl sm:text-5xl lg:text-6xl">
          Grow your service business, one play at a time
        </h1>
        <p className="mt-6 text-pretty text-lg leading-relaxed text-ink-2">{DESCRIPTION}</p>

        {categories.length > 0 && (
          <nav className="mt-10 flex flex-wrap gap-2" aria-label="Categories">
            <CategoryChip href="/blog" label="All" active={!category} />
            {categories.map((c) => (
              <CategoryChip
                key={c.id}
                href={`/blog?category=${c.slug}`}
                label={c.name}
                active={category === c.slug}
              />
            ))}
          </nav>
        )}

        {posts.length > 0 ? (
          <ul className="mt-10 flex flex-col">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </ul>
        ) : (
          <div className="mt-12 rounded-2xl border border-line bg-bg-2 p-8 text-center">
            <p className="text-base text-ink-2">
              {category ? "No posts in this category yet." : "The first posts are on their way."}
            </p>
          </div>
        )}

        <div className="mt-14">
          <a
            href="/#book"
            className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
          >
            Or just book a call and we&apos;ll handle it
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </Section>
  );
}

function CategoryChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={
        "rounded-full border px-4 py-1.5 text-sm transition-colors " +
        (active
          ? "border-gold bg-gold/10 text-ink"
          : "border-line text-ink-3 hover:border-line-strong hover:text-ink")
      }
    >
      {label}
    </Link>
  );
}
