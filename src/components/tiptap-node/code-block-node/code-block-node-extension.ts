import { ReactNodeViewRenderer } from "@tiptap/react";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { lowlight } from "@/lib/code-block-languages";
import { CodeBlockNode } from "@/components/tiptap-node/code-block-node/code-block-node";
import "@/components/tiptap-node/code-block-node/code-block-node.scss";

export const CodeBlockNodeExtension = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNode);
  },
}).configure({
  lowlight,
  defaultLanguage: null,
  enableTabIndentation: true,
  tabSize: 2,
  HTMLAttributes: {
    class: "tiptap-code-block-root",
  },
});

export default CodeBlockNodeExtension;
