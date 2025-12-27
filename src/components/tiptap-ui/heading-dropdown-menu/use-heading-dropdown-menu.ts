"use client"

import * as React from "react"
import type { Editor } from "@tiptap/react"
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { HeadingIcon } from "@/components/tiptap-icons/heading-icon"
import {
  headingIcons,
  type Level,
  isHeadingActive,
  canToggle,
  shouldShowButton,
} from "@/components/tiptap-ui/heading-button"


export interface UseHeadingDropdownMenuConfig {
  
  editor?: Editor | null
  
  levels?: Level[]
  
  hideWhenUnavailable?: boolean
}


export function getActiveHeadingLevel(
  editor: Editor | null,
  levels: Level[] = [1, 2, 3, 4, 5, 6]
): Level | undefined {
  if (!editor || !editor.isEditable) return undefined
  return levels.find((level) => isHeadingActive(editor, level))
}


export function useHeadingDropdownMenu(config?: UseHeadingDropdownMenuConfig) {
  const {
    editor: providedEditor,
    levels = [1, 2, 3, 4, 5, 6],
    hideWhenUnavailable = false,
  } = config || {}

  const { editor } = useTiptapEditor(providedEditor)
  const [isVisible, setIsVisible] = React.useState(true)

  const activeLevel = getActiveHeadingLevel(editor, levels)
  const isActive = isHeadingActive(editor)
  const canToggleState = canToggle(editor)

  React.useEffect(() => {
    if (!editor) return

    const handleSelectionUpdate = () => {
      setIsVisible(
        shouldShowButton({ editor, hideWhenUnavailable, level: levels })
      )
    }

    handleSelectionUpdate()

    editor.on("selectionUpdate", handleSelectionUpdate)

    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate)
    }
  }, [editor, hideWhenUnavailable, levels])

  return {
    isVisible,
    activeLevel,
    isActive,
    canToggle: canToggleState,
    levels,
    label: "Heading",
    Icon: activeLevel ? headingIcons[activeLevel] : HeadingIcon,
  }
}
