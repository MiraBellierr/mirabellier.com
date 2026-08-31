import * as React from "react";
import { type Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useTiptapEditor } from "@/hooks/use-tiptap-editor";
import { ChevronDownIcon } from "@/components/tiptap-icons/chevron-down-icon";
import { TableIcon } from "@/components/tiptap-icons/table-icon";
import type { ButtonProps } from "@/components/tiptap-ui-primitive/button";
import { Button, ButtonGroup } from "@/components/tiptap-ui-primitive/button";
import {
  Card,
  CardBody,
  CardGroupLabel,
  CardItemGroup,
} from "@/components/tiptap-ui-primitive/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/tiptap-ui-primitive/dropdown-menu";
import { Input, InputGroup } from "@/components/tiptap-ui-primitive/input";
import { isExtensionAvailable } from "@/lib/tiptap-utils";

export interface TableDropdownMenuProps extends Omit<ButtonProps, "type"> {
  editor?: Editor | null;
  onOpenChange?: (isOpen: boolean) => void;
  portal?: boolean;
}

type TableAction = {
  id: string;
  label: string;
  requiresTable?: boolean;
  canRun: (editor: Editor, tableState: TableState | null) => boolean;
  run: (editor: Editor) => boolean;
};

type TableActionSection = {
  id: string;
  label: string;
  requiresTable?: boolean;
  actions: TableAction[];
};

type TableState = {
  rows: number;
  columns: number;
};

type VerticalAlign = "top" | "middle" | "bottom";

const DEFAULT_ROW_COUNT = 3;
const DEFAULT_COLUMN_COUNT = 3;
const MAX_ROW_COUNT = 20;
const MAX_COLUMN_COUNT = 5;

const defaultInsertTableOptions = {
  rows: DEFAULT_ROW_COUNT,
  cols: DEFAULT_COLUMN_COUNT,
  withHeaderRow: true,
} as const;

function clampDimension(value: number, max: number): number {
  return Math.min(Math.max(value, 1), max);
}

function parseDimension(
  value: string,
  fallback: number,
  max: number,
): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return clampDimension(parsed, max);
}

function getColumnCount(rowNode: ProseMirrorNode): number {
  let columnCount = 0;

  rowNode.forEach((cellNode) => {
    columnCount += Number(cellNode.attrs?.colspan ?? 1);
  });

  return columnCount;
}

function getSelectedTableState(
  editorState: Editor["state"] | undefined,
): TableState | null {
  if (!editorState) {
    return null;
  }

  const { $anchor } = editorState.selection;

  for (let depth = $anchor.depth; depth > 0; depth -= 1) {
    const node = $anchor.node(depth);

    if (node.type.name !== "table") {
      continue;
    }

    let columns = 0;
    node.forEach((rowNode) => {
      columns = Math.max(columns, getColumnCount(rowNode));
    });

    return {
      rows: node.childCount,
      columns,
    };
  }

  return null;
}

function getCurrentCellVerticalAlign(
  editorState: Editor["state"] | undefined,
): VerticalAlign | null {
  if (!editorState) {
    return null;
  }

  const { $anchor } = editorState.selection;

  for (let depth = $anchor.depth; depth > 0; depth -= 1) {
    const node = $anchor.node(depth);

    if (!["tableCell", "tableHeader"].includes(node.type.name)) {
      continue;
    }

    const value = node.attrs?.verticalAlign;
    if (value === "top" || value === "middle" || value === "bottom") {
      return value;
    }

    return null;
  }

  return null;
}

