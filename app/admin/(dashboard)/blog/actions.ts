"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/admin";
import { markdownToBlocks } from "@/lib/blog-markdown";
import {
  createPost,
  updatePost,
  publishPost,
  setStatus,
  softDeletePost,
  createCategory,
  renameCategory,
  deleteCategory,
  DuplicateCategoryError,
  getPostByIdAdmin,
  slugify,
  type BlogCategory,
  type BlogFaq,
  type BlogPostInput,
  type BlogStatus,
} from "@/lib/blog-data";

// --- form parsing helpers ---

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}
function orNull(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s || null;
}
function bool(fd: FormData, name: string): boolean {
  return fd.get(name) === "on" || fd.get(name) === "true";
}
function csv(v: FormDataEntryValue | null): string[] {
  return str(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
function lines(v: FormDataEntryValue | null): string[] {
  return str(v)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}
/** FAQ textarea: one "Question :: Answer" per line. */
function parseFaqs(v: FormDataEntryValue | null): BlogFaq[] {
  return lines(v)
    .map((line) => {
      const idx = line.indexOf("::");
      if (idx === -1) return null;
      const q = line.slice(0, idx).trim();
      const a = line.slice(idx + 2).trim();
      return q && a ? { q, a } : null;
    })
    .filter((f): f is BlogFaq => f !== null);
}

function buildInput(fd: FormData): BlogPostInput {
  const title = str(fd.get("title")) || "Untitled";
  return {
    title,
    slug: str(fd.get("slug")) || slugify(title),
    status: (str(fd.get("status")) || "draft") as BlogStatus,
    meta_title: orNull(fd.get("meta_title")),
    meta_description: orNull(fd.get("meta_description")),
    excerpt: orNull(fd.get("excerpt")),
    body: markdownToBlocks(str(fd.get("body"))),
    faqs: parseFaqs(fd.get("faqs")),
    key_takeaways: lines(fd.get("key_takeaways")),
    target_query: orNull(fd.get("target_query")),
    keywords: csv(fd.get("keywords")),
    tags: csv(fd.get("tags")),
    canonical_url: orNull(fd.get("canonical_url")),
    og_image_url: orNull(fd.get("og_image_url")),
    cover_image_url: orNull(fd.get("cover_image_url")),
    cover_image_alt: orNull(fd.get("cover_image_alt")),
    author_id: orNull(fd.get("author_id")),
    category_id: orNull(fd.get("category_id")),
    featured: bool(fd, "featured"),
    noindex: bool(fd, "noindex"),
  };
}

function revalidatePost(slug?: string | null) {
  revalidatePath("/blog");
  revalidatePath("/sitemap.xml");
  if (slug) revalidatePath(`/blog/${slug}`);
  revalidatePath("/admin/blog");
}

// --- actions ---

export async function createPostAction(fd: FormData) {
  const ctx = await requireOwner();
  let id: string;
  try {
    const post = await createPost(buildInput(fd), ctx.email);
    id = post.id;
    revalidatePost(post.slug);
  } catch (err) {
    console.error("[blog] create failed", err instanceof Error ? err.message : String(err));
    redirect("/admin/blog/new?e=save");
  }
  redirect(`/admin/blog/${id}?ok=created`);
}

export async function updatePostAction(fd: FormData) {
  const ctx = await requireOwner();
  const id = str(fd.get("id"));
  if (!id) redirect("/admin/blog?e=input");

  const input = buildInput(fd);
  try {
    const post = await updatePost(id, input, ctx.email);
    // Stamp published_at the first time it goes live from the status select.
    if (input.status === "published") await publishPost(id, ctx.email);
    revalidatePost(post.slug);
  } catch (err) {
    console.error("[blog] update failed", err instanceof Error ? err.message : String(err));
    redirect(`/admin/blog/${id}?e=save`);
  }
  redirect(`/admin/blog/${id}?ok=saved`);
}

export async function publishPostAction(fd: FormData) {
  const ctx = await requireOwner();
  const id = str(fd.get("id"));
  if (!id) redirect("/admin/blog?e=input");
  const post = await getPostByIdAdmin(id);
  await publishPost(id, ctx.email);
  revalidatePost(post?.slug);
  redirect(`/admin/blog/${id}?ok=published`);
}

export async function setStatusAction(fd: FormData) {
  const ctx = await requireOwner();
  const id = str(fd.get("id"));
  const status = str(fd.get("status")) as BlogStatus;
  if (!id || !status) redirect("/admin/blog?e=input");
  const post = await getPostByIdAdmin(id);
  await setStatus(id, status, ctx.email);
  revalidatePost(post?.slug);
  redirect(`/admin/blog/${id}?ok=status`);
}

export async function deletePostAction(fd: FormData) {
  const ctx = await requireOwner();
  const id = str(fd.get("id"));
  if (!id) redirect("/admin/blog?e=input");
  const post = await getPostByIdAdmin(id);
  await softDeletePost(id, ctx.email);
  revalidatePost(post?.slug);
  redirect("/admin/blog?ok=deleted");
}

// --- categories ---

/** Category names show on the public blog (chips, cards, articles). */
function revalidateCategories() {
  revalidatePath("/blog", "layout");
  revalidatePath("/admin/blog");
}

function categoryFailure(err: unknown, what: string): "category_dup" | "category" {
  if (err instanceof DuplicateCategoryError) return "category_dup";
  console.error(`[blog] category ${what} failed`, err instanceof Error ? err.message : String(err));
  return "category";
}

export async function createCategoryAction(fd: FormData) {
  await requireOwner();
  const name = str(fd.get("name"));
  if (!name) redirect("/admin/blog?e=input");
  try {
    await createCategory({ name, slug: str(fd.get("slug")) || undefined, description: orNull(fd.get("description")) ?? undefined });
  } catch (err) {
    redirect(`/admin/blog?e=${categoryFailure(err, "create")}`);
  }
  revalidateCategories();
  redirect("/admin/blog?ok=category");
}

export async function renameCategoryAction(fd: FormData) {
  await requireOwner();
  const id = str(fd.get("id"));
  const name = str(fd.get("name"));
  if (!id || !name) redirect("/admin/blog?e=input");
  try {
    await renameCategory(id, name);
  } catch (err) {
    redirect(`/admin/blog?e=${categoryFailure(err, "rename")}`);
  }
  revalidateCategories();
  redirect("/admin/blog?ok=category_renamed");
}

export async function deleteCategoryAction(fd: FormData) {
  await requireOwner();
  const id = str(fd.get("id"));
  if (!id) redirect("/admin/blog?e=input");
  try {
    await deleteCategory(id);
  } catch (err) {
    redirect(`/admin/blog?e=${categoryFailure(err, "delete")}`);
  }
  revalidateCategories();
  redirect("/admin/blog?ok=category_deleted");
}

export type QuickCategoryResult = { ok: true; category: BlogCategory } | { ok: false; message: string };

/**
 * The editor's "+" next to the Category select. Called directly from the
 * client component, not through a form, so the half-written post around it
 * is untouched: no redirect, no page change, just the new row back.
 */
export async function quickCreateCategoryAction(rawName: string): Promise<QuickCategoryResult> {
  await requireOwner();
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name) return { ok: false, message: "Type a name first." };
  try {
    const category = await createCategory({ name });
    revalidateCategories();
    return { ok: true, category };
  } catch (err) {
    if (err instanceof DuplicateCategoryError) return { ok: false, message: err.message };
    console.error("[blog] quick category create failed", err instanceof Error ? err.message : String(err));
    return { ok: false, message: "Could not add the category. Try again." };
  }
}
