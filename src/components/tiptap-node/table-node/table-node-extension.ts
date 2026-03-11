import {
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from "@tiptap/extension-table";

type VerticalAlign = "top" | "middle" | "bottom";

function createVerticalAlignAttribute() {
  return {
    default: null,
    parseHTML: (element: HTMLElement): VerticalAlign | null => {
      const value =
        element.getAttribute("data-vertical-align") ||
        element.style.verticalAlign ||
        null;

      if (value === "top" || value === "middle" || value === "bottom") {
        return value;
      }

      if (value === "center") {
        return "middle";
      }

      return null;
    },
    renderHTML: (attributes: { verticalAlign?: VerticalAlign | null }) => {
      if (!attributes.verticalAlign) {
        return {};
      }

      return {
        "data-vertical-align": attributes.verticalAlign,
      };
    },
  };
}

export const BlogTable = Table.configure({
  HTMLAttributes: {
    class: "blog-table",
  },
  renderWrapper: true,
  resizable: false,
});

export const BlogTableRow = TableRow;

export const BlogTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      verticalAlign: createVerticalAlignAttribute(),
    };
  },
});

export const BlogTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      verticalAlign: createVerticalAlignAttribute(),
    };
  },
});
