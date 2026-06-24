import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

function computeStyle(el: HTMLElement): CSSProperties {
  const rect = el.getBoundingClientRect();
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const cardCx = rect.left + rect.width / 2;
  const cardCy = rect.top + rect.height / 2;
  const scaleW = (window.innerWidth / rect.width) * 0.6;
  const scaleH = (window.innerHeight / rect.height) * 0.6;
  const scale = Math.min(scaleW, scaleH, 1.5);

  return {
    "--translate-x": `${cx - cardCx}px`,
    "--translate-y": `${cy - cardCy}px`,
    "--card-scale": String(scale),
  } as CSSProperties;
}

export function useCardPopover(cardRef: React.RefObject<HTMLElement | null>) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSpin, setShowSpin] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const isFirstOpen = useRef(true);

  const open = useCallback(() => {
    const el = cardRef.current;
    if (!el || isOpen) return;
    const style = computeStyle(el);
    setPopoverStyle(style);
    setIsOpen(true);
    if (isFirstOpen.current) {
      isFirstOpen.current = false;
      setShowSpin(true);
      setTimeout(() => setShowSpin(false), 1000);
    }
  }, [cardRef, isOpen]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setPopoverStyle({});
      return;
    }
    const handleResize = () => {
      const el = cardRef.current;
      if (!el) return;
      setPopoverStyle(computeStyle(el));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isOpen, cardRef]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, close]);

  const spinClass = showSpin ? "arena-portrait-card__spinner--spin" : "";

  return { isOpen, open, close, popoverStyle, spinClass };
}
