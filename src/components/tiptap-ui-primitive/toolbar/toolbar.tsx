"use client";

import * as React from "react";
import { Separator } from "@/components/tiptap-ui-primitive/separator";
import "@/components/tiptap-ui-primitive/toolbar/toolbar.scss";
import { cn } from "@/lib/tiptap-utils";

type BaseProps = React.HTMLAttributes<HTMLDivElement>;

interface ToolbarProps extends BaseProps {
  variant?: "floating" | "fixed";
}

const mergeRefs = <T,>(
  refs: Array<React.Ref<T> | null | undefined>,
): React.RefCallback<T> => {
  return (value) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") {
        ref(value);
      } else if (ref && typeof ref === "object" && "current" in ref) {
        (ref as { current: T | null }).current = value;
      }
    });
  };
};

const useObserveVisibility = (
  ref: React.RefObject<HTMLElement | null>,
  callback: () => void,
): void => {
  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let isMounted = true;

    if (isMounted) {
      requestAnimationFrame(callback);
    }

    const observer = new MutationObserver(() => {
      if (isMounted) {
        requestAnimationFrame(callback);
      }
    });

    observer.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    return () => {
      isMounted = false;
      observer.disconnect();
    };
  }, [ref, callback]);
};

const useToolbarKeyboardNav = (
  toolbarRef: React.RefObject<HTMLDivElement | null>,
): void => {
  React.useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const getFocusableElements = () =>
      Array.from(
        toolbar.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [role="button"]:not([disabled]), [tabindex="0"]:not([disabled])',
        ),
      );

    const navigateToIndex = (
      e: KeyboardEvent,
      targetIndex: number,
      elements: HTMLElement[],
    ) => {
      e.preventDefault();
      let nextIndex = targetIndex;

      if (nextIndex >= elements.length) {
        nextIndex = 0;
      } else if (nextIndex < 0) {
        nextIndex = elements.length - 1;
      }

      elements[nextIndex]?.focus();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const focusableElements = getFocusableElements();
      if (!focusableElements.length) return;

      const currentElement = document.activeElement as HTMLElement;
      const currentIndex = focusableElements.indexOf(currentElement);

      if (!toolbar.contains(currentElement)) return;

      const keyActions: Record<string, () => void> = {
        ArrowRight: () =>
          navigateToIndex(e, currentIndex + 1, focusableElements),
        ArrowDown: () =>
          navigateToIndex(e, currentIndex + 1, focusableElements),
        ArrowLeft: () =>
          navigateToIndex(e, currentIndex - 1, focusableElements),
        ArrowUp: () => navigateToIndex(e, currentIndex - 1, focusableElements),
        Home: () => navigateToIndex(e, 0, focusableElements),
        End: () =>
          navigateToIndex(e, focusableElements.length - 1, focusableElements),
      };

      const action = keyActions[e.key];
      if (action) {
        action();
      }
    };

    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (toolbar.contains(target)) {
        target.setAttribute("data-focus-visible", "true");
      }
    };

    const handleBlur = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (toolbar.contains(target)) {
        target.removeAttribute("data-focus-visible");
      }
    };

    toolbar.addEventListener("keydown", handleKeyDown);
    toolbar.addEventListener("focus", handleFocus, true);
    toolbar.addEventListener("blur", handleBlur, true);

    const focusableElements = getFocusableElements();
    focusableElements.forEach((element) => {
      element.addEventListener("focus", handleFocus);
      element.addEventListener("blur", handleBlur);
    });

    return () => {
      toolbar.removeEventListener("keydown", handleKeyDown);
      toolbar.removeEventListener("focus", handleFocus, true);
      toolbar.removeEventListener("blur", handleBlur, true);

      const focusableElements = getFocusableElements();
      focusableElements.forEach((element) => {
        element.removeEventListener("focus", handleFocus);
        element.removeEventListener("blur", handleBlur);
      });
    };
  }, [toolbarRef]);
};