function getTableSections(tableState: TableState | null): TableActionSection[] {
  return [
    {
      id: "rows",
      label: tableState
        ? `Rows (${tableState.rows}/${MAX_ROW_COUNT})`
        : "Rows",
      requiresTable: true,
      actions: [
        {
          id: "addRowBefore",
          label: "Add row above",
          requiresTable: true,
          canRun: (editor, currentTableState) =>
            !!currentTableState &&
            currentTableState.rows < MAX_ROW_COUNT &&
            editor.can().addRowBefore(),
          run: (editor) => editor.chain().focus().addRowBefore().run(),
        },
        {
          id: "addRowAfter",
          label: "Add row below",
          requiresTable: true,
          canRun: (editor, currentTableState) =>
            !!currentTableState &&
            currentTableState.rows < MAX_ROW_COUNT &&
            editor.can().addRowAfter(),
          run: (editor) => editor.chain().focus().addRowAfter().run(),
        },
        {
          id: "deleteRow",
          label: "Delete row",
          requiresTable: true,
          canRun: (editor) => editor.can().deleteRow(),
          run: (editor) => editor.chain().focus().deleteRow().run(),
        },
      ],
    },
    {
      id: "columns",
      label: tableState
        ? `Columns (${tableState.columns}/${MAX_COLUMN_COUNT})`
        : "Columns",
      requiresTable: true,
      actions: [
        {
          id: "addColumnBefore",
          label: "Add column left",
          requiresTable: true,
          canRun: (editor, currentTableState) =>
            !!currentTableState &&
            currentTableState.columns < MAX_COLUMN_COUNT &&
            editor.can().addColumnBefore(),
          run: (editor) => editor.chain().focus().addColumnBefore().run(),
        },
        {
          id: "addColumnAfter",
          label: "Add column right",
          requiresTable: true,
          canRun: (editor, currentTableState) =>
            !!currentTableState &&
            currentTableState.columns < MAX_COLUMN_COUNT &&
            editor.can().addColumnAfter(),
          run: (editor) => editor.chain().focus().addColumnAfter().run(),
        },
        {
          id: "deleteColumn",
          label: "Delete column",
          requiresTable: true,
          canRun: (editor) => editor.can().deleteColumn(),
          run: (editor) => editor.chain().focus().deleteColumn().run(),
        },
      ],
    },
    {
      id: "headers",
      label: "Headers",
      requiresTable: true,
      actions: [
        {
          id: "toggleHeaderRow",
          label: "Toggle header row",
          requiresTable: true,
          canRun: (editor) => editor.can().toggleHeaderRow(),
          run: (editor) => editor.chain().focus().toggleHeaderRow().run(),
        },
        {
          id: "toggleHeaderColumn",
          label: "Toggle header column",
          requiresTable: true,
          canRun: (editor) => editor.can().toggleHeaderColumn(),
          run: (editor) => editor.chain().focus().toggleHeaderColumn().run(),
        },
      ],
    },
    {
      id: "cells",
      label: "Cells",
      requiresTable: true,
      actions: [
        {
          id: "mergeOrSplit",
          label: "Merge or split cells",
          requiresTable: true,
          canRun: (editor) => editor.can().mergeOrSplit(),
          run: (editor) => editor.chain().focus().mergeOrSplit().run(),
        },
        {
          id: "deleteTable",
          label: "Delete table",
          requiresTable: true,
          canRun: (editor) => editor.can().deleteTable(),
          run: (editor) => editor.chain().focus().deleteTable().run(),
        },
      ],
    },
  ];
}

