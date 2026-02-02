import { useState, useEffect } from "react";
import NormalCursor from "./cursor/NormalCursor";
import PointerCursor from "./cursor/PointerCursor";
import TextCursor from "./cursor/TextCursor";
import { useCursor } from "../states/CursorContext";

export default function CursorManager() {
  const { isCustomCursor } = useCursor();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const [cursorState, setCursorState] = useState({
    isText: false,
    isPointer: false,
  });

  useEffect(() => {
    if (!isCustomCursor) {
      setIsVisible(false);
      return;
    }

    // Set visible immediately if custom cursor is turned on
    setIsVisible(true);

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });

      const target = e.target as HTMLElement;

      const isTextElement = target.closest("input, textarea");

      const isClickable =
        !isTextElement &&
        target.closest(
          'a, button, [role="button"], [onclick], [data-clickable]',
        );

      setCursorState({
        isText: !!isTextElement,
        isPointer: !!isClickable,
      });
    };

    const handleMouseEnter = () => setIsVisible(true);
    const handleMouseLeave = () => setIsVisible(false);

    document.addEventListener("mousemove", handleMouseMove);
    document.body.addEventListener("mouseenter", handleMouseEnter);
    document.body.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.body.removeEventListener("mouseenter", handleMouseEnter);
      document.body.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [isCustomCursor]);

  if (!isCustomCursor || !isVisible) return null;

  return (
    <>
      <NormalCursor
        position={position}
        isActive={!cursorState.isText && !cursorState.isPointer}
      />
      <PointerCursor
        position={position}
        isActive={cursorState.isPointer && !cursorState.isText}
      />
      <TextCursor position={position} isActive={cursorState.isText} />
    </>
  );
}
