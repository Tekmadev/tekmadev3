import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogArticle } from "@/components/blog/BlogArticle";
import { JsonLd } from "@/components/JsonLd";
import {
  getPublishedPostBySlug,
  getPublishedPostSlugs,
  getRelatedPosts,
} from "@/lib/blog-data";
import { business } from "@/config/site";
import { blogPostingJsonLd, crumbsJsonLd, faqPageJsonLd } from "@/lib/seo";

export const revalidate = 300;

export async function generateStaticParams() {
  const slugs = await getPublishedPostSlugs();
  return slugs.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) return {};

  const path = `/blog/${post.slug}`;
  const title = post.meta_title || post.title;
  const description = post.meta_description || post.excerpt || undefined;
  const image = post.cover_image_url || post.og_image_url || undefined;

  return {
    title,
    description,
    alternates: { canonical: post.canonical_url || `${business.url}${path}` },
    ...(post.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title,
      description,
      url: `${business.url}${path}`,
      type: "article",
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.updated_at,
      ...(post.author ? { authors: [post.author.name] } : {}),
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) notFound();

  const path = `/blog/${post.slug}`;
  const related = await getRelatedPosts(post);

  return (
    <>
      <JsonLd data={blogPostingJsonLd(post, path)} />
      {post.faqs.length > 0 && <JsonLd data={faqPageJsonLd(post.faqs.map((f) => ({ q: f.q, a: f.a })))} />}
      <JsonLd
        data={crumbsJsonLd([
          { name: "Home", url: business.url },
          { name: "Blog", url: `${business.url}/blog` },
          { name: post.title, url: `${business.url}${path}` },
        ])}
      />
      <BlogArticle post={post} related={related} />
    </>
  );
}
