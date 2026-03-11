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

export const resolveAsset = (val?: string | null) => {
  if (!val) return null;
  if (val.startsWith("blob:")) return val;
  if (/^https?:\/\//.test(val)) return val;
  if (val.startsWith("/")) return `${API_BASE}${val}`;
  if (val.includes("/")) return `${API_BASE}/${val}`;
  return `${API_BASE}/images/${val}`;
};

export type UserSummary = {
  id?: string;
  username?: string;
  avatar?: string | null;
};

export type BlogComment = {
  id: string;
  text?: string;
  parentId?: string | null;
  userId?: string;
  createdAt?: string;
  children?: BlogComment[];
  user?: UserSummary | null;
};

export type Post = {
  id: string | number;
  title: string;
  userId?: string | null;
  author: string;
  authorAvatar?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  content: DocumentNode | ContentNode[] | null;
  shortDescription?: string | null;
  thumbnail?: string | null;
  tags?: string[];
  likes?: string[];
  comments?: BlogComment[];
};

function parseJsonSafely<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith("[")) {
      const parsed = parseJsonSafely<unknown[]>(trimmed, []);
      return Array.isArray(parsed)
        ? parsed.map((item) => String(item)).filter(Boolean)
        : [];
    }

    return [trimmed];
  }

  return [];
}

function normalizeCommentNode(value: unknown): BlogComment | null {
  if (!value || typeof value !== "object") return null;

  const source = value as Record<string, unknown>;
  const id = source.id ? String(source.id) : "";
  if (!id) return null;

  return {
    id,
    text: typeof source.text === "string" ? source.text : "",
    parentId:
      source.parentId === null || source.parentId === undefined
        ? null
        : String(source.parentId),
    userId: source.userId ? String(source.userId) : undefined,
    createdAt:
      typeof source.createdAt === "string" ? source.createdAt : undefined,
    user:
      source.user && typeof source.user === "object"
        ? (source.user as UserSummary)
        : null,
    children: Array.isArray(source.children)
      ? source.children
          .map((child) => normalizeCommentNode(child))
          .filter((child): child is BlogComment => child !== null)
      : [],
  };
}

export function normalizeComments(value: unknown): BlogComment[] {
  const raw =
    typeof value === "string"
      ? parseJsonSafely<unknown[]>(value, [])
      : Array.isArray(value)
        ? value
        : [];

  return raw
    .map((entry) => normalizeCommentNode(entry))
    .filter((entry): entry is BlogComment => entry !== null);
}

export function normalizePost(value: unknown): Post {
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    id: source.id ? String(source.id) : "",
    title: typeof source.title === "string" ? source.title : "Untitled",
    userId:
      source.userId === null || source.userId === undefined
        ? null
        : String(source.userId),
    author: typeof source.author === "string" ? source.author : "Unknown",
    authorAvatar:
      typeof source.authorAvatar === "string" ? source.authorAvatar : null,
    createdAt:
      typeof source.createdAt === "string"
        ? source.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof source.updatedAt === "string" ? source.updatedAt : null,
    content:
      typeof source.content === "string"
        ? parseJsonSafely(source.content, null)
        : ((source.content as Post["content"]) ?? null),
    shortDescription:
      typeof source.shortDescription === "string"
        ? source.shortDescription
        : null,
    thumbnail: typeof source.thumbnail === "string" ? source.thumbnail : null,
    tags: normalizeStringArray(source.tags),
    likes: normalizeStringArray(source.likes),
    comments: normalizeComments(source.comments),
  };
}

function cloneCommentTree(comments: BlogComment[]): BlogComment[] {
  return comments.map((comment) => ({
    ...comment,
    children: comment.children ? cloneCommentTree(comment.children) : [],
  }));
}

function insertCommentIntoTree(
  nodes: BlogComment[],
  comment: BlogComment,
): boolean {
  for (const node of nodes) {
    if (node.id === comment.parentId) {
      node.children = node.children || [];
      node.children.push(comment);
      return true;
    }

    if (node.children && node.children.length > 0) {
      const inserted = insertCommentIntoTree(node.children, comment);
      if (inserted) return true;
    }
  }

  return false;
}

export function insertNestedComment(
  comments: BlogComment[],
  comment: BlogComment,
) {
  if (!comment.parentId) return [...comments, comment];

  const cloned = cloneCommentTree(comments);
  const inserted = insertCommentIntoTree(cloned, comment);
  if (inserted) return cloned;

  return [...cloned, comment];
}

export function countNestedComments(comments: BlogComment[] = []) {
  let total = 0;

  const walk = (nodes: BlogComment[]) => {
    nodes.forEach((node) => {
      total += 1;
      if (node.children && node.children.length > 0) {
        walk(node.children);
      }
    });
  };

  walk(comments);
  return total;
}
