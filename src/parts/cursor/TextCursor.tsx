import textCursor from '/cursors/Text.gif';

type TextCursorProps = {
  position: { x: number; y: number };
  isActive: boolean;
};

export default function TextCursor({ position, isActive }: TextCursorProps) {
  const config = {
    width: 32,
    height: 32,
    offsetX: 4,
    offsetY: 10,
    image: textCursor
  };

  if (!isActive) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        transform: `translate3d(${position.x + config.offsetX}px, ${position.y + config.offsetY}px, 0)`,
        willChange: 'transform',
        width: `${config.width}px`,
        height: `${config.height}px`,
        background: `url(${config.image}) no-repeat`,
        backgroundSize: 'contain',
        pointerEvents: 'none',
        zIndex: 300000, 
        // keep vertical alignment via translate3d above
      }}
    />
  );
}