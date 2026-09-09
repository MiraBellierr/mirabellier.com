/**
 * A tiny stale-while-revalidate cache for **public, idempotent GET** JSON
 * endpoints. Keyed on the full URL; holds the *parsed/normalised* value, not
 * the `Response`.
 *
 * - Within `freshMs` of the last fetch: return the cached value, no network.
 * - Between `freshMs` and `maxAgeMs`: return the cached value immediately AND
 *   refresh it in the background (the *next* visit gets the update).
 * - Older than `maxAgeMs`, or never fetched: a normal blocking fetch.
 * - A failed refresh keeps the stale value; a failed first fetch throws
 *   (unless a stale value is still around to fall back on).
 *
 * Only use this where the response does not vary per user — do not cache
 * anything gated on an auth token / "has the viewer done X" state.
 */

type Entry<T = unknown> = {
  at: number;
  value?: T;
  inflight?: Promise<T>;
  revalidating?: boolean;
};

const cache = new Map<string, Entry>();
const MAX_ENTRIES = 100;
const DEFAULT_FRESH_MS = 10_000;
const DEFAULT_MAX_AGE_MS = 5 * 60_000;

type SwrOptions = {
  init?: RequestInit;
  /** Aborts only the blocking fetch (background refreshes ignore it). */
  signal?: AbortSignal;
  freshMs?: number;
  maxAgeMs?: number;
  /** Turn a non-OK response into the error to throw. */
  errorFrom?: (res: Response) => Error | Promise<Error>;
};

function store<T>(key: string, entry: Entry<T>): void {
  cache.delete(key); // re-insert so the freshest key is last (cheap LRU)
  cache.set(key, entry as Entry);
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

async function runFetch<T>(
  url: string,
  transform: (json: unknown) => T,
  opts: SwrOptions,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...opts.init, signal });
  if (!res.ok) {
    throw opts.errorFrom
      ? await opts.errorFrom(res)
      : new Error(`Request failed (${res.status})`);
  }
  return transform(await res.json());
}

export async function swrJson<T>(
  url: string,
  transform: (json: unknown) => T,
  opts: SwrOptions = {},
): Promise<T> {
  const freshMs = opts.freshMs ?? DEFAULT_FRESH_MS;
  const maxAgeMs = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = Date.now();
  const hit = cache.get(url) as Entry<T> | undefined;

  if (hit && hit.value !== undefined && now - hit.at <= maxAgeMs) {
    if (now - hit.at > freshMs && !hit.revalidating) {
      hit.revalidating = true;
      void runFetch(url, transform, opts)
        .then((value) => store(url, { at: Date.now(), value }))
        .catch(() => {
          // keep the stale value; just let a later call try again
          const cur = cache.get(url);
          if (cur) cur.revalidating = false;
        });
    }
    return hit.value;
  }

  if (hit?.inflight) return hit.inflight;

  const inflight = runFetch(url, transform, opts, opts.signal)
    .then((value) => {
      store(url, { at: Date.now(), value });
      return value;
    })
    .catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      const stale = cache.get(url) as Entry<T> | undefined;
      if (stale?.value !== undefined && Date.now() - stale.at <= maxAgeMs * 4) {
        return stale.value;
      }
      cache.delete(url);
      throw err;
    });

  store(url, { at: hit?.at ?? 0, value: hit?.value, inflight });
  return inflight;
}

/** Drop everything — call on login / logout so a shared browser can't leak. */
export function clearApiCache(): void {
  cache.clear();
}
