import { blocksToMarkdown } from "@/lib/blog-markdown";
import type { BlogAuthor, BlogCategory, BlogPostWithRefs, BlogStatus } from "@/lib/blog-data";
import { quickCreateCategoryAction } from "@/app/admin/(dashboard)/blog/actions";
import { CategoryPicker } from "@/components/admin/CategoryPicker";

const INPUT =
  "w-full rounded-xl border border-line-strong bg-bg px-3 py-2.5 text-sm text-ink outline-none focus:border-gold";

const STATUSES: { value: BlogStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm text-ink-2">
      <span className="font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-4">{hint}</span>}
    </label>
  );
}

/**
 * Post editor. Server-rendered form (same pattern as the pricing editor). The
 * `action` is the create or update server action; `post` supplies edit defaults.
 */
export function BlogForm({
  action,
  post,
  authors,
  categories,
}: {
  action: (fd: FormData) => void | Promise<void>;
  post?: BlogPostWithRefs;
  authors: BlogAuthor[];
  categories: BlogCategory[];
}) {
  const bodyMd = post ? blocksToMarkdown(post.body) : "";
  const faqsText = post ? post.faqs.map((f) => `${f.q} :: ${f.a}`).join("\n") : "";
  const takeawaysText = post ? post.key_takeaways.join("\n") : "";

  return (
    <form action={action} className="flex flex-col gap-6">
      {post && <input type="hidden" name="id" value={post.id} />}

      <div className="rounded-2xl border border-line-strong bg-surface p-5">
        <div className="flex flex-col gap-4">
          <Field label="Title">
            <input name="title" defaultValue={post?.title ?? ""} required className={INPUT} placeholder="How to never miss a lead again" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Slug" hint="URL: /blog/your-slug. Leave blank to auto-generate.">
              <input name="slug" defaultValue={post?.slug ?? ""} className={INPUT} placeholder="never-miss-a-lead" />
            </Field>
            <Field label="Status">
              <select name="status" defaultValue={post?.status ?? "draft"} className={INPUT}>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Author">
              <select name="author_id" defaultValue={post?.author_id ?? authors[0]?.id ?? ""} className={INPUT}>
                <option value="">No author</option>
                {authors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.role ? ` (${a.role})` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <CategoryPicker categories={categories} defaultValue={post?.category_id} create={quickCreateCategoryAction} />
          </div>
          <Field label="Excerpt" hint="One or two sentences. Shows on the blog list and as the meta/social description fallback.">
            <textarea name="excerpt" defaultValue={post?.excerpt ?? ""} rows={2} className={INPUT} />
          </Field>
        </div>
      </div>

      {/* Body */}
      <div className="rounded-2xl border border-line-strong bg-surface p-5">
        <div className="flex flex-col gap-4">
          <Field
            label="Body (Markdown)"
            hint="## Heading, - bullet, 1. numbered, > quote, > [!tip] callout, > [!answer] Question?, | tables |, ![alt](url), ```code```. Converted to structured blocks on save."
          >
            <textarea
              name="body"
              defaultValue={bodyMd}
              rows={20}
              className={INPUT + " font-mono text-[13px] leading-relaxed"}
              placeholder={"## The short answer\n\nEvery missed call is a missed job. Here is how to fix it.\n\n> [!tip] Reply in under 5 minutes and you are 9x more likely to book.\n\n- Answer every call, 24/7\n- Text back instantly when you miss one"}
            />
          </Field>
          <Field label="Key takeaways" hint="One per line. Shows as a summary box up top (great for AI answers and snippets).">
            <textarea name="key_takeaways" defaultValue={takeawaysText} rows={3} className={INPUT} />
          </Field>
          <Field label="FAQs" hint='One per line as "Question :: Answer". Rendered as an FAQ section with FAQ schema.'>
            <textarea name="faqs" defaultValue={faqsText} rows={3} className={INPUT} placeholder="How fast should I reply to a lead? :: Under 5 minutes if you can." />
          </Field>
        </div>
      </div>

      {/* SEO / GEO */}
      <div className="rounded-2xl border border-line-strong bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">SEO and discovery</h2>
        <div className="mt-4 flex flex-col gap-4">
          <Field label="Target question" hint="The exact question this post answers. Guides the writing and helps you track intent.">
            <input name="target_query" defaultValue={post?.target_query ?? ""} className={INPUT} placeholder="how do I stop missing customer calls" />
          </Field>
          <Field label="Meta title" hint="The SEO title tag. Falls back to the post title.">
            <input name="meta_title" defaultValue={post?.meta_title ?? ""} className={INPUT} />
          </Field>
          <Field label="Meta description" hint="Search-result snippet. Falls back to the excerpt.">
            <textarea name="meta_description" defaultValue={post?.meta_description ?? ""} rows={2} className={INPUT} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Keywords" hint="Comma separated.">
              <input name="keywords" defaultValue={post?.keywords.join(", ") ?? ""} className={INPUT} />
            </Field>
            <Field label="Tags" hint="Comma separated.">
              <input name="tags" defaultValue={post?.tags.join(", ") ?? ""} className={INPUT} />
            </Field>
          </div>
          <Field label="Canonical URL" hint="Only set if this content lives primarily elsewhere.">
            <input name="canonical_url" defaultValue={post?.canonical_url ?? ""} className={INPUT} placeholder="https://..." />
          </Field>
        </div>
      </div>

      {/* Media + flags */}
      <div className="rounded-2xl border border-line-strong bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">Media and flags</h2>
        <div className="mt-4 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cover image URL">
              <input name="cover_image_url" defaultValue={post?.cover_image_url ?? ""} className={INPUT} placeholder="https://..." />
            </Field>
            <Field label="Cover image alt text" hint="Describe the image (accessibility + SEO).">
              <input name="cover_image_alt" defaultValue={post?.cover_image_alt ?? ""} className={INPUT} />
            </Field>
          </div>
          <Field label="Social (OG) image URL" hint="Optional. Defaults to the cover image.">
            <input name="og_image_url" defaultValue={post?.og_image_url ?? ""} className={INPUT} placeholder="https://..." />
          </Field>
          <div className="flex flex-wrap gap-6 pt-1">
            <label className="flex items-center gap-2.5 text-sm text-ink-2">
              <input type="checkbox" name="featured" defaultChecked={post?.featured ?? false} className="h-4 w-4 accent-gold" />
              Featured
            </label>
            <label className="flex items-center gap-2.5 text-sm text-ink-2">
              <input type="checkbox" name="noindex" defaultChecked={post?.noindex ?? false} className="h-4 w-4 accent-gold" />
              No-index (hide from search engines)
            </label>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
        >
          {post ? "Save changes" : "Create post"}
        </button>
        <span className="text-xs text-ink-4">
          Saving keeps a version snapshot. Set status to Published to make it live.
        </span>
      </div>
    </form>
  );
}
