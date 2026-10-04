import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createCategory, deleteCategory, DuplicateCategoryError, renameCategory, slugify } from "@/lib/blog-data";
import { revalidateBlogCategories } from "@/lib/blog-revalidate";
import { dbError } from "../data";
import { ApiError, badRequest, conflict, notFound } from "../errors";
import { apiCategory, getCategoryRow, listCategoryRows, toApiCategory, type CategoryRow } from "./data";
import { bodyObject } from "./posts";
import { BLOG_COPY, CATEGORY_NAME_MAX, type ApiCategory } from "./shape";

/**
 * Category writes for the admin API. Names are trimmed with inner whitespace
 * collapsed, up to 60 characters, unique case-insensitively. The slug is made
 * from the name at creation (-2, -3... when taken) and never changes on
 * rename. The writes are the website's (lib/blog-data.ts).
 */

const duplicate = () => conflict("category_dup", BLOG_COPY.categoryDup, { name: BLOG_COPY.categoryDup });
const missing = () => notFound(BLOG_COPY.categoryMissing);

/** The `name` of a category body, cleaned, or the 400. */
function readName(raw: unknown): string {
  const parsed = z.string().safeParse(bodyObject(raw).name);
  const name = parsed.success ? parsed.data.trim().replace(/\s+/g, " ") : "";
  if (!name) throw badRequest("name", BLOG_COPY.categoryName, { name: BLOG_COPY.categoryName });
  if (name.length > CATEGORY_NAME_MAX) {
    const message = BLOG_COPY.categoryTooLong(CATEGORY_NAME_MAX);
    throw badRequest("name", message, { name: message });
  }
  return name;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function writeFailure(what: string, err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof DuplicateCategoryError) return duplicate();
  const e = err && typeof err === "object" ? (err as { code?: unknown; message?: unknown }) : {};
  return dbError(what, { code: typeof e.code === "string" ? e.code : undefined, message: typeof e.message === "string" ? e.message : String(err) });
}

/** POST /blog/categories { name }: 201 with the category (no posts yet). */
export async function createCategoryFromApi(db: SupabaseClient, raw: unknown): Promise<ApiCategory> {
  const name = readName(raw);
  const existing = await listCategoryRows(db);
  if (existing.some((c) => sameName(c.name, name))) throw duplicate();
  const taken = new Set(existing.map((c) => c.slug));
  const base = slugify(name) || "category";
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;

  let row: CategoryRow;
  try {
    const created = await createCategory({ name, slug });
    row = { id: created.id, name: created.name, slug: created.slug };
  } catch (err) {
    throw writeFailure("blog category create", err);
  }
  revalidateBlogCategories();
  return toApiCategory(row, 0);
}

/** PATCH /blog/categories/:id { name }: rename only, the slug stays. */
export async function renameCategoryFromApi(db: SupabaseClient, id: string, raw: unknown): Promise<ApiCategory> {
  const current = await getCategoryRow(db, id);
  if (!current) throw missing();
  const name = readName(raw);
  const others = await listCategoryRows(db);
  if (others.some((c) => c.id !== current.id && sameName(c.name, name))) throw duplicate();

  let row: CategoryRow;
  try {
    const renamed = await renameCategory(current.id, name);
    row = { id: renamed.id, name: renamed.name, slug: renamed.slug };
  } catch (err) {
    throw writeFailure("blog category rename", err);
  }
  revalidateBlogCategories();
  return apiCategory(db, row);
}

/** DELETE /blog/categories/:id: its posts (the trash included) keep everything but the category. */
export async function deleteCategoryFromApi(db: SupabaseClient, id: string): Promise<null> {
  const current = await getCategoryRow(db, id);
  if (!current) throw missing();
  try {
    await deleteCategory(current.id);
  } catch (err) {
    throw writeFailure("blog category delete", err);
  }
  revalidateBlogCategories();
  return null;
}
