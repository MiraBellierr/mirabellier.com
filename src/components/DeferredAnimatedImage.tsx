import { useEffect, useState, type ImgHTMLAttributes } from "react";

type DeferredAnimatedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  posterSrc: string;
  animatedSrc: string;
  waitForLcp?: boolean;
  lcpSettledDelayMs?: number;
};

const DeferredAnimatedImage = ({
  posterSrc,
  animatedSrc,
  waitForLcp = false,
  lcpSettledDelayMs = 1200,
  ...imgProps
}: DeferredAnimatedImageProps) => {
  const [currentSrc, setCurrentSrc] = useState(posterSrc);

  useEffect(() => {
    setCurrentSrc(posterSrc);
  }, [posterSrc]);

  useEffect(() => {
    let isCancelled = false;
    let idleCallbackId: number | null = null;
    let upgradeTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let lcpFallbackTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let lcpSettledTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let observer: PerformanceObserver | null = null;

    const preloadAnimatedImage = () => {
      const image = new Image();
      image.decoding = "async";
      image.src = animatedSrc;
      image.onload = () => {
        if (!isCancelled) {
          setCurrentSrc(animatedSrc);
        }
      };
    };

    const scheduleUpgrade = () => {
      // Keep the first frame lightweight for LCP, then upgrade once the page is idle.
      if ("requestIdleCallback" in window) {
        idleCallbackId = requestIdleCallback(preloadAnimatedImage, {
          timeout: 2500,
        });
      } else {
        upgradeTimeoutId = setTimeout(preloadAnimatedImage, 1200);
      }
    };

    const scheduleAfterSettledLcp = () => {
      if (lcpSettledTimeoutId !== null) {
        clearTimeout(lcpSettledTimeoutId);
      }

      lcpSettledTimeoutId = setTimeout(scheduleUpgrade, lcpSettledDelayMs);
    };

    const scheduleWithLcpGuard = () => {
      if (
        waitForLcp &&
        "PerformanceObserver" in window &&
        PerformanceObserver.supportedEntryTypes?.includes(
          "largest-contentful-paint",
        )
      ) {
        try {
          observer = new PerformanceObserver((entryList) => {
            if (entryList.getEntries().length > 0) {
              scheduleAfterSettledLcp();
            }
          });

          observer.observe({
            type: "largest-contentful-paint",
            buffered: true,
          });

          // If the browser never reports LCP entries, still upgrade eventually.
          lcpFallbackTimeoutId = setTimeout(scheduleUpgrade, 5000);
          return;
        } catch {
          observer = null;
        }
      }

      if (document.readyState === "complete") {
        scheduleUpgrade();
      } else {
        window.addEventListener("load", scheduleUpgrade, { once: true });
      }
    };

    scheduleWithLcpGuard();

    return () => {
      isCancelled = true;

      if (idleCallbackId !== null && "cancelIdleCallback" in window) {
        cancelIdleCallback(idleCallbackId);
      }

      observer?.disconnect();

      if (upgradeTimeoutId !== null) {
        clearTimeout(upgradeTimeoutId);
      }

      if (lcpFallbackTimeoutId !== null) {
        clearTimeout(lcpFallbackTimeoutId);
      }

      if (lcpSettledTimeoutId !== null) {
        clearTimeout(lcpSettledTimeoutId);
      }

      window.removeEventListener("load", scheduleUpgrade);
    };
  }, [animatedSrc, lcpSettledDelayMs, waitForLcp]);

  return <img {...imgProps} src={currentSrc} />;
};

export default DeferredAnimatedImage;
