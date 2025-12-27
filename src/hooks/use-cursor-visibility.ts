import * as React from "react"
import type { Editor } from "@tiptap/react"
import { useWindowSize } from "@/hooks/use-window-size"

export interface CursorVisibilityOptions {
  
  editor?: Editor | null
  
  overlayHeight?: number
}

export type RectState = Omit<DOMRect, "toJSON">


export function useCursorVisibility({
  editor,
  overlayHeight = 0,
}: CursorVisibilityOptions) {
  const { height: windowHeight } = useWindowSize()
  const [rect, setRect] = React.useState<RectState>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  })

  const updateRect = React.useCallback(() => {
    const element = document.body

    const DOMRect = element.getBoundingClientRect()
    setRect(DOMRect)
  }, [])

  React.useEffect(() => {
    const element = document.body

    updateRect()

    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(updateRect)
    })

    resizeObserver.observe(element)
    window.addEventListener("scroll", updateRect, true)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener("scroll", updateRect)
    }
  }, [updateRect])

  React.useEffect(() => {
    const ensureCursorVisibility = () => {
      if (!editor) return

      const { state, view } = editor

      if (!view.hasFocus()) return
      const { from } = state.selection
      const cursorCoords = view.coordsAtPos(from)

      if (windowHeight < rect.height) {
        if (cursorCoords) {
          const availableSpace = windowHeight - cursorCoords.top
          if (availableSpace < overlayHeight) {
            const targetCursorY = Math.max(windowHeight / 2, overlayHeight)
            const currentScrollY = window.scrollY
            const cursorAbsoluteY = cursorCoords.top + currentScrollY
            const newScrollY = cursorAbsoluteY - targetCursorY

            window.scrollTo({
              top: Math.max(0, newScrollY),
              behavior: "smooth",
            })
          }
        }
      }
    }

    ensureCursorVisibility()
  }, [editor, overlayHeight, windowHeight, rect.height])

  return rect
}