const useToolbarSwipeScroll = (
  toolbarRef: React.RefObject<HTMLDivElement | null>,
): {
  onTouchStartCapture: React.TouchEventHandler<HTMLDivElement>;
  onTouchMoveCapture: React.TouchEventHandler<HTMLDivElement>;
  onTouchEndCapture: React.TouchEventHandler<HTMLDivElement>;
  onTouchCancelCapture: React.TouchEventHandler<HTMLDivElement>;
  onClickCapture: React.MouseEventHandler<HTMLDivElement>;
} => {
  const dragStateRef = React.useRef<{
    touchId: number | null;
    startX: number;
    startScrollLeft: number;
    isDragging: boolean;
  }>({
    touchId: null,
    startX: 0,
    startScrollLeft: 0,
    isDragging: false,
  });
  const suppressClickRef = React.useRef(false);
  const clearSuppressClickTimeoutRef = React.useRef<number | null>(null);

  const clearSuppressClickTimeout = React.useCallback(() => {
    if (clearSuppressClickTimeoutRef.current !== null) {
      window.clearTimeout(clearSuppressClickTimeoutRef.current);
      clearSuppressClickTimeoutRef.current = null;
    }
  }, []);

  React.useEffect(
    () => () => {
      clearSuppressClickTimeout();
    },
    [clearSuppressClickTimeout],
  );

  const stopDragging = React.useCallback(
    (touchId: number) => {
      const dragState = dragStateRef.current;

      if (dragState.touchId !== touchId) {
        return;
      }

      if (dragState.isDragging) {
        suppressClickRef.current = true;
        clearSuppressClickTimeout();
        clearSuppressClickTimeoutRef.current = window.setTimeout(() => {
          suppressClickRef.current = false;
          clearSuppressClickTimeoutRef.current = null;
        }, 0);
      }

      dragStateRef.current = {
        touchId: null,
        startX: 0,
        startScrollLeft: 0,
        isDragging: false,
      };
    },
    [clearSuppressClickTimeout, toolbarRef],
  );

  const onTouchStartCapture = React.useCallback<
    React.TouchEventHandler<HTMLDivElement>
  >(
    (event) => {
      if (event.touches.length !== 1) {
        return;
      }

      const toolbar = toolbarRef.current;
      if (!toolbar || toolbar.scrollWidth <= toolbar.clientWidth) {
        return;
      }

      const touch = event.touches[0];
      dragStateRef.current = {
        touchId: touch.identifier,
        startX: touch.clientX,
        startScrollLeft: toolbar.scrollLeft,
        isDragging: false,
      };
    },
    [toolbarRef],
  );

  const onTouchMoveCapture = React.useCallback<
    React.TouchEventHandler<HTMLDivElement>
  >(
    (event) => {
      const toolbar = toolbarRef.current;
      const dragState = dragStateRef.current;

      if (!toolbar || dragState.touchId === null) {
        return;
      }

      const touch = Array.from(event.touches).find(
        (entry) => entry.identifier === dragState.touchId,
      );

      if (!touch) {
        return;
      }

      const deltaX = touch.clientX - dragState.startX;
      if (!dragState.isDragging && Math.abs(deltaX) > 6) {
        dragState.isDragging = true;
      }

      if (!dragState.isDragging) {
        return;
      }

      toolbar.scrollLeft = dragState.startScrollLeft - deltaX;
      event.preventDefault();
    },
    [toolbarRef],
  );

  const onTouchEndCapture = React.useCallback<
    React.TouchEventHandler<HTMLDivElement>
  >(
    (event) => {
      const dragState = dragStateRef.current;
      if (dragState.touchId === null) {
        return;
      }

      const touch = Array.from(event.changedTouches).find(
        (entry) => entry.identifier === dragState.touchId,
      );

      if (touch) {
        stopDragging(touch.identifier);
      }
    },
    [stopDragging],
  );

  const onTouchCancelCapture = React.useCallback<
    React.TouchEventHandler<HTMLDivElement>
  >(
    (event) => {
      const dragState = dragStateRef.current;
      if (dragState.touchId === null) {
        return;
      }

      const touch = Array.from(event.changedTouches).find(
        (entry) => entry.identifier === dragState.touchId,
      );

      if (touch) {
        stopDragging(touch.identifier);
      }
    },
    [stopDragging],
  );

  const onClickCapture = React.useCallback<
    React.MouseEventHandler<HTMLDivElement>
  >((event) => {
    if (!suppressClickRef.current) {
      return;
    }

    suppressClickRef.current = false;
    clearSuppressClickTimeout();
    event.preventDefault();
    event.stopPropagation();
  }, [clearSuppressClickTimeout]);

  return {
    onTouchStartCapture,
    onTouchMoveCapture,
    onTouchEndCapture,
    onTouchCancelCapture,
    onClickCapture,
  };
};

