import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/admin";
import { getPostByIdAdmin, listAuthors, listCategories } from "@/lib/blog-data";
import { PageHeader, Notice, Badge } from "@/components/admin/ui";
import { BlogForm } from "@/components/admin/BlogForm";
import { business } from "@/config/site";
import { updatePostAction, publishPostAction, setStatusAction, deletePostAction } from "../actions";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, { kind: "ok" | "err"; text: string }> = {
  created: { kind: "ok", text: "Post created. Keep editing, then publish when ready." },
  saved: { kind: "ok", text: "Saved. A version snapshot was recorded." },
  published: { kind: "ok", text: "Published and live on the site." },
  status: { kind: "ok", text: "Status updated." },
  save: { kind: "err", text: "Could not save. Check the logs." },
};

export default async function EditPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; e?: string }>;
}) {
  await requireOwner();
  const { id } = await params;
  const [post, authors, categories] = await Promise.all([
    getPostByIdAdmin(id),
    listAuthors(),
    listCategories(),
  ]);
  if (!post || post.deleted_at) notFound();

  const { ok, e } = await searchParams;
  const notice = ok ? NOTICES[ok] : e ? NOTICES[e] : null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="Edit post" subtitle={post.title}>
        <Link href="/admin/blog" className="text-sm text-ink-3 hover:text-gold">
          Back to posts
        </Link>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={post.status === "published" ? "gold" : "muted"}>{post.status.replace("_", " ")}</Badge>
        <Link href={`/admin/blog/${post.id}/preview`} className="text-sm text-ink-3 hover:text-gold">
          Preview
        </Link>
        {post.status === "published" && (
          <a href={`${business.url}/blog/${post.slug}`} target="_blank" rel="noopener" className="text-sm text-ink-3 hover:text-gold">
            View live
          </a>
        )}
      </div>

      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      {/* Quick status actions */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-bg-2 p-3">
        {post.status !== "published" ? (
          <form action={publishPostAction}>
            <input type="hidden" name="id" value={post.id} />
            <button className="rounded-full bg-gold px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90">
              Publish
            </button>
          </form>
        ) : (
          <form action={setStatusAction}>
            <input type="hidden" name="id" value={post.id} />
            <input type="hidden" name="status" value="draft" />
            <button className="rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-gold">
              Unpublish
            </button>
          </form>
        )}
        <form action={setStatusAction}>
          <input type="hidden" name="id" value={post.id} />
          <input type="hidden" name="status" value="archived" />
          <button className="rounded-full border border-line-strong px-4 py-2 text-sm text-ink-2 transition-colors hover:border-gold">
            Archive
          </button>
        </form>
        <form action={deletePostAction} className="ml-auto">
          <input type="hidden" name="id" value={post.id} />
          <button className="rounded-full border border-signal/40 px-4 py-2 text-sm text-signal transition-colors hover:bg-signal/[0.06]">
            Move to trash
          </button>
        </form>
      </div>

      <BlogForm action={updatePostAction} post={post} authors={authors} categories={categories} />
    </div>
  );
}
