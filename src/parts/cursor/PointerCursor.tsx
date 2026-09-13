import pointerCursor from "/cursors/Pointer.gif";

type PointerCursorProps = {
  isActive: boolean;
};

export default function PointerCursor({ isActive }: PointerCursorProps) {
  if (!isActive) return null;

  const config = {
    width: 32,
    height: 32,
    offsetX: 0,
    offsetY: 0,
    image: pointerCursor,
  };

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        // Position comes from the custom properties CursorManager writes each
        // animation frame (see NormalCursor for the fallback).
        transform: `translate3d(calc(var(--cursor-x, -100px) + ${config.offsetX}px), calc(var(--cursor-y, -100px) + ${config.offsetY}px), 0)`,
        willChange: "transform",
        width: `${config.width}px`,
        height: `${config.height}px`,
        background: `url(${config.image}) no-repeat`,
        backgroundSize: "contain",
        pointerEvents: "none",
        zIndex: 300000,
      }}
    />
  );
}
