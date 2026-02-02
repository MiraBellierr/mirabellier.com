import { API_BASE } from "@/lib/config";

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

type ImageNode = {
  type: "image";
  attrs: {
    src: string;
    alt: string;
    title: string;
    width: number | null;
    height: number | null;
  };
};

type HardBreakNode = {
  type: "hardBreak";
};

type DocumentNode = {
  type: "doc";
  content: ContentNode[];
};

type ContentNode =
  | TextNode
  | ParagraphNode
  | HeadingNode
  | ListNode
  | ListItemNode
  | ImageNode
  | HardBreakNode;

export function extractTextFromContent(
  content: DocumentNode | ContentNode[] | undefined,
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

        case "image":
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

export const resolveAsset = (val?: string | null) => {
  if (!val) return null;
  if (val.startsWith("blob:")) return val;
  if (/^https?:\/\//.test(val)) return val;
  if (val.startsWith("/")) return `${API_BASE}${val}`;
  if (val.includes("/")) return `${API_BASE}/${val}`;
  return `${API_BASE}/images/${val}`;
};

export type Post = {
  id: string | number;
  title: string;
  author: string;
  authorAvatar?: string | null;
  createdAt: string;
  content: ContentNode[];
  shortDescription?: string | null;
  thumbnail?: string | null;
  tags?: string[];
};
