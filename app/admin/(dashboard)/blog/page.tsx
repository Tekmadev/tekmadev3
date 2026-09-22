import Link from "next/link";
import { requireOwner } from "@/lib/admin";
import { listPostsAdmin, listCategories, countPostsByCategory, type BlogStatus } from "@/lib/blog-data";
import { PageHeader, Panel, Notice, Badge, fmtDateTime } from "@/components/admin/ui";
import { ConfirmButton } from "@/components/admin/PendingButton";
import { business } from "@/config/site";
import { createCategoryAction, renameCategoryAction, deleteCategoryAction } from "./actions";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, { kind: "ok" | "err"; text: string }> = {
  created: { kind: "ok", text: "Post created." },
  saved: { kind: "ok", text: "Post saved." },
  published: { kind: "ok", text: "Post published and live." },
  status: { kind: "ok", text: "Status updated." },
  deleted: { kind: "ok", text: "Post moved to trash (soft-deleted)." },
  category: { kind: "ok", text: "Category added." },
  category_renamed: { kind: "ok", text: "Category renamed." },
  category_deleted: { kind: "ok", text: "Category deleted. Its posts are still there, now with no category." },
  category_dup: { kind: "err", text: "A category with that name already exists." },
  input: { kind: "err", text: "Missing or invalid input." },
  save: { kind: "err", text: "Could not save. Check the logs." },
};

const CATEGORY_INPUT =
  "min-w-0 flex-1 rounded-xl border border-line-strong bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-gold";
const CATEGORY_BUTTON =
  "shrink-0 rounded-full border border-line-strong px-3.5 py-2 text-sm text-ink-2 transition-colors hover:border-gold hover:text-gold";

const STATUS_TONE: Record<BlogStatus, "gold" | "neutral" | "muted"> = {
  published: "gold",
  in_review: "neutral",
  scheduled: "neutral",
  draft: "muted",
  archived: "muted",
};

export default async function BlogAdmin({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string }>;
}) {
  await requireOwner();
  const [posts, categories, postCounts] = await Promise.all([listPostsAdmin(), listCategories(), countPostsByCategory()]);
  const { ok, e } = await searchParams;
  const notice = ok ? NOTICES[ok] : e ? NOTICES[e] : null;

  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <PageHeader title="Blog" subtitle="Write, edit, and publish posts. Structured for SEO, GEO, and AEO.">
        <Link
          href="/admin/blog/new"
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
        >
          New post
        </Link>
      </PageHeader>

      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      <Panel title={`Posts (${posts.length})`}>
        {posts.length === 0 ? (
          <p className="text-sm text-ink-4">No posts yet. Create your first one.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-4">
                  <th className="py-2 pr-4 font-medium">Title</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Category</th>
                  <th className="py-2 pr-4 font-medium">Author</th>
                  <th className="py-2 pr-4 font-medium whitespace-nowrap">Updated</th>
                  <th className="py-2 pr-4 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-4 align-top">
                      <Link href={`/admin/blog/${p.id}`} className="font-medium text-ink hover:text-gold">
                        {p.title}
                      </Link>
                      {p.featured && <span className="ml-2 text-xs text-gold">Featured</span>}
                    </td>
                    <td className="py-2.5 pr-4 align-top">
                      <Badge tone={STATUS_TONE[p.status]}>{p.status.replace("_", " ")}</Badge>
                    </td>
                    <td className="py-2.5 pr-4 align-top text-ink-2">{p.category?.name ?? "-"}</td>
                    <td className="py-2.5 pr-4 align-top text-ink-2">{p.author?.name ?? "-"}</td>
                    <td className="py-2.5 pr-4 align-top whitespace-nowrap text-ink-3">{fmtDateTime(p.updated_at)}</td>
                    <td className="py-2.5 pr-4 align-top">
                      <div className="flex items-center gap-3 whitespace-nowrap">
                        <Link href={`/admin/blog/${p.id}`} className="text-ink-3 hover:text-gold">
                          Edit
                        </Link>
                        {p.status === "published" && (
                          <a
                            href={`${business.url}/blog/${p.slug}`}
                            target="_blank"
                            rel="noopener"
                            className="text-ink-3 hover:text-gold"
                          >
                            View
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title={`Categories (${categories.length})`}>
        {categories.length === 0 ? (
          <p className="mb-4 text-sm text-ink-4">No categories yet. Add one here, or with the + next to Category in the post editor.</p>
        ) : (
          <ul className="mb-5 divide-y divide-line">
            {categories.map((c) => {
              const n = postCounts[c.id] ?? 0;
              const postsLabel = n === 1 ? "1 post" : `${n} posts`;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
                  {/* Rename keeps the slug, so /blog?category=<slug> links stay valid. */}
                  <form action={renameCategoryAction} className="flex min-w-[260px] flex-1 items-center gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <input name="name" defaultValue={c.name} required maxLength={60} aria-label={`Rename ${c.name}`} className={CATEGORY_INPUT} />
                    <button type="submit" className={CATEGORY_BUTTON}>
                      Rename
                    </button>
                  </form>
                  <span className="text-xs text-ink-4">
                    /blog?category={c.slug} · {postsLabel}
                  </span>
                  <form action={deleteCategoryAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <ConfirmButton
                      message={
                        n > 0
                          ? `Delete "${c.name}"? ${postsLabel} will keep everything but lose the category.`
                          : `Delete "${c.name}"?`
                      }
                      className="rounded-full border border-signal/40 px-3.5 py-2 text-sm text-signal transition-colors hover:bg-signal/[0.06] disabled:opacity-60"
                    >
                      Delete
                    </ConfirmButton>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
        <form action={createCategoryAction} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-sm text-ink-2">
            <span className="font-medium text-ink">New category</span>
            <input
              name="name"
              required
              maxLength={60}
              placeholder="AI Automation"
              className="rounded-xl border border-line-strong bg-bg px-3 py-2.5 text-sm text-ink outline-none focus:border-gold"
            />
          </label>
          <button
            type="submit"
            className="rounded-full border border-line-strong px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-gold"
          >
            Add
          </button>
        </form>
      </Panel>
    </div>
  );
}
