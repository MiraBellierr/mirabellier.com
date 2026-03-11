import { useEffect, useState, type ImgHTMLAttributes } from "react";

type DeferredAnimatedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  posterSrc: string;
  animatedSrc: string;
};

const DeferredAnimatedImage = ({
  posterSrc,
  animatedSrc,
  ...imgProps
}: DeferredAnimatedImageProps) => {
  const [currentSrc, setCurrentSrc] = useState(posterSrc);

  useEffect(() => {
    setCurrentSrc(posterSrc);
  }, [posterSrc]);

  useEffect(() => {
    let isCancelled = false;
    let idleCallbackId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

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
        timeoutId = setTimeout(preloadAnimatedImage, 1200);
      }
    };

    if (document.readyState === "complete") {
      scheduleUpgrade();
    } else {
      window.addEventListener("load", scheduleUpgrade, { once: true });
    }

    return () => {
      isCancelled = true;

      if (idleCallbackId !== null && "cancelIdleCallback" in window) {
        cancelIdleCallback(idleCallbackId);
      }

      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      window.removeEventListener("load", scheduleUpgrade);
    };
  }, [animatedSrc]);

  return <img {...imgProps} src={currentSrc} />;
};

export default DeferredAnimatedImage;
