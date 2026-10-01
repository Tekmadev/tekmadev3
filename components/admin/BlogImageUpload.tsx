"use client";

import { useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { ImagePlus, UploadCloud, X } from "lucide-react";
import { BlackHole } from "@/components/BlackHole";
import type { BlogMediaTicket } from "@/lib/blog-media";

type RequestUpload = (input: { fileName: string; size: number; type: string }) => Promise<BlogMediaTicket>;

const ACCEPT = "image/png,image/jpeg,image/webp,image/avif,image/gif";

/**
 * Sends one image straight from the browser to the public blog-media bucket:
 * the server action checks the owner and the file, then hands back a one-time
 * signed upload URL (lib/blog-media.ts). Resolves to the public URL.
 */
async function uploadBlogImage(file: File, requestUpload: RequestUpload): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Uploads are not configured.");
  const ticket = await requestUpload({ fileName: file.name, size: file.size, type: file.type });
  if (!ticket.ok) throw new Error(ticket.error);
  const { error } = await createBrowserClient(url, key)
    .storage.from(ticket.bucket)
    .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return ticket.publicUrl;
}

/**
 * A URL field with an Upload button: choose or drop an image, it lands in
 * Storage, and its public URL fills the field (still editable by hand, so a
 * pasted link keeps working). Shows a preview of whatever the field holds.
 */
export function BlogImageField({
  name,
  label,
  hint,
  defaultValue,
  inputClassName,
  requestUpload,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string | null;
  inputClassName: string;
  requestUpload: RequestUpload;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handle(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      setValue(await uploadBlogImage(file, requestUpload));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div
      className="flex flex-col gap-1.5 text-sm text-ink-2"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void handle(e.dataTransfer.files?.[0]);
      }}
    >
      <label htmlFor={`blog-media-${name}`} className="font-medium text-ink">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={`blog-media-${name}`}
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={inputClassName + (over ? " border-gold" : "")}
          placeholder="Upload an image, or paste a link"
        />
        <label
          className={
            "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-line-strong px-3 text-sm text-ink-2 transition-colors hover:border-gold hover:text-gold" +
            (busy ? " pointer-events-none opacity-70" : "")
          }
        >
          {busy ? <BlackHole /> : <UploadCloud className="h-4 w-4" />}
          {busy ? "Uploading" : "Upload"}
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => void handle(e.target.files?.[0])}
          />
        </label>
      </div>
      {value && (
        <div className="relative mt-1 w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-24 max-w-[240px] rounded-lg border border-line object-cover" />
          <button
            type="button"
            onClick={() => setValue("")}
            aria-label="Remove image"
            className="absolute -right-2 -top-2 rounded-full border border-line-strong bg-surface p-1 text-ink-3 transition-colors hover:text-signal"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      {error && <span className="text-xs text-signal">{error}</span>}
      {hint && <span className="text-xs text-ink-4">{hint}</span>}
    </div>
  );
}

/**
 * "Insert image" for the Markdown body: uploads, then writes
 * `![Describe the image](url)` on its own line at the cursor in the textarea
 * with id `targetId`, and selects the placeholder so the alt text can be typed
 * straight away.
 */
export function BlogBodyImageButton({ targetId, requestUpload }: { targetId: string; requestUpload: RequestUpload }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handle(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const url = await uploadBlogImage(file, requestUpload);
      const area = document.getElementById(targetId) as HTMLTextAreaElement | null;
      if (!area) return;
      const alt = "Describe the image";
      const at = area.selectionStart ?? area.value.length;
      const before = area.value.slice(0, at);
      const lead = before === "" ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
      const snippet = `${lead}![${alt}](${url})\n\n`;
      area.setRangeText(snippet, at, area.selectionEnd ?? at, "end");
      const altStart = at + lead.length + 2;
      area.focus();
      area.setSelectionRange(altStart, altStart + alt.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <span className="inline-flex items-center gap-3">
      <label
        className={
          "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line-strong px-3 py-1 text-xs text-ink-2 transition-colors hover:border-gold hover:text-gold" +
          (busy ? " pointer-events-none opacity-70" : "")
        }
      >
        {busy ? <BlackHole /> : <ImagePlus className="h-3.5 w-3.5" />}
        {busy ? "Uploading" : "Insert image"}
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => void handle(e.target.files?.[0])}
        />
      </label>
      {error && <span className="text-xs text-signal">{error}</span>}
    </span>
  );
}
