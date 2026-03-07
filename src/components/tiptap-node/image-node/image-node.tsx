"use client";

import * as React from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

const stopEditorEvent = (event: React.SyntheticEvent) => {
  event.stopPropagation();
};

const resolveAlignment = (
  props: Pick<NodeViewProps, "editor" | "getPos" | "node">,
) => {
  const ownAlignment =
    typeof props.node.attrs["data-align"] === "string"
      ? props.node.attrs["data-align"]
      : "";

  if (ownAlignment === "center" || ownAlignment === "right") {
    return ownAlignment;
  }

  if (typeof props.getPos !== "function") {
    return "";
  }

  try {
    const pos = props.getPos();
    if (typeof pos !== "number") {
      return "";
    }

    const resolved = props.editor.state.doc.resolve(pos);
    const parentAlign =
      typeof resolved.parent.attrs?.textAlign === "string"
        ? resolved.parent.attrs.textAlign
        : "";

    return parentAlign === "center" || parentAlign === "right"
      ? parentAlign
      : "";
  } catch {
    return "";
  }
};

export const CaptionedImageNode = ({
  node,
  editor,
  getPos,
  updateAttributes,
  selected,
}: NodeViewProps) => {
  const isEditable = editor.isEditable;
  const alignment = resolveAlignment({ node, editor, getPos });
  const caption =
    typeof node.attrs.caption === "string" ? node.attrs.caption : "";
  const [captionInput, setCaptionInput] = React.useState(caption);

  React.useEffect(() => {
    setCaptionInput(caption);
  }, [caption]);

  const handleCaptionChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const nextCaption = event.target.value;
    setCaptionInput(nextCaption);
    updateAttributes({ caption: nextCaption.trim() ? nextCaption : null });
  };

  const imgWidth = node.attrs.width ?? undefined;
  const imgHeight = node.attrs.height ?? undefined;

  return (
    <NodeViewWrapper
      className={`tiptap-image-node${selected ? " is-selected" : ""}`}
      data-align={alignment || undefined}
    >
      <figure
        className="tiptap-image-figure"
        onClick={stopEditorEvent}
        onMouseDown={stopEditorEvent}
      >
        <img
          src={node.attrs.src}
          alt={node.attrs.alt || ""}
          title={node.attrs.title || undefined}
          width={imgWidth}
          height={imgHeight}
          loading={node.attrs.loading || "lazy"}
          fetchPriority={node.attrs.fetchpriority || undefined}
          data-align={alignment || undefined}
          className="tiptap-image-element"
        />

        {isEditable ? (
          <input
            type="text"
            value={captionInput}
            onChange={handleCaptionChange}
            placeholder="Add a caption..."
            className="tiptap-image-caption-input"
            aria-label="Image caption"
            onClick={stopEditorEvent}
            onMouseDown={stopEditorEvent}
          />
        ) : caption ? (
          <figcaption className="tiptap-image-caption">{caption}</figcaption>
        ) : null}
      </figure>
    </NodeViewWrapper>
  );
};

export default CaptionedImageNode;
