// Reader-flow helpers for a blog post: the chronological neighbours ("older" /
// "newer") and, when a post names a `series`, the ordered list of its parts.
// Config-free (no `@/lib/config`) so it runs under `node --test`.

type NavPost = {
  id: string | number;
  title: string;
  createdAt: string;
  series?: string | null;
};

function byDateAsc<T extends NavPost>(a: T, b: T): number {
  const at = Date.parse(a.createdAt);
  const bt = Date.parse(b.createdAt);
  if (Number.isNaN(at) || Number.isNaN(bt) || at === bt) {
    return String(a.id).localeCompare(String(b.id));
  }
  return at - bt;
}

// Oldest first — the order a reader would move through them.
export function sortByDateAsc<T extends NavPost>(posts: readonly T[]): T[] {
  return [...posts].sort(byDateAsc);
}

export type PostNeighbors<T> = { older: T | null; newer: T | null };

// `older` is the chronologically previous post, `newer` the next one; either is
// null at the ends of the archive, and both are null if `currentId` isn't found.
export function getPostNeighbors<T extends NavPost>(
  posts: readonly T[],
  currentId: string | number,
): PostNeighbors<T> {
  const ordered = sortByDateAsc(posts);
  const index = ordered.findIndex(
    (post) => String(post.id) === String(currentId),
  );
  if (index === -1) return { older: null, newer: null };

  return {
    older: index > 0 ? ordered[index - 1] : null,
    newer: index < ordered.length - 1 ? ordered[index + 1] : null,
  };
}

function seriesKey(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export type SeriesContext<T> = {
  /** Display name, taken verbatim (trimmed) from the current post. */
  name: string;
  /** Every post in the series, oldest first. */
  parts: T[];
  /** 0-based position of the current post within `parts`. */
  index: number;
  previous: T | null;
  next: T | null;
};

// The series the current post belongs to, or null when it names none or is the
// only member. Matching is case-insensitive on the trimmed series string.
export function getSeriesContext<T extends NavPost>(
  posts: readonly T[],
  currentId: string | number,
): SeriesContext<T> | null {
  const current = posts.find((post) => String(post.id) === String(currentId));
  const key = seriesKey(current?.series);
  if (!current || !key) return null;

  const parts = sortByDateAsc(
    posts.filter((post) => seriesKey(post.series) === key),
  );
  if (parts.length < 2) return null;

  const index = parts.findIndex(
    (post) => String(post.id) === String(currentId),
  );

  return {
    name: String(current.series).trim(),
    parts,
    index,
    previous: index > 0 ? parts[index - 1] : null,
    next: index >= 0 && index < parts.length - 1 ? parts[index + 1] : null,
  };
}
