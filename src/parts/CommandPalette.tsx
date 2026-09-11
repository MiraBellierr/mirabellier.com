import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

import { onOpenCommandPalette } from "@/lib/command-palette";
import { fetchSearchResults } from "@/lib/search-api";
import { HEADER_ROUTE_TITLES } from "@/parts/Header";

type PaletteItem = {
  key: string;
  label: string;
  snippet?: string;
  to: string;
  group: string;
};

const SEARCH_DEBOUNCE_MS = 250;

const seenTitles = new Set<string>();
const STATIC_ITEMS: PaletteItem[] = HEADER_ROUTE_TITLES.filter(
  (route) =>
    !route.path.includes(":") &&
    !route.path.startsWith("/ar/") &&
    route.path !== "/ar" &&
    !seenTitles.has(route.title) &&
    seenTitles.add(route.title),
).map((route) => ({
  key: `page:${route.path}`,
  label: route.title,
  to: route.path,
  group: "pages",
}));

const MAX_PER_GROUP = 8;

const CommandPalette = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [dynamicItems, setDynamicItems] = useState<PaletteItem[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((wasOpen) => !wasOpen);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const unsubscribe = onOpenCommandPalette(() => setOpen(true));

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    setQuery("");
    setActiveIndex(0);
    inputRef.current?.focus();

    setDynamicItems([]);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    const needle = query.trim();
    if (!open || !needle) {
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      fetchSearchResults(needle, controller.signal)
        .then((results) => {
          setDynamicItems(
            results.map((result) => ({
              key: `${result.kind}:${result.id}`,
              label: result.title,
              snippet: result.snippet,
              to: result.href,
              group: result.group,
            })),
          );
        })
        .catch(() => {
          // aborted (new keystroke) or a network hiccup — leave the last
          // good results on screen rather than flashing an error
        })
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matchingPages = needle
      ? STATIC_ITEMS.filter((item) => item.label.toLowerCase().includes(needle))
      : STATIC_ITEMS;
    const matches = needle ? [...matchingPages, ...dynamicItems] : matchingPages;

    const byGroup = new Map<string, PaletteItem[]>();
    for (const item of matches) {
      const bucket = byGroup.get(item.group) ?? [];
      if (bucket.length < MAX_PER_GROUP) {
        bucket.push(item);
      }
      byGroup.set(item.group, bucket);
    }

    return Array.from(byGroup.entries()).flatMap(([, items]) => items);
  }, [query, dynamicItems]);

  useEffect(() => {
    setActiveIndex(0);
  }, [results.length]);

  const goTo = (item: PaletteItem) => {
    setOpen(false);
    navigate(item.to);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = results[activeIndex];
      if (item) {
        goTo(item);
      }
    }
  };

  if (!open || typeof document === "undefined") {
    return null;
  }

  let renderedGroup = "";

  return createPortal(
    <div
      className="fixed inset-0 z-[240000] flex items-start justify-center bg-white/45 p-4 pt-[12vh] backdrop-blur-sm dark:bg-slate-950/60"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="card-border w-full max-w-lg overflow-hidden rounded-2xl shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search pages, posts, shrines..."
          aria-label="Search"
          className="w-full border-b border-blue-200/80 bg-transparent px-4 py-3 text-sm text-blue-700 outline-none placeholder:text-blue-400 dark:border-purple-300/20 dark:text-purple-100 dark:placeholder:text-purple-300/60"
        />

        <div className="max-h-[50vh] overflow-y-auto py-2">
          {results.length === 0 && (
            <p className="px-4 py-3 text-sm text-blue-500 dark:text-purple-300">
              {searching ? "Searching…" : "No matches."}
            </p>
          )}

          {results.map((item, index) => {
            const showGroupHeader = item.group !== renderedGroup;
            renderedGroup = item.group;

            return (
              <div key={item.key}>
                {showGroupHeader && (
                  <div className="px-4 pb-1 pt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-blue-400 dark:text-purple-300/80">
                    {item.group}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => goTo(item)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`block w-full px-4 py-2 text-left ${
                    index === activeIndex
                      ? "bg-blue-100 dark:bg-purple-900/60"
                      : ""
                  }`}
                >
                  <span
                    className={`block truncate text-sm font-semibold ${
                      index === activeIndex
                        ? "text-blue-700 dark:text-purple-100"
                        : "text-blue-600 dark:text-purple-200"
                    }`}
                  >
                    {item.label}
                  </span>
                  {item.snippet && (
                    <span className="block truncate text-xs text-blue-500 dark:text-purple-300/80">
                      {item.snippet}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CommandPalette;
