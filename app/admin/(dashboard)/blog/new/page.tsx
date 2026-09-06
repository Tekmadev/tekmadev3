import Link from "next/link";
import { requireOwner } from "@/lib/admin";
import { listAuthors, listCategories } from "@/lib/blog-data";
import { PageHeader, Notice } from "@/components/admin/ui";
import { BlogForm } from "@/components/admin/BlogForm";
import { createPostAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewPostPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  await requireOwner();
  const [authors, categories] = await Promise.all([listAuthors(), listCategories()]);
  const { e } = await searchParams;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="New post" subtitle="Draft it, preview it, then publish when it is ready.">
        <Link href="/admin/blog" className="text-sm text-ink-3 hover:text-gold">
          Back to posts
        </Link>
      </PageHeader>

      {e === "save" && <Notice kind="err">Could not save the post. Check the logs and try again.</Notice>}

      <BlogForm action={createPostAction} authors={authors} categories={categories} />
    </div>
  );
}
