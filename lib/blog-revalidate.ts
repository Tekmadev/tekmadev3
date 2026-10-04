import { revalidatePath } from "next/cache";

/**
 * Refreshes the public pages a blog change shows on. Shared by the web
 * admin's blog actions and the admin API (app/api/admin/v1/blog), so a post
 * saved from either place updates the site the same way.
 *
 * Called after the write has succeeded, so a refresh that fails is logged and
 * never turns a saved change into an error (a retried create would otherwise
 * make a second post).
 */

function refresh(path: string, type?: "layout" | "page"): void {
  try {
    revalidatePath(path, type);
  } catch (err) {
    console.error(`[blog] revalidate ${path} failed`, err instanceof Error ? err.message : String(err));
  }
}

/** After a post write: the blog index, the sitemap, the post's own page (every slug given) and the admin list. */
export function revalidateBlogPost(...slugs: (string | null | undefined)[]): void {
  refresh("/blog");
  refresh("/sitemap.xml");
  for (const slug of new Set(slugs)) if (slug) refresh(`/blog/${slug}`);
  refresh("/admin/blog");
}

/** After a category write: category names show on every blog page (chips, cards, articles). */
export function revalidateBlogCategories(): void {
  refresh("/blog", "layout");
  refresh("/admin/blog");
}
