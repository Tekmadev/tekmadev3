import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { ArrowRight, Info, Lightbulb, TriangleAlert } from "lucide-react";
import type { BlogBlock } from "@/lib/blog-data";

/**
 * Renders the structured block model (lib/blog-data BlogBlock[]) to semantic
 * HTML with the site's typography. Inline **bold**, *italic*, `code` and
 * [links](url) inside text are parsed to React nodes (no raw HTML injected).
 */
export function PostBody({ blocks }: { blocks: BlogBlock[] }) {
  return (
    <div className="mt-12 flex flex-col gap-7">
      {(blocks ?? []).map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}

function Block({ block }: { block: BlogBlock }) {
  switch (block.type) {
    case "heading": {
      const cls =
        block.level === 2
          ? "display-m mt-6 text-2xl text-ink sm:text-3xl"
          : block.level === 3
            ? "mt-4 text-xl font-semibold text-ink sm:text-2xl"
            : "mt-2 text-lg font-semibold text-ink";
      if (block.level === 2) return <h2 className={cls}>{inline(block.text)}</h2>;
      if (block.level === 3) return <h3 className={cls}>{inline(block.text)}</h3>;
      return <h4 className={cls}>{inline(block.text)}</h4>;
    }

    case "paragraph":
      return <p className="text-base leading-relaxed text-ink-2 sm:text-lg">{inline(block.text)}</p>;

    case "list":
      return block.ordered ? (
        <ol className="flex list-decimal flex-col gap-2.5 pl-5 text-base leading-relaxed text-ink-2 marker:text-ink-4">
          {block.items.map((it, k) => (
            <li key={k}>{inline(it)}</li>
          ))}
        </ol>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {block.items.map((it, k) => (
            <li key={k} className="flex gap-3 text-base leading-relaxed text-ink-2">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
              <span>{inline(it)}</span>
            </li>
          ))}
        </ul>
      );

    case "answer":
      return (
        <div className="rounded-2xl border border-line bg-bg-2 p-6 sm:p-7">
          {block.question && <p className="eyebrow">{block.question}</p>}
          <p className="mt-3 border-l-2 border-gold pl-4 text-base font-medium leading-relaxed text-ink sm:text-lg">
            {inline(block.text)}
          </p>
        </div>
      );

    case "callout": {
      const Icon =
        block.variant === "tip" ? Lightbulb : block.variant === "warning" ? TriangleAlert : Info;
      return (
        <div className="flex gap-3 rounded-2xl border border-line bg-surface p-5 text-base leading-relaxed text-ink-2">
          <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
          <p>{inline(block.text)}</p>
        </div>
      );
    }

    case "quote":
      return (
        <blockquote className="border-l-2 border-line-strong pl-5 text-lg italic leading-relaxed text-ink-2">
          {inline(block.text)}
          {block.cite && <cite className="mt-2 block text-sm not-italic text-ink-4">{block.cite}</cite>}
        </blockquote>
      );

    case "image":
      return (
        <figure className="flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.url}
            alt={block.alt}
            loading="lazy"
            className="w-full rounded-2xl border border-line"
          />
          {block.caption && (
            <figcaption className="text-center text-xs text-ink-4">{block.caption}</figcaption>
          )}
        </figure>
      );

    case "table":
      return (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full border-collapse text-left text-sm">
            {block.caption && (
              <caption className="px-4 pt-4 text-left text-xs text-ink-4">{block.caption}</caption>
            )}
            <thead>
              <tr className="border-b border-line">
                {block.headers.map((h, k) => (
                  <th key={k} className="px-4 py-3 font-semibold text-ink">
                    {inline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-b border-line-soft last:border-0">
                  {row.map((cell, c) => (
                    <td key={c} className="px-4 py-3 align-top text-ink-2">
                      {inline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "code":
      return (
        <pre className="overflow-x-auto rounded-2xl border border-line bg-bg-2 p-5 text-sm text-ink-2">
          <code>{block.code}</code>
        </pre>
      );

    case "cta":
      return (
        <div className="overflow-hidden rounded-3xl border border-line-strong bg-surface p-8 sm:p-10">
          <h2 className="display-m text-2xl text-ink sm:text-3xl">{block.heading}</h2>
          {block.body && <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-2">{block.body}</p>}
          <a
            href={block.href}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
          >
            {block.buttonLabel}
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      );

    case "divider":
      return <hr className="border-line" />;

    default:
      return null;
  }
}

// --- Inline markdown: **bold** *italic* `code` [text](url) ---

const INLINE_RE =
  /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g;

export function inline(text: string): ReactNode {
  if (!text) return null;
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  INLINE_RE.lastIndex = 0;

  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>);

    if (m[2] || m[3]) nodes.push(<strong key={key++}>{m[2] ?? m[3]}</strong>);
    else if (m[4] || m[5]) nodes.push(<em key={key++}>{m[4] ?? m[5]}</em>);
    else if (m[6])
      nodes.push(
        <code key={key++} className="rounded bg-bg-2 px-1.5 py-0.5 text-[0.9em] text-ink">
          {m[6]}
        </code>,
      );
    else if (m[7] && m[8]) nodes.push(<InlineLink key={key++} href={m[8]} label={m[7]} />);

    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return nodes;
}

function InlineLink({ href, label }: { href: string; label: string }) {
  const external = /^https?:\/\//i.test(href);
  const cls = "text-ink underline decoration-line-strong underline-offset-2 transition-colors hover:text-gold hover:decoration-gold";
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener" className={cls}>
        {label}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {label}
    </Link>
  );
}
