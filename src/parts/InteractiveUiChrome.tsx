import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ConfirmProvider, useConfirm } from "@/states/ConfirmContext";
import { ToastProvider } from "@/states/ToastContext";
const GuestbookReminder = lazy(() => import("./GuestbookReminder"));

function ExternalLinkWarning() {
  const { confirm } = useConfirm();
  const isPromptOpenRef = useRef(false);

  useEffect(() => {
    const handleClick = async (event: MouseEvent) => {
      if (event.defaultPrevented || isPromptOpenRef.current) return;
      if (!(event.target instanceof Element)) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      const isHttpLink = url.protocol === "http:" || url.protocol === "https:";

      if (!isHttpLink || url.origin === window.location.origin) {
        return;
      }

      event.preventDefault();
      isPromptOpenRef.current = true;

      try {
        const shouldContinue = await confirm({
          title: "External Link Warning",
          message: (
            <>
              You are leaving mirabellier.com and opening{" "}
              <strong>{url.hostname}</strong>. External websites can be
              malicious, misleading, or unsafe. Continue only if you trust
              this destination.
            </>
          ),
          confirmLabel: "Take a risk",
          cancelLabel: "Cancel",
        });

        if (!shouldContinue) {
          return;
        }

        const target = anchor.target === "_blank" ? "_blank" : "_self";
        if (target === "_blank") {
          window.open(url.href, "_blank", "noopener,noreferrer");
          return;
        }

        window.location.assign(url.href);
      } finally {
        isPromptOpenRef.current = false;
      }
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, [confirm]);

  return null;
}

type InteractiveUiChromeProps = {
  children: React.ReactNode;
};

const InteractiveUiChrome = ({ children }: InteractiveUiChromeProps) => {
  const [showGuestbookReminder, setShowGuestbookReminder] = useState(false);

  useEffect(() => {
    let timeoutId: number | null = null;

    const enableReminder = () => {
      timeoutId = window.setTimeout(() => {
        setShowGuestbookReminder(true);
      }, 1200);
    };

    if (document.readyState === "complete") {
      enableReminder();
    } else {
      window.addEventListener("load", enableReminder, { once: true });
    }

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      window.removeEventListener("load", enableReminder);
    };
  }, []);

  return (
    <ConfirmProvider>
      <ToastProvider>
        <ExternalLinkWarning />
        <Suspense fallback={null}>
          {showGuestbookReminder ? <GuestbookReminder /> : null}
        </Suspense>
        {children}
      </ToastProvider>
    </ConfirmProvider>
  );
};

export default InteractiveUiChrome;