const useToolbarVisibility = (
  ref: React.RefObject<HTMLDivElement | null>,
): boolean => {
  const [isVisible, setIsVisible] = React.useState<boolean>(true);
  const isMountedRef = React.useRef(false);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const checkVisibility = React.useCallback(() => {
    if (!isMountedRef.current) return;

    const toolbar = ref.current;
    if (!toolbar) return;
    const hasVisibleChildren = Array.from(toolbar.children).some((child) => {
      if (!(child instanceof HTMLElement)) return false;
      if (child.getAttribute("role") === "group") {
        return child.children.length > 0;
      }
      return false;
    });

    setIsVisible(hasVisibleChildren);
  }, [ref]);

  useObserveVisibility(ref, checkVisibility);
  return isVisible;
};

const useGroupVisibility = (
  ref: React.RefObject<HTMLDivElement | null>,
): boolean => {
  const [isVisible, setIsVisible] = React.useState<boolean>(true);
  const isMountedRef = React.useRef(false);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const checkVisibility = React.useCallback(() => {
    if (!isMountedRef.current) return;

    const group = ref.current;
    if (!group) return;

    const hasVisibleChildren = Array.from(group.children).some((child) => {
      if (!(child instanceof HTMLElement)) return false;
      return true;
    });

    setIsVisible(hasVisibleChildren);
  }, [ref]);

  useObserveVisibility(ref, checkVisibility);
  return isVisible;
};

const useSeparatorVisibility = (
  ref: React.RefObject<HTMLDivElement | null>,
): boolean => {
  const [isVisible, setIsVisible] = React.useState<boolean>(true);
  const isMountedRef = React.useRef(false);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const checkVisibility = React.useCallback(() => {
    if (!isMountedRef.current) return;

    const separator = ref.current;
    if (!separator) return;

    const prevSibling = separator.previousElementSibling as HTMLElement;
    const nextSibling = separator.nextElementSibling as HTMLElement;

    if (!prevSibling || !nextSibling) {
      setIsVisible(false);
      return;
    }

    const areBothGroups =
      prevSibling.getAttribute("role") === "group" &&
      nextSibling.getAttribute("role") === "group";

    const haveBothChildren =
      prevSibling.children.length > 0 && nextSibling.children.length > 0;

    setIsVisible(areBothGroups && haveBothChildren);
  }, [ref]);

  useObserveVisibility(ref, checkVisibility);
  return isVisible;
};

export const Toolbar = React.forwardRef<HTMLDivElement, ToolbarProps>(
  ({ children, className, variant = "fixed", ...props }, ref) => {
    const toolbarRef = React.useRef<HTMLDivElement>(null);
    const isVisible = useToolbarVisibility(toolbarRef);
    const swipeHandlers = useToolbarSwipeScroll(toolbarRef);

    useToolbarKeyboardNav(toolbarRef);

    if (!isVisible) return null;

    return (
      <div
        ref={mergeRefs([toolbarRef, ref])}
        role="toolbar"
        aria-label="toolbar"
        data-variant={variant}
        className={cn("tiptap-toolbar", className)}
        {...swipeHandlers}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Toolbar.displayName = "Toolbar";

export const ToolbarGroup = React.forwardRef<HTMLDivElement, BaseProps>(
  ({ children, className, ...props }, ref) => {
    const groupRef = React.useRef<HTMLDivElement>(null);
    const isVisible = useGroupVisibility(groupRef);

    if (!isVisible) return null;

    return (
      <div
        ref={mergeRefs([groupRef, ref])}
        role="group"
        className={cn("tiptap-toolbar-group", className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);

ToolbarGroup.displayName = "ToolbarGroup";

export const ToolbarSeparator = React.forwardRef<
  HTMLDivElement,
  BaseProps & {
    fixed?: boolean;
  }
>(({ fixed = false, ...props }, ref) => {
  const separatorRef = React.useRef<HTMLDivElement>(null);
  const isVisible = useSeparatorVisibility(separatorRef);

  if (!isVisible && !fixed) return null;

  return (
    <Separator
      ref={mergeRefs([separatorRef, ref])}
      orientation="vertical"
      decorative
      {...props}
    />
  );
});

ToolbarSeparator.displayName = "ToolbarSeparator";
