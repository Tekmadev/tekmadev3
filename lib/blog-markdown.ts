import type { BlogBlock } from "@/lib/blog-data";

/**
 * A constrained Markdown <-> blocks converter. Authors (and the AI drafter)
 * write familiar Markdown; it is stored as the structured block model in
 * lib/blog-data. We parse a documented subset into blocks and can serialize
 * blocks back to Markdown so a post loads cleanly into the editor. Anything
 * unrecognized degrades to a paragraph, so it never throws on real input.
 *
 * Supported:
 *   ## / ### / ####            headings (level 2-4; the post title is separate)
 *   paragraphs                 blank-line separated; inline **bold** *italic* `code` [text](url)
 *   - or * / 1.                unordered / ordered lists
 *   > text                     quote
 *   > [!tip|info|warning] ...   callout
 *   > [!answer] Question?       answer block (question on the marker line, body on the next > lines)
 *   ![alt](url "caption")       image
 *   | a | b |                   GitHub-style table (header + --- separator + rows)
 *   ```lang ... ```            code block
 *   --- or ***                  divider
 *   ::: cta ... :::             call-to-action (heading:, body:, button:, href:)
 */

const CALLOUT_RE = /^\[!(tip|info|warning|answer)\]\s*(.*)$/i;

export function markdownToBlocks(md: string): BlogBlock[] {
  const lines = (md ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks: BlogBlock[] = [];
  let i = 0;

  const isBlank = (s: string) => s.trim() === "";

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i++;
      continue;
    }

    // Fenced code block
    const fence = line.match(/^```(.*)$/);
    if (fence) {
      const language = fence[1].trim() || undefined;
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // closing fence
      blocks.push({ type: "code", language, code: buf.join("\n") });
      continue;
    }

    // CTA directive
    if (/^:::\s*cta\s*$/i.test(line.trim())) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ":::") {
        buf.push(lines[i]);
        i++;
      }
      i++; // closing :::
      const field = (name: string) => {
        const m = buf.find((b) => b.toLowerCase().startsWith(`${name}:`));
        return m ? m.slice(m.indexOf(":") + 1).trim() : "";
      };
      blocks.push({
        type: "cta",
        heading: field("heading") || "Ready to grow?",
        body: field("body") || undefined,
        buttonLabel: field("button") || "Book a call",
        href: field("href") || "/#book",
      });
      continue;
    }

    // Divider
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push({ type: "divider" });
      i++;
      continue;
    }

    // Heading
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = Math.min(4, Math.max(2, heading[1].length)) as 2 | 3 | 4;
      blocks.push({ type: "heading", level, text: heading[2].trim() });
      i++;
      continue;
    }

    // Image (a line that is only an image)
    const image = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
    if (image) {
      blocks.push({
        type: "image",
        alt: image[1].trim(),
        url: image[2].trim(),
        caption: image[3]?.trim() || undefined,
      });
      i++;
      continue;
    }

    // Blockquote (quote / callout / answer)
    if (/^>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      const first = quoted[0] ?? "";
      const marker = first.match(CALLOUT_RE);
      if (marker) {
        const kind = marker[1].toLowerCase();
        const rest = [marker[2], ...quoted.slice(1)].join(" ").trim();
        if (kind === "answer") {
          blocks.push({ type: "answer", question: marker[2].trim() || undefined, text: quoted.slice(1).join(" ").trim() });
        } else {
          blocks.push({ type: "callout", variant: kind as "tip" | "info" | "warning", text: rest });
        }
      } else {
        blocks.push({ type: "quote", text: quoted.join(" ").trim() });
      }
      continue;
    }

    // Table
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const headers = splitRow(line);
      i += 2; // header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && !isBlank(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    // List (grouped consecutive items)
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "").trim());
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    // Paragraph (consume until a blank line or a block starter)
    const para: string[] = [];
    while (i < lines.length && !isBlank(lines[i]) && !isBlockStart(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    if (para.length) blocks.push({ type: "paragraph", text: para.join(" ") });
  }

  return blocks;
}

function isBlockStart(line: string): boolean {
  return (
    /^(#{1,4})\s+/.test(line) ||
    /^```/.test(line) ||
    /^>\s?/.test(line) ||
    /^\s*([-*]|\d+\.)\s+/.test(line) ||
    /^(-{3,}|\*{3,})$/.test(line.trim()) ||
    /^:::\s*cta/i.test(line.trim()) ||
    /^!\[[^\]]*\]\([^)]*\)$/.test(line.trim())
  );
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

/** Serialize blocks back to Markdown for the editor textarea. */
export function blocksToMarkdown(blocks: BlogBlock[]): string {
  const out: string[] = [];
  for (const b of blocks ?? []) {
    switch (b.type) {
      case "heading":
        out.push(`${"#".repeat(b.level)} ${b.text}`);
        break;
      case "paragraph":
        out.push(b.text);
        break;
      case "list":
        out.push(b.items.map((it, n) => (b.ordered ? `${n + 1}. ${it}` : `- ${it}`)).join("\n"));
        break;
      case "quote":
        out.push(`> ${b.text}`);
        break;
      case "callout":
        out.push(`> [!${b.variant ?? "info"}] ${b.text}`);
        break;
      case "answer":
        out.push(`> [!answer] ${b.question ?? ""}\n> ${b.text}`);
        break;
      case "image":
        out.push(`![${b.alt}](${b.url}${b.caption ? ` "${b.caption}"` : ""})`);
        break;
      case "table":
        out.push(
          [
            `| ${b.headers.join(" | ")} |`,
            `| ${b.headers.map(() => "---").join(" | ")} |`,
            ...b.rows.map((r) => `| ${r.join(" | ")} |`),
          ].join("\n"),
        );
        break;
      case "code":
        out.push("```" + (b.language ?? "") + "\n" + b.code + "\n```");
        break;
      case "cta":
        out.push(
          `::: cta\nheading: ${b.heading}\n${b.body ? `body: ${b.body}\n` : ""}button: ${b.buttonLabel}\nhref: ${b.href}\n:::`,
        );
        break;
      case "divider":
        out.push("---");
        break;
    }
  }
  return out.join("\n\n");
}