export function TableDropdownMenu({
  editor: providedEditor,
  onOpenChange,
  portal = false,
  ...props
}: TableDropdownMenuProps) {
  const { editor, editorState } = useTiptapEditor(providedEditor);
  const [isOpen, setIsOpen] = React.useState(false);
  const [rowValue, setRowValue] = React.useState(String(DEFAULT_ROW_COUNT));
  const [columnValue, setColumnValue] = React.useState(
    String(DEFAULT_COLUMN_COUNT),
  );

  const rowCount = React.useMemo(
    () => parseDimension(rowValue, DEFAULT_ROW_COUNT, MAX_ROW_COUNT),
    [rowValue],
  );
  const columnCount = React.useMemo(
    () => parseDimension(columnValue, DEFAULT_COLUMN_COUNT, MAX_COLUMN_COUNT),
    [columnValue],
  );
  const tableState = React.useMemo(
    () => getSelectedTableState(editorState),
    [editorState],
  );
  const currentVerticalAlign = React.useMemo(
    () => getCurrentCellVerticalAlign(editorState),
    [editorState],
  );
  const tableSections = React.useMemo(
    () => getTableSections(tableState),
    [tableState],
  );
  const insertTableOptions = React.useMemo(
    () =>
      ({
        rows: rowCount,
        cols: columnCount,
        withHeaderRow: true,
      }) as const,
    [columnCount, rowCount],
  );

  const hasTableExtension =
    !!editor &&
    editor.isEditable &&
    isExtensionAvailable(editor, [
      "table",
      "tableRow",
      "tableCell",
      "tableHeader",
    ]);

  const isTableActive = !!editor && editor.isEditable && editor.isActive("table");
  const canOpen =
    !!editor &&
    editor.isEditable &&
    (isTableActive || editor.can().insertTable(defaultInsertTableOptions));
  const canInsertTable =
    !!editor && editor.isEditable && editor.can().insertTable(insertTableOptions);

  const visibleSections = React.useMemo(
    () =>
      tableSections.filter(
        (section) => !section.requiresTable || isTableActive,
      ),
    [isTableActive, tableSections],
  );

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      setIsOpen(open);
      onOpenChange?.(open);
    },
    [onOpenChange],
  );

  const handleDimensionChange = React.useCallback(
    (
      setter: React.Dispatch<React.SetStateAction<string>>,
      max: number,
      nextValue: string,
    ) => {
      const digitsOnly = nextValue.replace(/\D/g, "");

      if (!digitsOnly) {
        setter("");
        return;
      }

      setter(String(clampDimension(Number.parseInt(digitsOnly, 10), max)));
    },
    [],
  );

  const handleDimensionBlur = React.useCallback(
    (
      setter: React.Dispatch<React.SetStateAction<string>>,
      fallback: number,
      max: number,
      currentValue: string,
    ) => {
      setter(String(parseDimension(currentValue, fallback, max)));
    },
    [],
  );

  const handleInsertTable = React.useCallback(() => {
    if (!editor || !canInsertTable) {
      return;
    }

    const inserted = editor.chain().focus().insertTable(insertTableOptions).run();
    if (inserted) {
      setIsOpen(false);
    }
  }, [canInsertTable, editor, insertTableOptions]);

  if (!editor || !editor.isEditable || !hasTableExtension) {
    return null;
  }

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            data-style="ghost"
            data-active-state={isTableActive ? "on" : "off"}
            role="button"
            tabIndex={-1}
            disabled={!canOpen}
            data-disabled={!canOpen}
            aria-label="Table options"
            tooltip="Table"
            {...props}
          >
            <TableIcon className="tiptap-button-icon" />
            <ChevronDownIcon className="tiptap-button-dropdown-small" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" portal={portal}>
          <Card>
            <CardBody className="flex min-w-[13rem] flex-col gap-3">
              <CardItemGroup className="gap-2">
                <CardGroupLabel>Insert</CardGroupLabel>
                <div className="grid grid-cols-2 gap-2 px-2">
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                    <span>Columns</span>
                    <InputGroup>
                      <Input
                        type="number"
                        min={1}
                        max={MAX_COLUMN_COUNT}
                        inputMode="numeric"
                        value={columnValue}
                        onChange={(event) =>
                          handleDimensionChange(
                            setColumnValue,
                            MAX_COLUMN_COUNT,
                            event.target.value,
                          )
                        }
                        onBlur={() =>
                          handleDimensionBlur(
                            setColumnValue,
                            DEFAULT_COLUMN_COUNT,
                            MAX_COLUMN_COUNT,
                            columnValue,
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleInsertTable();
                          }
                        }}
                        className="rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                      />
                    </InputGroup>
                  </label>

                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                    <span>Rows</span>
                    <InputGroup>
                      <Input
                        type="number"
                        min={1}
                        max={MAX_ROW_COUNT}
                        inputMode="numeric"
                        value={rowValue}
                        onChange={(event) =>
                          handleDimensionChange(
                            setRowValue,
                            MAX_ROW_COUNT,
                            event.target.value,
                          )
                        }
                        onBlur={() =>
                          handleDimensionBlur(
                            setRowValue,
                            DEFAULT_ROW_COUNT,
                            MAX_ROW_COUNT,
                            rowValue,
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleInsertTable();
                          }
                        }}
                        className="rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                      />
                    </InputGroup>
                  </label>
                </div>

                <ButtonGroup orientation="vertical">
                  <Button
                    type="button"
                    showTooltip={false}
                    disabled={!canInsertTable}
                    onClick={handleInsertTable}
                    className="min-w-[12rem] justify-start"
                  >
                    <span className="tiptap-button-text">
                      Insert {columnCount} x {rowCount} table
                    </span>
                  </Button>
                </ButtonGroup>

                <p className="px-2 text-[11px] text-slate-500 dark:text-slate-400">
                  Columns are limited to {MAX_COLUMN_COUNT}. Rows are limited to{" "}
                  {MAX_ROW_COUNT}.
                </p>
              </CardItemGroup>

              {visibleSections.map((section) => (
                <CardItemGroup key={section.id} className="gap-1">
                  <CardGroupLabel>{section.label}</CardGroupLabel>
                  <ButtonGroup orientation="vertical">
                    {section.actions.map((action) => (
                      <DropdownMenuItem key={action.id} asChild>
                        <Button
                          type="button"
                          showTooltip={false}
                          disabled={!action.canRun(editor, tableState)}
                          onClick={() => {
                            action.run(editor);
                          }}
                          className="min-w-[12rem] justify-start"
                        >
                          <span className="tiptap-button-text">
                            {action.label}
                          </span>
                        </Button>
                      </DropdownMenuItem>
                    ))}
                  </ButtonGroup>
                </CardItemGroup>
              ))}
            </CardBody>
          </Card>
        </DropdownMenuContent>
      </DropdownMenu>

      {isTableActive &&
        (["top", "middle", "bottom"] as const).map((align) => (
          <Button
            key={align}
            type="button"
            data-style="ghost"
            data-active-state={currentVerticalAlign === align ? "on" : "off"}
            data-disabled={!editor.can().setCellAttribute("verticalAlign", align)}
            disabled={!editor.can().setCellAttribute("verticalAlign", align)}
            role="button"
            tabIndex={-1}
            aria-label={`Cell align ${align}`}
            tooltip={`Cell align ${align}`}
            onClick={() => {
              editor
                .chain()
                .focus()
                .setCellAttribute("verticalAlign", align)
                .run();
            }}
            className="px-2"
          >
            <span className="tiptap-button-text">
              {align === "top"
                ? "Top"
                : align === "middle"
                  ? "Middle"
                  : "Bottom"}
            </span>
          </Button>
        ))}
    </>
  );
}

export default TableDropdownMenu;
