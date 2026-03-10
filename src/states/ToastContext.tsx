import { createContext, useContext, useEffect, useRef, useState } from "react";
import Toast from "@/parts/Toast";

type ToastOptions = {
  durationMs?: number;
  sticky?: boolean;
};

type ToastContextType = {
  showToast: (message: string, options?: ToastOptions) => void;
  hideToast: () => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(
    null,
  );
  const timeoutRef = useRef<number | null>(null);

  const clearToastTimer = () => {
    if (timeoutRef.current === null) {
      return;
    }

    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  };

  useEffect(() => {
    return () => {
      clearToastTimer();
    };
  }, []);

  const hideToast = () => {
    clearToastTimer();
    setToast(null);
  };

  const showToast = (message: string, options?: ToastOptions) => {
    const durationMs = options?.durationMs ?? 2500;
    const id = Date.now();

    clearToastTimer();
    setToast({ id, message });

    if (options?.sticky) {
      return;
    }

    timeoutRef.current = window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
      timeoutRef.current = null;
    }, durationMs);
  };

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      {toast ? <Toast message={toast.message} onClose={hideToast} /> : null}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return ctx;
};
