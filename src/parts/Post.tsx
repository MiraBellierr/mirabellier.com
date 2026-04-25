import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { mergeAttributes } from "@tiptap/core";
import { Image } from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TextAlign } from "@tiptap/extension-text-align";
import { Typography } from "@tiptap/extension-typography";
import { Highlight } from "@tiptap/extension-highlight";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { useEffect, useMemo, useState, memo } from "react";

type PostContent = object | string | null | undefined;
type TableExtensionsModule = typeof import("@/components/tiptap-node/table-node/table-node-extension");

const TABLE_NODE_NAMES = new Set([
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
]);

const normalizeContent = (raw: PostContent) => {
  if (!raw) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return raw;
};

const contentHasTable = (value: unknown): boolean => {
  if (!value) return false;

  if (typeof value === "string") {
    return value.toLowerCase().includes("<table");
  }

  if (Array.isArray(value)) {
    return value.some((entry) => contentHasTable(entry));
  }

  if (typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    type?: unknown;
    content?: unknown;
  };

  if (
    typeof candidate.type === "string" &&
    TABLE_NODE_NAMES.has(candidate.type)
  ) {
    return true;
  }

  return contentHasTable(candidate.content);
};

const getImageElement = (element: HTMLElement) =>
  element.tagName === "IMG"
    ? (element as HTMLImageElement)
    : element.querySelector("img");

const getImageAttribute = (element: HTMLElement, attribute: string) =>
  getImageElement(element)?.getAttribute(attribute) ?? null;

const compactAttributes = (attributes: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(attributes).filter(
      ([, value]) => value !== null && value !== undefined && value !== "",
    ),
  );

const ReadonlyCaptionedImageExtension = Image.extend({
  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => getImageAttribute(element, "src"),
      },
      alt: {
        default: null,
        parseHTML: (element) => getImageAttribute(element, "alt"),
      },
      title: {
        default: null,
        parseHTML: (element) => getImageAttribute(element, "title"),
      },
      width: {
        default: null,
        parseHTML: (element) => getImageAttribute(element, "width"),
        renderHTML: (attributes) =>
          attributes.width ? { width: attributes.width } : {},
      },
      height: {
        default: null,
        parseHTML: (element) => getImageAttribute(element, "height"),
        renderHTML: (attributes) =>
          attributes.height ? { height: attributes.height } : {},
      },
      loading: {
        default: "lazy",
        parseHTML: (element) => getImageAttribute(element, "loading"),
        renderHTML: (attributes) =>
          attributes.loading ? { loading: attributes.loading } : {},
      },
      fetchpriority: {
        default: null,
        parseHTML: (element) => getImageAttribute(element, "fetchpriority"),
        renderHTML: (attributes) =>
          attributes.fetchpriority
            ? { fetchpriority: attributes.fetchpriority }
            : {},
      },
      caption: {
        default: null,
        parseHTML: (element) => {
          if (element.tagName !== "FIGURE") {
            return null;
          }

          const caption = element.querySelector("figcaption")?.textContent;
          return caption?.trim() || null;
        },
        rendered: false,
      },
      "data-align": {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-align") ??
          getImageAttribute(element, "data-align"),
        renderHTML: (
          attributes: Record<string, unknown>,
          context?: { parent?: { attrs?: { textAlign?: string } } },
        ) => {
          const explicit =
            typeof attributes["data-align"] === "string"
              ? attributes["data-align"]
              : null;

          if (explicit === "center" || explicit === "right") {
            return { "data-align": explicit };
          }

          const parentAlign = context?.parent?.attrs?.textAlign;
          if (parentAlign === "center" || parentAlign === "right") {
            return { "data-align": parentAlign };
          }

          return {};
        },
      },
    };
  },

  parseHTML() {
    const baseTag = this.options.allowBase64
      ? "img[src]"
      : 'img[src]:not([src^="data:"])';

    return [{ tag: 'figure[data-type="captioned-image"]' }, { tag: baseTag }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = HTMLAttributes as Record<string, unknown>;
    const caption =
      typeof node.attrs.caption === "string" && node.attrs.caption.trim()
        ? node.attrs.caption.trim()
        : null;
    const alignment =
      typeof attrs["data-align"] === "string" ? attrs["data-align"] : null;

    const figureAttributes = compactAttributes({
      "data-type": "captioned-image",
      "data-align": alignment,
      class: "tiptap-rendered-image",
    });

    const imageAttributes = mergeAttributes(
      this.options.HTMLAttributes,
      compactAttributes({
        src: attrs.src,
        alt: attrs.alt,
        title: attrs.title,
        width: attrs.width,
        height: attrs.height,
        loading: attrs.loading,
        fetchpriority: attrs.fetchpriority,
        "data-align": alignment,
      }),
    );

    return [
      "figure",
      figureAttributes,
      ["img", imageAttributes],
      ...(caption
        ? [["figcaption", { class: "tiptap-rendered-image-caption" }, caption]]
        : []),
    ];
  },
});

const Post = ({ html }: { html: PostContent }) => {
  const content = useMemo(() => normalizeContent(html), [html]);
  const hasTableContent = useMemo(() => contentHasTable(content), [content]);
  const [tableExtensions, setTableExtensions] =
    useState<TableExtensionsModule | null>(null);
  const [tableSupportLoading, setTableSupportLoading] = useState(false);
  const [tableSupportError, setTableSupportError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!hasTableContent || tableExtensions) return;

    let cancelled = false;
    setTableSupportLoading(true);

    void Promise.all([
      import("@/components/tiptap-node/table-node/table-node-extension"),
      import("@/components/tiptap-node/table-node/table-node.scss"),
    ])
      .then(([module]) => {
        if (cancelled) return;
        setTableExtensions(module);
        setTableSupportError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setTableSupportError(
          "Failed to load table support for this post content.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setTableSupportLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasTableContent, tableExtensions]);

  const extensions = useMemo(
    () => {
      const baseExtensions = [
        StarterKit,
        ReadonlyCaptionedImageExtension.configure({ allowBase64: true }),
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Highlight.configure({ multicolor: true }),
        Typography,
        Superscript,
        Subscript,
      ] as any[];

      if (tableExtensions) {
        baseExtensions.push(
          tableExtensions.BlogTable,
          tableExtensions.BlogTableRow,
          tableExtensions.BlogTableCell,
          tableExtensions.BlogTableHeader,
        );
      }

      return baseExtensions;
    },
    [tableExtensions],
  );

  const editor = useEditor(
    {
      extensions,
      content,
      editable: false,
      // Optimize editor performance
      editorProps: {
        attributes: {
          class: "prose dark:prose-invert prose-blue max-w-none",
        },
      },
    },
    [content, extensions],
  );

  if (hasTableContent && tableSupportLoading) {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-600">
        Loading table support...
      </div>
    );
  }

  if (hasTableContent && tableSupportError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
        {tableSupportError}
      </div>
    );
  }

  if (!editor) return null;

  return (
    <div className="prose dark:prose-invert prose-blue max-w-none">
      <EditorContent editor={editor} />
    </div>
  );
};

// Memoize to prevent unnecessary re-renders when parent re-renders
export default memo(Post);
