import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type ConfirmDialogProps = {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

const ConfirmDialog = ({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancelButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onCancel]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[230000] flex items-center justify-center bg-white/45 p-4 backdrop-blur-sm dark:bg-slate-950/60"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="card-border w-full max-w-md rounded-2xl p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-4">
          <div className="space-y-2 text-center">
            <h2
              id="confirm-dialog-title"
              className="text-2xl font-bold text-blue-700 dark:text-purple-200"
            >
              {title}
            </h2>
            <p
              id="confirm-dialog-message"
              className="text-sm text-blue-600 dark:text-purple-200/90"
            >
              {message}
            </p>
          </div>

          <div className="flex justify-center gap-3">
            <button
              ref={cancelButtonRef}
              type="button"
              onClick={onCancel}
              className="rounded-full bg-blue-100 px-5 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-200 dark:bg-purple-900/70 dark:text-purple-100 dark:hover:bg-purple-800"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-full bg-pink-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-pink-600 dark:bg-pink-500 dark:hover:bg-pink-400"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ConfirmDialog;
