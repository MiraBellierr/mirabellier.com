import { useEffect } from 'react';
import { useCursor } from '../../states/CursorContext';

import pointerCursor from '/cursors/Pointer.gif'; 

type PointerCursorProps = {
  position: { x: number; y: number };
  isActive: boolean;
};

export default function PointerCursor({ position, isActive }: PointerCursorProps) {
  const { isCustomCursor } = useCursor();
  useEffect(() => {
    if (isActive && isCustomCursor) {
      const elements = document.querySelectorAll(
        'a, button, [role="button"], [onclick]'
      );
      elements.forEach(el => {
        (el as HTMLElement).style.cursor = 'none';
      });
      
      return () => {
        elements.forEach(el => {
          (el as HTMLElement).style.cursor = '';
        });
      };
    }
  }, [isActive, isCustomCursor]);

  if (!isActive || !isCustomCursor) return null;

  const config = {
    width: 32,
    height: 32,
    offsetX: 0,
    offsetY: 0,
    image: pointerCursor
  };

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
        zIndex: 9999,
      }}
    />
  );
}