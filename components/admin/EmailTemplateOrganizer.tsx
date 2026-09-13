"use client";

import { useState } from "react";
import { Copy, Check, Eye, Code2, Mail } from "lucide-react";
import type { MarketingEmailTemplate } from "@/lib/email-templates.generated";

type Tab = "preview" | "code";

export function EmailTemplateOrganizer({ templates }: { templates: MarketingEmailTemplate[] }) {
  const [activeKey, setActiveKey] = useState(templates[0]?.key ?? "");
  const [tab, setTab] = useState<Tab>("preview");
  const [copied, setCopied] = useState(false);

  const active = templates.find((t) => t.key === activeKey) ?? templates[0];

  async function copyHtml() {
    if (!active) return;
    const text = active.html;
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        done();
        return;
      }
    } catch {
      // Fall through to the legacy path below.
    }

    // Legacy fallback for older browsers / non-secure contexts.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      done();
    } catch {
      setCopied(false);
    }
  }

  if (!active) {
    return (
      <p className="text-sm text-ink-4">
        No templates found. Run the generator: node docs/email-templates/marketing/build-marketing.mjs
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[264px_1fr]">
      {/* Template list */}
      <nav aria-label="Email templates" className="flex flex-col gap-2">
        {templates.map((t) => {
          const on = t.key === active.key;
          return (
            <button
              key={t.key}
              onClick={() => {
                setActiveKey(t.key);
                setTab("preview");
                setCopied(false);
              }}
              aria-current={on ? "true" : undefined}
              className={
                "flex flex-col gap-0.5 rounded-xl border px-4 py-3 text-left transition-colors " +
                (on
                  ? "border-gold/50 bg-gold/[0.06]"
                  : "border-line-strong bg-surface hover:border-gold/30")
              }
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Mail className={"h-4 w-4 shrink-0 " + (on ? "text-gold" : "text-ink-4")} />
                {t.name}
              </span>
              <span className="pl-6 text-xs leading-snug text-ink-4">{t.useWhen}</span>
            </button>
          );
        })}
      </nav>

      {/* Detail panel */}
      <div className="min-w-0 rounded-2xl border border-line-strong bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-4 sm:p-5">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-ink">{active.name}</h2>
            <p className="mt-0.5 text-sm text-ink-3">
              <span className="text-ink-4">Subject:</span> {active.subject}
            </p>
            <p className="mt-1.5 text-xs text-ink-4">
              Campaign key{" "}
              <code className="rounded bg-bg-3 px-1.5 py-0.5 font-mono text-ink-2">{active.key}</code>{" "}
              · paste as a Custom HTML block in GHL
            </p>
          </div>
          <button
            onClick={copyHtml}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-bg transition-colors hover:bg-gold"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" /> Copy HTML
              </>
            )}
          </button>
          <span aria-live="polite" className="sr-only">
            {copied ? "Email HTML copied to clipboard" : ""}
          </span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-line px-4 pt-3 sm:px-5">
          <TabButton on={tab === "preview"} onClick={() => setTab("preview")} icon={Eye}>
            Preview
          </TabButton>
          <TabButton on={tab === "code"} onClick={() => setTab("code")} icon={Code2}>
            Code
          </TabButton>
        </div>

        <div className="p-4 sm:p-5">
          {tab === "preview" ? (
            <div className="overflow-hidden rounded-xl border border-line">
              <iframe
                key={active.key}
                title={`Preview of ${active.name}`}
                srcDoc={active.previewHtml}
                sandbox=""
                loading="lazy"
                className="h-[640px] w-full bg-white"
              />
            </div>
          ) : (
            <div className="relative">
              <button
                onClick={copyHtml}
                className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:border-gold/50 hover:text-gold"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </>
                )}
              </button>
              <pre className="max-h-[640px] overflow-auto rounded-xl bg-bg-3 p-4 pr-20 text-xs leading-relaxed text-ink-2">
                <code className="font-mono whitespace-pre">{active.html}</code>
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  on,
  onClick,
  icon: Icon,
  children,
}: {
  on: boolean;
  onClick: () => void;
  icon: typeof Eye;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={
        "inline-flex min-h-[40px] items-center gap-2 rounded-t-lg px-3 text-sm font-medium transition-colors " +
        (on ? "bg-bg-3 text-ink" : "text-ink-4 hover:text-ink-2")
      }
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}
