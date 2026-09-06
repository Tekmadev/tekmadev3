import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatPostDate } from "@/components/blog/BlogArticle";
import type { BlogPostWithRefs } from "@/lib/blog-data";

export function PostCard({ post }: { post: BlogPostWithRefs }) {
  const date = formatPostDate(post.published_at);
  return (
    <li className="border-t border-line last:border-b">
      <Link href={`/blog/${post.slug}`} className="group flex flex-col gap-5 py-7 sm:flex-row sm:items-start sm:gap-8">
        {post.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.cover_image_url}
            alt={post.cover_image_alt ?? post.title}
            loading="lazy"
            className="h-44 w-full shrink-0 rounded-2xl border border-line object-cover sm:h-28 sm:w-44"
          />
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-4">
            {post.category && <span className="eyebrow text-gold">{post.category.name}</span>}
            {post.category && date && <span aria-hidden>/</span>}
            {date && <span>{date}</span>}
            {post.reading_time_minutes ? <span aria-hidden>/</span> : null}
            {post.reading_time_minutes ? <span>{post.reading_time_minutes} min read</span> : null}
          </div>
          <h2 className="display-m mt-2.5 text-xl text-ink transition-colors group-hover:text-gold sm:text-2xl">
            {post.title}
          </h2>
          {post.excerpt && <p className="mt-2.5 text-base leading-relaxed text-ink-3">{post.excerpt}</p>}
          <span className="mt-3.5 inline-flex items-center gap-1.5 text-sm font-medium text-gold">
            Read the post
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
    </li>
  );
}
