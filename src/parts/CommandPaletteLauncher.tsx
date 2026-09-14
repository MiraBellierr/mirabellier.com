import { lazy, Suspense, useCallback, useEffect, useState } from "react";

import { onOpenCommandPalette } from "@/lib/command-palette";

const CommandPalette = lazy(() => import("./CommandPalette"));

/**
 * Keeps the command palette off the critical path.
 *
 * `CommandPalette` is ~7 kB of component code (plus its search/portal logic),
 * and nothing on a first paint needs it — it is only reachable from a Cmd/Ctrl
 * + K press or the nav "search" button. This launcher is what stays in the
 * entry chunk: it is the thing that has to be listening for those two triggers,
 * so it cannot itself be lazy. On the first trigger it mounts the real palette,
 * which downloads as its own chunk.
 *
 * The open state lives here rather than inside the palette for a reason: the
 * chunk finishes loading *after* the trigger that requested it, so a palette
 * that subscribed to the event itself would miss the very first open (the nav
 * button's `openCommandPalette()` fires before the lazily-imported module has
 * even evaluated). Driving it as a controlled `open` prop means the request is
 * captured synchronously and honoured the moment the chunk resolves.
 *
 * Once mounted the palette stays mounted (it renders `null` while closed) so
 * reopening never re-downloads or re-suspends.
 */
export default function CommandPaletteLauncher() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const requestOpen = useCallback(() => {
    setMounted(true);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMounted(true);
        setOpen((wasOpen) => !wasOpen);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const unsubscribe = onOpenCommandPalette(requestOpen);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      unsubscribe();
    };
  }, [requestOpen]);

  if (!mounted) return null;

  return (
    <Suspense
      // Only ever visible during the very first chunk download, and only while
      // the palette is meant to be open (a second Cmd/Ctrl+K during the
      // download closes it again, so the scrim must honour `open`). Painting
      // the scrim straight away keeps the trigger feeling instant on a slow
      // connection, instead of appearing to do nothing for a round-trip.
      //
      // Deliberately no idle prefetch of the chunk: most visitors never open
      // the palette, and downloading 1.7 kB gz for them on a phone would cost
      // more than the entry-chunk saving this split exists to win.
      fallback={
        open ? (
          <div className="fixed inset-0 z-[240000] bg-white/45 pt-[12vh] backdrop-blur-sm dark:bg-slate-950/60" />
        ) : null
      }
    >
      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </Suspense>
  );
}
