import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/admin";
import { getPostByIdAdmin, getRelatedPosts } from "@/lib/blog-data";
import { BlogArticle } from "@/components/blog/BlogArticle";

export const dynamic = "force-dynamic";

export default async function PreviewPostPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const post = await getPostByIdAdmin(id);
  if (!post || post.deleted_at) notFound();

  const related = await getRelatedPosts(post);

  return (
    <div className="-mx-4 -my-6 sm:-mx-8">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-bg-2/90 px-5 py-3 text-sm backdrop-blur">
        <span className="text-ink-3">
          Preview — <span className="capitalize text-ink">{post.status.replace("_", " ")}</span>, not
          necessarily public
        </span>
        <Link href={`/admin/blog/${post.id}`} className="text-ink-3 hover:text-gold">
          Back to editor
        </Link>
      </div>
      <div className="bg-bg text-ink">
        <BlogArticle post={post} related={related} />
      </div>
    </div>
  );
}
