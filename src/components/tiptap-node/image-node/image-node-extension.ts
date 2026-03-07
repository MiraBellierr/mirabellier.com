import { mergeAttributes } from "@tiptap/core";
import { Image } from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { CaptionedImageNode } from "@/components/tiptap-node/image-node/image-node";
import "@/components/tiptap-node/image-node/image-node.scss";

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

export const CaptionedImageExtension = Image.extend({
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

  addNodeView() {
    return ReactNodeViewRenderer(CaptionedImageNode);
  },
});

export default CaptionedImageExtension;
