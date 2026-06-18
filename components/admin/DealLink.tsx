"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copy-to-clipboard button for a startup deal link (free setup + this code). */
export function DealLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      title={url}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1 text-xs text-ink-2 transition-colors hover:border-gold/50 hover:text-gold"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
