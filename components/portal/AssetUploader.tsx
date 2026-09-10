"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Loader2, UploadCloud } from "lucide-react";
import { cn } from "@/lib/cn";
import { selectCls } from "@/components/portal/ui";
import type { AssetKind } from "@/lib/onboarding-data";

export type UploadTicket = { ok: true; path: string; token: string; bucket: string } | { ok: false; error: string };

const KINDS: { value: AssetKind; label: string }[] = [
  { value: "logo", label: "Logo" },
  { value: "photo", label: "Photo" },
  { value: "brand_guide", label: "Brand guide" },
  { value: "document", label: "Document" },
  { value: "video", label: "Video" },
  { value: "other", label: "Other" },
];

const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Uploads straight from the browser to Supabase Storage using a signed upload
 * URL minted by a server action (which checks the session and scopes the path
 * to this client). Files never pass through our servers, so there is no
 * request-size ceiling to hit and nothing to buffer.
 */
export function AssetUploader({
  requestUpload,
  recordUpload,
  defaultKind = "photo",
}: {
  requestUpload: (input: { fileName: string; kind: AssetKind; size: number; type: string }) => Promise<UploadTicket>;
  recordUpload: (input: { path: string; fileName: string; kind: AssetKind; size: number; type: string }) => Promise<{ ok: boolean; error?: string }>;
  defaultKind?: AssetKind;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<AssetKind>(defaultKind);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      setError("Uploads are not configured yet. Email us the files instead.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createBrowserClient(url, key);
    const list = Array.from(files);

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      setProgress(`Uploading ${i + 1} of ${list.length}: ${file.name}`);
      if (file.size > MAX_BYTES) {
        setError(`${file.name} is over 50 MB. Send it another way or compress it.`);
        continue;
      }
      const ticket = await requestUpload({ fileName: file.name, kind, size: file.size, type: file.type });
      if (!ticket.ok) {
        setError(ticket.error);
        continue;
      }
      const { error: upErr } = await supabase.storage
        .from(ticket.bucket)
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type || undefined });
      if (upErr) {
        setError(`Could not upload ${file.name}: ${upErr.message}`);
        continue;
      }
      const rec = await recordUpload({ path: ticket.path, fileName: file.name, kind, size: file.size, type: file.type });
      if (!rec.ok) setError(rec.error || "Saved the file but could not record it. Refresh and check.");
    }

    setProgress(null);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <div className="relative">
          <select value={kind} onChange={(e) => setKind(e.target.value as AssetKind)} className={selectCls} aria-label="File type">
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <label
          className={cn(
            "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-bg-2 px-4 py-3 text-sm text-ink-2 transition-colors hover:border-gold",
            busy && "pointer-events-none opacity-60",
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4 text-gold" />}
          <span>{busy ? progress : "Tap to choose files (or drop them here)"}</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => void upload(e.target.files)}
            accept="image/*,application/pdf,.doc,.docx,.ai,.eps,.svg,.zip,video/*"
          />
        </label>
      </div>
      {error && <p className="text-sm text-signal">{error}</p>}
      <p className="text-xs text-ink-4">Up to 50 MB per file. Images, PDFs, brand files, short videos.</p>
      <noscript>
        <p className="text-sm text-signal">Uploads need JavaScript. Email files to us instead.</p>
      </noscript>
    </div>
  );
}
