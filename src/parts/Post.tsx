import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Image } from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TextAlign } from "@tiptap/extension-text-align";
import { Typography } from "@tiptap/extension-typography";
import { Highlight } from "@tiptap/extension-highlight";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { HorizontalRule } from "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension";
import { ImageUploadNode } from "@/components/tiptap-node/image-upload-node/image-upload-node-extension";
import { useMemo, memo } from "react";

const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      loading: {
        default: "lazy",
        parseHTML: (element) => element.getAttribute("loading"),
        renderHTML: (attributes) => ({ loading: attributes.loading }),
      },
      fetchpriority: {
        default: null,
        parseHTML: (element) => element.getAttribute("fetchpriority"),
        renderHTML: (attributes) => {
          if (attributes.fetchpriority) {
            return { fetchpriority: attributes.fetchpriority };
          }
          return {};
        },
      },
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute("width"),
        renderHTML: (attributes) => {
          if (attributes.width) {
            return { width: attributes.width };
          }
          return {};
        },
      },
      height: {
        default: null,
        parseHTML: (element) => element.getAttribute("height"),
        renderHTML: (attributes) => {
          if (attributes.height) {
            return { height: attributes.height };
          }
          return {};
        },
      },
    };
  },
});

type PostContent = object | string | null | undefined;

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

const Post = ({ html }: { html: PostContent }) => {
  const content = useMemo(() => normalizeContent(html), [html]);

  // Memoize extensions to prevent re-creating them on every render
  const extensions = useMemo(
    () => [
      StarterKit.configure({ horizontalRule: false }),
      HorizontalRule,
      CustomImage.configure({ allowBase64: true }),
      ImageUploadNode,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Typography,
      Superscript,
      Subscript,
    ],
    [],
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
    [content],
  );

  if (!editor) return null;

  return (
    <div className="prose dark:prose-invert prose-blue max-w-none">
      <EditorContent editor={editor} />
    </div>
  );
};

// Memoize to prevent unnecessary re-renders when parent re-renders
export default memo(Post);
