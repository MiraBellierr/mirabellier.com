import normalCursor from '/cursors/Normal.gif';

type NormalCursorProps = {
  position: { x: number; y: number };
  isActive: boolean;
};

export default function NormalCursor({ position, isActive }: NormalCursorProps) {
  const config = {
    width: 32,
    height: 32,
    offsetX: 0,
    offsetY: 0,
    image: normalCursor
  };

  if (!isActive) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: `${position.x + config.offsetX}px`,
        top: `${position.y + config.offsetY}px`,
        width: `${config.width}px`,
        height: `${config.height}px`,
        background: `url(${config.image}) no-repeat`,
        backgroundSize: 'contain',
        pointerEvents: 'none',
        zIndex: 9998 
      }}
    />
  );
}