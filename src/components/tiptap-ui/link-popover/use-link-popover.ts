"use client"

import * as React from "react"
import type { Editor } from "@tiptap/react"
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { LinkIcon } from "@/components/tiptap-icons/link-icon"
import { isMarkInSchema, sanitizeUrl } from "@/lib/tiptap-utils"


export interface UseLinkPopoverConfig {
  
  editor?: Editor | null
  
  hideWhenUnavailable?: boolean
  
  onSetLink?: () => void
}


export interface LinkHandlerProps {
  
  editor: Editor | null
  
  onSetLink?: () => void
}


export function canSetLink(editor: Editor | null): boolean {
  if (!editor || !editor.isEditable) return false
  return editor.can().setMark("link")
}


export function isLinkActive(editor: Editor | null): boolean {
  if (!editor || !editor.isEditable) return false
  return editor.isActive("link")
}


export function shouldShowLinkButton(props: {
  editor: Editor | null
  hideWhenUnavailable: boolean
}): boolean {
  const { editor, hideWhenUnavailable } = props

  const linkInSchema = isMarkInSchema("link", editor)

  if (!linkInSchema || !editor) {
    return false
  }

  if (hideWhenUnavailable && !editor.isActive("code")) {
    return canSetLink(editor)
  }

  return true
}


export function useLinkHandler(props: LinkHandlerProps) {
  const { editor, onSetLink } = props
  const [url, setUrl] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!editor) return
    const { href } = editor.getAttributes("link")

    if (isLinkActive(editor) && url === null) {
      setUrl(href || "")
    }
  }, [editor, url])

  React.useEffect(() => {
    if (!editor) return

    const updateLinkState = () => {
      const { href } = editor.getAttributes("link")
      setUrl(href || "")
    }

    editor.on("selectionUpdate", updateLinkState)
    return () => {
      editor.off("selectionUpdate", updateLinkState)
    }
  }, [editor])

  const setLink = React.useCallback(() => {
    if (!url || !editor) return

    const { selection } = editor.state
    const isEmpty = selection.empty

    let chain = editor.chain().focus()

    chain = chain.extendMarkRange("link").setLink({ href: url })

    if (isEmpty) {
      chain = chain.insertContent({ type: "text", text: url })
    }

    chain.run()

    setUrl(null)

    onSetLink?.()
  }, [editor, onSetLink, url])

  const removeLink = React.useCallback(() => {
    if (!editor) return
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .unsetLink()
      .setMeta("preventAutolink", true)
      .run()
    setUrl("")
  }, [editor])

  const openLink = React.useCallback(
    (target: string = "_blank", features: string = "noopener,noreferrer") => {
      if (!url) return

      const safeUrl = sanitizeUrl(url, window.location.href)
      if (safeUrl !== "#") {
        window.open(safeUrl, target, features)
      }
    },
    [url]
  )

  return {
    url: url || "",
    setUrl,
    setLink,
    removeLink,
    openLink,
  }
}


export function useLinkState(props: {
  editor: Editor | null
  hideWhenUnavailable: boolean
}) {
  const { editor, hideWhenUnavailable = false } = props

  const canSet = canSetLink(editor)
  const isActive = isLinkActive(editor)

  const [isVisible, setIsVisible] = React.useState(false)

  React.useEffect(() => {
    if (!editor) return

    const handleSelectionUpdate = () => {
      setIsVisible(
        shouldShowLinkButton({
          editor,
          hideWhenUnavailable,
        })
      )
    }

    handleSelectionUpdate()

    editor.on("selectionUpdate", handleSelectionUpdate)

    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate)
    }
  }, [editor, hideWhenUnavailable])

  return {
    isVisible,
    canSet,
    isActive,
  }
}


export function useLinkPopover(config?: UseLinkPopoverConfig) {
  const {
    editor: providedEditor,
    hideWhenUnavailable = false,
    onSetLink,
  } = config || {}

  const { editor } = useTiptapEditor(providedEditor)

  const { isVisible, canSet, isActive } = useLinkState({
    editor,
    hideWhenUnavailable,
  })

  const linkHandler = useLinkHandler({
    editor,
    onSetLink,
  })

  return {
    isVisible,
    canSet,
    isActive,
    label: "Link",
    Icon: LinkIcon,
    ...linkHandler,
  }
}
