import normalCursor from "/cursors/Normal.gif";

type NormalCursorProps = {
  isActive: boolean;
};

export default function NormalCursor({ isActive }: NormalCursorProps) {
  const config = {
    width: 32,
    height: 32,
    offsetX: 0,
    offsetY: 0,
    image: normalCursor,
  };

  if (!isActive) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        // `--cursor-x`/`--cursor-y` are written once per animation frame by
        // CursorManager; the -100px fallback parks the node offscreen until the
        // first pointer event lands.
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
