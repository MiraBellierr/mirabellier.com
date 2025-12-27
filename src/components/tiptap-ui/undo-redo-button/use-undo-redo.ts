"use client"

import * as React from "react"
import { useHotkeys } from "react-hotkeys-hook"
import { type Editor } from "@tiptap/react"
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { useIsMobile } from "@/hooks/use-mobile"
import { isNodeTypeSelected } from "@/lib/tiptap-utils"
import { Redo2Icon } from "@/components/tiptap-icons/redo2-icon"
import { Undo2Icon } from "@/components/tiptap-icons/undo2-icon"

export type UndoRedoAction = "undo" | "redo"


export interface UseUndoRedoConfig {
  
  editor?: Editor | null
  
  action: UndoRedoAction
  
  hideWhenUnavailable?: boolean
  
  onExecuted?: () => void
}

export const UNDO_REDO_SHORTCUT_KEYS: Record<UndoRedoAction, string> = {
  undo: "mod+z",
  redo: "mod+shift+z",
}

export const historyActionLabels: Record<UndoRedoAction, string> = {
  undo: "Undo",
  redo: "Redo",
}

export const historyIcons = {
  undo: Undo2Icon,
  redo: Redo2Icon,
}


export function canExecuteUndoRedoAction(
  editor: Editor | null,
  action: UndoRedoAction
): boolean {
  if (!editor || !editor.isEditable) return false
  if (isNodeTypeSelected(editor, ["image"])) return false

  return action === "undo" ? editor.can().undo() : editor.can().redo()
}


export function executeUndoRedoAction(
  editor: Editor | null,
  action: UndoRedoAction
): boolean {
  if (!editor || !editor.isEditable) return false
  if (!canExecuteUndoRedoAction(editor, action)) return false

  const chain = editor.chain().focus()
  return action === "undo" ? chain.undo().run() : chain.redo().run()
}


export function shouldShowButton(props: {
  editor: Editor | null
  hideWhenUnavailable: boolean
  action: UndoRedoAction
}): boolean {
  const { editor, hideWhenUnavailable, action } = props

  if (!editor || !editor.isEditable) return false

  if (hideWhenUnavailable && !editor.isActive("code")) {
    return canExecuteUndoRedoAction(editor, action)
  }

  return true
}


export function useUndoRedo(config: UseUndoRedoConfig) {
  const {
    editor: providedEditor,
    action,
    hideWhenUnavailable = false,
    onExecuted,
  } = config

  const { editor } = useTiptapEditor(providedEditor)
  const isMobile = useIsMobile()
  const [isVisible, setIsVisible] = React.useState<boolean>(true)
  const canExecute = canExecuteUndoRedoAction(editor, action)

  React.useEffect(() => {
    if (!editor) return

    const handleUpdate = () => {
      setIsVisible(shouldShowButton({ editor, hideWhenUnavailable, action }))
    }

    handleUpdate()

    editor.on("transaction", handleUpdate)

    return () => {
      editor.off("transaction", handleUpdate)
    }
  }, [editor, hideWhenUnavailable, action])

  const handleAction = React.useCallback(() => {
    if (!editor) return false

    const success = executeUndoRedoAction(editor, action)
    if (success) {
      onExecuted?.()
    }
    return success
  }, [editor, action, onExecuted])

  useHotkeys(
    UNDO_REDO_SHORTCUT_KEYS[action],
    (event) => {
      event.preventDefault()
      handleAction()
    },
    {
      enabled: isVisible && canExecute,
      enableOnContentEditable: !isMobile,
      enableOnFormTags: true,
    }
  )

  return {
    isVisible,
    handleAction,
    canExecute,
    label: historyActionLabels[action],
    shortcutKeys: UNDO_REDO_SHORTCUT_KEYS[action],
    Icon: historyIcons[action],
  }
}
