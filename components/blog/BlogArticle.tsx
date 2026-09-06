import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PostBody } from "@/components/blog/PostBody";
import type { BlogPostWithRefs } from "@/lib/blog-data";

export function formatPostDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Toronto",
  }).format(new Date(iso));
}

export function BlogArticle({
  post,
  related,
}: {
  post: BlogPostWithRefs;
  related: BlogPostWithRefs[];
}) {
  const author = post.author;
  const date = formatPostDate(post.published_at);

  return (
    <article className="mx-auto w-full max-w-3xl px-5 pt-32 pb-24 sm:px-8 sm:pt-40">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-8 text-xs text-ink-4">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="transition-colors hover:text-ink">
              Home
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href="/blog" className="transition-colors hover:text-ink">
              Blog
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="text-ink-3">{post.title}</li>
        </ol>
      </nav>

      <header>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-4">
          {post.category && (
            <Link
              href={`/blog?category=${post.category.slug}`}
              className="eyebrow text-gold transition-colors hover:text-ink"
            >
              {post.category.name}
            </Link>
          )}
          {post.category && date && <span aria-hidden>/</span>}
          {date && <time dateTime={post.published_at ?? undefined}>{date}</time>}
          {post.reading_time_minutes ? <span aria-hidden>/</span> : null}
          {post.reading_time_minutes ? <span>{post.reading_time_minutes} min read</span> : null}
        </div>

        <h1 className="display-xl mt-6 text-balance text-4xl sm:text-5xl lg:text-6xl">{post.title}</h1>

        {post.excerpt && (
          <p className="mt-7 text-pretty text-lg leading-relaxed text-ink-2 sm:text-xl">{post.excerpt}</p>
        )}

        {author && (
          <div className="mt-8 flex items-center gap-3 border-t border-line pt-6">
            {author.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={author.avatar_url}
                alt={author.name}
                className="h-10 w-10 rounded-full border border-line object-cover"
              />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-bg-2 text-sm font-semibold text-ink-3">
                {author.name.charAt(0)}
              </span>
            )}
            <div className="text-sm">
              <p className="font-medium text-ink">{author.name}</p>
              {author.role && <p className="text-ink-4">{author.role}</p>}
            </div>
          </div>
        )}
      </header>

      {post.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.cover_image_url}
          alt={post.cover_image_alt ?? post.title}
          className="mt-10 w-full rounded-3xl border border-line"
        />
      )}

      {/* Key takeaways (answer-engine friendly summary) */}
      {post.key_takeaways && post.key_takeaways.length > 0 && (
        <section className="mt-12 rounded-2xl border border-line bg-bg-2 p-6 sm:p-8">
          <p className="eyebrow">Key takeaways</p>
          <ul className="mt-5 flex flex-col gap-3">
            {post.key_takeaways.map((t, i) => (
              <li key={i} className="flex gap-3 text-base leading-relaxed text-ink-2">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PostBody blocks={post.body} />

      {/* FAQs */}
      {post.faqs && post.faqs.length > 0 && (
        <section className="mt-16">
          <h2 className="display-m text-2xl text-ink sm:text-3xl">Frequently asked questions</h2>
          <dl className="mt-7 flex flex-col">
            {post.faqs.map((f, i) => (
              <div key={i} className="border-t border-line py-6">
                <dt className="text-base font-semibold text-ink sm:text-lg">{f.q}</dt>
                <dd className="mt-2.5 text-base leading-relaxed text-ink-2">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-16">
          <p className="eyebrow">Keep reading</p>
          <ul className="mt-5 flex flex-col gap-3">
            {related.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/blog/${r.slug}`}
                  className="group inline-flex items-center gap-2 text-base text-ink-2 transition-colors hover:text-gold"
                >
                  {r.title}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* CTA */}
      <section className="mt-16 overflow-hidden rounded-3xl border border-line-strong bg-surface p-8 sm:p-10">
        <h2 className="display-m text-2xl text-ink sm:text-3xl">Want this built for your business?</h2>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-2">
          We install the system that answers every lead, books the call, and follows up automatically. Book a
          call and we will map it to your business.
        </p>
        <a
          href="/#book"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
        >
          Book a call
          <ArrowRight className="h-4 w-4" />
        </a>
      </section>
    </article>
  );
}
