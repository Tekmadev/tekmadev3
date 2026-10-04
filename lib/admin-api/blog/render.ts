import type { BlogBlock } from "@/lib/blog-data";
import { markdownToBlocks } from "@/lib/blog-markdown";

/**
 * POST /blog/render: Markdown to the blocks the app's Preview draws natively.
 * The blocks come from the website's own converter (lib/blog-markdown.ts), the
 * one a save stores, so the Preview shows exactly what will be published.
 *
 * `readingTimeMinutes` follows the app contract (docs/api-requests/blog.md
 * section 7): words in the blocks over 225 a minute, rounded up, at least 1,
 * and 0 for an empty body. Markdown syntax characters are not counted.
 */

export type RenderResult = { blocks: BlogBlock[]; readingTimeMinutes: number };

const WORDS_PER_MINUTE = 225;

/** The readable text of a block (captions, CTA labels and table cells count). */
function blockWords(block: BlogBlock): string {
  switch (block.type) {
    case "heading":
    case "paragraph":
    case "callout":
      return block.text;
    case "quote":
      return `${block.text} ${block.cite ?? ""}`;
    case "answer":
      return `${block.question ?? ""} ${block.text}`;
    case "list":
      return block.items.join(" ");
    case "image":
      return block.caption ?? "";
    case "table":
      return [block.caption ?? "", ...block.headers, ...block.rows.flat()].join(" ");
    case "code":
      return block.code;
    case "cta":
      return `${block.heading} ${block.body ?? ""} ${block.buttonLabel}`;
    case "divider":
      return "";
  }
}

/** Inline Markdown removed so `**`, backticks and link targets are not counted as words. */
function plain(text: string): string {
  return text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, " ");
}

/** A token is a word when it has a letter or a digit (Latin and accented Latin). */
const WORDLIKE = /[A-Za-z0-9\u00C0-\u024F]/;

export function countWords(blocks: BlogBlock[]): number {
  let words = 0;
  for (const block of blocks) {
    words += plain(blockWords(block))
      .split(/\s+/)
      .filter((w) => WORDLIKE.test(w)).length;
  }
  return words;
}

export function readingTimeMinutes(blocks: BlogBlock[]): number {
  const words = countWords(blocks);
  return words === 0 ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

export function renderMarkdown(markdown: string): RenderResult {
  const blocks = markdownToBlocks(markdown);
  return { blocks, readingTimeMinutes: readingTimeMinutes(blocks) };
}
