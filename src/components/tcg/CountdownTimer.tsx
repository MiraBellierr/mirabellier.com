import { useState, useRef, useEffect } from "react";

export default function CountdownTimer({ startMs, onExpire }: { startMs: number; onExpire?: () => void }) {
  const TURN_SECONDS = 180;
  const [left, setLeft] = useState(TURN_SECONDS);
  const startRef = useRef(startMs);
  const expiredRef = useRef(false);

  useEffect(() => {
    startRef.current = startMs;
    expiredRef.current = false;
    setLeft(TURN_SECONDS);
  }, [startMs]);

  useEffect(() => {
    let active = true;
    const update = () => {
      if (!active) return;
      const elapsed = (Date.now() - startRef.current) / 1000;
      const remaining = Math.max(0, Math.ceil(TURN_SECONDS - elapsed));
      setLeft(remaining);
      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire?.();
      }
      if (remaining > 0) setTimeout(update, 250);
    };
    const timer = setTimeout(update, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [onExpire, startMs]);

  if (left <= 0) return null;
  return (
    <p className={`text-center text-sm font-bold ${left <= 30 ? "text-red-600 animate-pulse" : "text-slate-500 dark:text-slate-300"}`}>
      ⏱ {left}s
    </p>
  );
}
