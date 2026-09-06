import { useCallback, useEffect, useRef } from "react";

/**
 * Coordinates overlapping fetches for a single logical resource.
 *
 * Every call to the returned `run`:
 * - aborts the previous in-flight request for this resource,
 * - tags itself with an incrementing id,
 * - only invokes `onResult` / `onError` / `onSettled` when it is still the
 *   latest run and was not aborted.
 *
 * The outstanding request is aborted on unmount. Use one hook instance per
 * independent resource (e.g. one for a listings grid, another for a sidebar).
 */
export function useAbortableRequest() {
  const controllerRef = useRef<AbortController | null>(null);
  const idRef = useRef(0);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return useCallback(
    async <T>(
      fetcher: (signal: AbortSignal) => Promise<T>,
      handlers: {
        onResult?: (value: T) => void;
        onError?: (error: unknown) => void;
        onSettled?: () => void;
      } = {},
    ): Promise<void> => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const id = ++idRef.current;
      const isCurrent = () => id === idRef.current && !controller.signal.aborted;

      try {
        const value = await fetcher(controller.signal);
        if (isCurrent()) handlers.onResult?.(value);
      } catch (error) {
        if (isCurrent()) handlers.onError?.(error);
      } finally {
        if (isCurrent()) handlers.onSettled?.();
      }
    },
    [],
  );
}
