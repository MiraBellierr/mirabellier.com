"use client"

import * as React from "react"
import { useHotkeys } from "react-hotkeys-hook"
import type { ChainedCommands } from "@tiptap/react"
import { type Editor } from "@tiptap/react"
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  isExtensionAvailable,
  isNodeTypeSelected,
} from "@/lib/tiptap-utils"
import { AlignCenterIcon } from "@/components/tiptap-icons/align-center-icon"
import { AlignJustifyIcon } from "@/components/tiptap-icons/align-justify-icon"
import { AlignLeftIcon } from "@/components/tiptap-icons/align-left-icon"
import { AlignRightIcon } from "@/components/tiptap-icons/align-right-icon"

export type TextAlign = "left" | "center" | "right" | "justify"


export interface UseTextAlignConfig {
  
  editor?: Editor | null
  
  align: TextAlign
  
  hideWhenUnavailable?: boolean
  
  onAligned?: () => void
}

export const TEXT_ALIGN_SHORTCUT_KEYS: Record<TextAlign, string> = {
  left: "mod+shift+l",
  center: "mod+shift+e",
  right: "mod+shift+r",
  justify: "mod+shift+j",
}

export const textAlignIcons = {
  left: AlignLeftIcon,
  center: AlignCenterIcon,
  right: AlignRightIcon,
  justify: AlignJustifyIcon,
}

export const textAlignLabels: Record<TextAlign, string> = {
  left: "Align left",
  center: "Align center",
  right: "Align right",
  justify: "Align justify",
}


export function canSetTextAlign(
  editor: Editor | null,
  align: TextAlign
): boolean {
  if (!editor || !editor.isEditable) return false
  if (
    !isExtensionAvailable(editor, "textAlign") ||
    isNodeTypeSelected(editor, ["image"])
  )
    return false

  return editor.can().setTextAlign(align)
}

export function hasSetTextAlign(
  commands: ChainedCommands
): commands is ChainedCommands & {
  setTextAlign: (align: TextAlign) => ChainedCommands
} {
  return "setTextAlign" in commands
}


export function isTextAlignActive(
  editor: Editor | null,
  align: TextAlign
): boolean {
  if (!editor || !editor.isEditable) return false
  return editor.isActive({ textAlign: align })
}


export function setTextAlign(editor: Editor | null, align: TextAlign): boolean {
  if (!editor || !editor.isEditable) return false
  if (!canSetTextAlign(editor, align)) return false

  const chain = editor.chain().focus()
  if (hasSetTextAlign(chain)) {
    return chain.setTextAlign(align).run()
  }

  return false
}


export function shouldShowButton(props: {
  editor: Editor | null
  hideWhenUnavailable: boolean
  align: TextAlign
}): boolean {
  const { editor, hideWhenUnavailable, align } = props

  if (!editor || !editor.isEditable) return false
  if (!isExtensionAvailable(editor, "textAlign")) return false

  if (hideWhenUnavailable && !editor.isActive("code")) {
    return canSetTextAlign(editor, align)
  }

  return true
}


export function useTextAlign(config: UseTextAlignConfig) {
  const {
    editor: providedEditor,
    align,
    hideWhenUnavailable = false,
    onAligned,
  } = config

  const { editor } = useTiptapEditor(providedEditor)
  const isMobile = useIsMobile()
  const [isVisible, setIsVisible] = React.useState<boolean>(true)
  const canAlign = canSetTextAlign(editor, align)
  const isActive = isTextAlignActive(editor, align)

  React.useEffect(() => {
    if (!editor) return

    const handleSelectionUpdate = () => {
      setIsVisible(shouldShowButton({ editor, align, hideWhenUnavailable }))
    }

    handleSelectionUpdate()

    editor.on("selectionUpdate", handleSelectionUpdate)

    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate)
    }
  }, [editor, hideWhenUnavailable, align])

  const handleTextAlign = React.useCallback(() => {
    if (!editor) return false

    const success = setTextAlign(editor, align)
    if (success) {
      onAligned?.()
    }
    return success
  }, [editor, align, onAligned])

  useHotkeys(
    TEXT_ALIGN_SHORTCUT_KEYS[align],
    (event) => {
      event.preventDefault()
      handleTextAlign()
    },
    {
      enabled: isVisible && canAlign,
      enableOnContentEditable: !isMobile,
      enableOnFormTags: true,
    }
  )

  return {
    isVisible,
    isActive,
    handleTextAlign,
    canAlign,
    label: textAlignLabels[align],
    shortcutKeys: TEXT_ALIGN_SHORTCUT_KEYS[align],
    Icon: textAlignIcons[align],
  }
}
