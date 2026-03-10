import { createContext, useContext, useEffect, useRef, useState } from "react";
import ConfirmDialog from "@/parts/ConfirmDialog";

type ConfirmOptions = {
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
};

type ConfirmContextType = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

type PendingConfirm = {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
};

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export const ConfirmProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  useEffect(() => {
    return () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    };
  }, []);

  const resolveConfirm = (value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setPendingConfirm(null);
  };

  const confirm = (options: ConfirmOptions) => {
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }

    setPendingConfirm({
      title: options.title ?? "Please confirm",
      message: options.message,
      confirmLabel: options.confirmLabel ?? "Confirm",
      cancelLabel: options.cancelLabel ?? "Cancel",
    });

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {pendingConfirm ? (
        <ConfirmDialog
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          confirmLabel={pendingConfirm.confirmLabel}
          cancelLabel={pendingConfirm.cancelLabel}
          onConfirm={() => resolveConfirm(true)}
          onCancel={() => resolveConfirm(false)}
        />
      ) : null}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }

  return ctx;
};
