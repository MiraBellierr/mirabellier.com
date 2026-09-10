// Pure helpers for reading Tiptap post documents: plain-text extraction, a
// word-count reading-time estimate, and a heading list for a table of contents.
// Kept free of any `@/lib/config` import (no `import.meta.env`) so it runs under
// `node --test`.

type TextNode = {
  type: "text";
  text: string;
  marks?: Array<{
    type: string;
    attrs?: Record<string, unknown>;
  }>;
};

type ParagraphNode = {
  type: "paragraph";
  attrs?: { textAlign: string | null };
  content: ContentNode[];
};

type HeadingNode = {
  type: "heading";
  attrs?: { textAlign: string | null; level: number };
  content: ContentNode[];
};

type ListNode = {
  type: "bulletList" | "orderedList";
  content: ListItemNode[];
};

type ListItemNode = {
  type: "listItem";
  content: ContentNode[];
};

type TableNode = {
  type: "table";
  content: TableRowNode[];
};

type TableRowNode = {
  type: "tableRow";
  content: TableCellNode[];
};

type TableCellNode = {
  type: "tableCell" | "tableHeader";
  content: ContentNode[];
};

type ImageNode = {
  type: "image";
  attrs: {
    src: string;
    alt: string | null;
    title: string | null;
    caption?: string | null;
    width: number | null;
    height: number | null;
  };
};

type HardBreakNode = {
  type: "hardBreak";
};

export type DocumentNode = {
  type: "doc";
  content: ContentNode[];
};

export type ContentNode =
  | TextNode
  | ParagraphNode
  | HeadingNode
  | ListNode
  | ListItemNode
  | TableNode
  | TableRowNode
  | TableCellNode
  | ImageNode
  | HardBreakNode;

export function extractTextFromContent(
  content: DocumentNode | ContentNode[] | null | undefined,
): string {
  if (!content) return "";
  if (
    typeof content === "object" &&
    "type" in content &&
    content.type === "doc"
  ) {
    return extractTextFromContent(content.content);
  }
  if (Array.isArray(content)) {
    let result = "";

    content.forEach((node) => {
      if (!node) return;

      switch (node.type) {
        case "text":
          result += node.text + " ";
          break;

        case "paragraph":
        case "heading":
        case "listItem":
          if (node.content) {
            result += extractTextFromContent(node.content);
          }
          break;

        case "bulletList":
        case "orderedList":
          if (node.content) {
            node.content.forEach((item) => {
              result += extractTextFromContent(item.content);
            });
          }
          break;

        case "table":
        case "tableRow":
        case "tableCell":
        case "tableHeader":
          if (node.content) {
            result += `${extractTextFromContent(node.content)} `;
          }
          break;

        case "image":
          if (node.attrs?.caption) {
            result += `${node.attrs.caption} `;
          }
          break;

        case "hardBreak":
          break;

        default:
          break;
      }
    });

    return result.trim();
  }

  return "";
}

export function slugify(input?: string) {
  if (!input) return "";
  return input
    .toString()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

// ~200 wpm is the usual silent-reading estimate for prose.
const WORDS_PER_MINUTE = 200;

function wordsIn(value: unknown): number {
  return typeof value === "string"
    ? value.trim().split(/\s+/).filter(Boolean).length
    : 0;
}

function countWordsInNodes(nodes: unknown): number {
  if (!Array.isArray(nodes)) return 0;

  let total = 0;
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const candidate = node as {
      type?: unknown;
      text?: unknown;
      content?: unknown;
      attrs?: { caption?: unknown };
    };

    if (candidate.type === "text") {
      total += wordsIn(candidate.text);
      continue;
    }
    if (candidate.type === "image") {
      total += wordsIn(candidate.attrs?.caption);
      continue;
    }

    total += countWordsInNodes(candidate.content);
  }
  return total;
}

function toChildNodes(content: unknown): unknown {
  if (Array.isArray(content)) return content;
  if (
    content &&
    typeof content === "object" &&
    (content as { type?: unknown }).type === "doc"
  ) {
    return (content as { content?: unknown }).content;
  }
  return [];
}

// Counts words per text node directly rather than through
// `extractTextFromContent`, whose block joins drop the spaces between
// paragraphs and so would merge (and undercount) words across boundaries.
// Accepts `unknown` because a stored post document is loosely-shaped JSON.
export function countWords(content: unknown): number {
  return countWordsInNodes(toChildNodes(content));
}

// Whole minutes, rounded, never below 1 when there is any text at all. Returns
// 0 for empty content so callers can choose to render nothing.
export function readingTimeMinutes(content: unknown): number {
  const words = countWords(content);
  if (words === 0) return 0;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export function formatReadingTime(minutes: number): string {
  if (!minutes || minutes < 1) return "";
  return `${minutes} min read`;
}

export type TocHeading = {
  /** Slug of the heading text, unique within the document. */
  id: string;
  text: string;
  /** Heading level as authored (2, 3, …). */
  level: number;
};

type RawHeading = { text: string; level: number };

function collectHeadings(
  nodes: unknown,
  minLevel: number,
  maxLevel: number,
  out: RawHeading[],
): void {
  if (!Array.isArray(nodes)) return;

  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const candidate = node as {
      type?: unknown;
      attrs?: { level?: unknown };
      content?: unknown;
    };

    if (candidate.type === "heading") {
      const level = Number(candidate.attrs?.level ?? 1);
      if (level >= minLevel && level <= maxLevel) {
        const text = extractTextFromContent(
          candidate.content as ContentNode[] | undefined,
        )
          .replace(/\s+/g, " ")
          .trim();
        if (text) out.push({ text, level });
      }
      // Headings never contain sub-headings — don't recurse into them.
      continue;
    }

    collectHeadings(candidate.content, minLevel, maxLevel, out);
  }
}

// Headings in document order, each with a slug id that is unique within the doc
// (a repeat of the same text becomes `slug-2`, `slug-3`, …). `BlogPost` assigns
// these same ids to the rendered <h2>–<h4> elements so the TOC links resolve.
// The range is 2–4 because posts on this blog routinely use <h2> then <h4>.
export function extractHeadings(
  content: unknown,
  opts: { minLevel?: number; maxLevel?: number } = {},
): TocHeading[] {
  const minLevel = opts.minLevel ?? 2;
  const maxLevel = opts.maxLevel ?? 4;

  const raw: RawHeading[] = [];
  collectHeadings(toChildNodes(content), minLevel, maxLevel, raw);

  const seen = new Map<string, number>();
  return raw.map(({ text, level }) => {
    const base = slugify(text) || "section";
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return {
      id: count === 1 ? base : `${base}-${count}`,
      text,
      level,
    };
  });
}
