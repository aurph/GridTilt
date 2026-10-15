// ─── Stale-while-revalidate read-through for in-memory caches ───────────────
//
// The quote, news and earnings caches used to expire and make the next
// visitor wait for the whole refetch (about 5 s for ~200 Yahoo calls or a
// dozen RSS feeds), and two visitors arriving together each started their
// own refetch. readThrough fixes both:
//   - fresh entry: returned as is;
//   - expired entry: returned at once, and one background refresh starts;
//   - no entry: the caller waits, and every concurrent caller shares the one
//     load (single flight per key).
// A refresh whose result `keep` rejects (Yahoo down, an empty feed) does not
// replace a good entry; the good entry is re-stamped instead, so the next
// retry waits a full TTL rather than hammering a failing upstream.

export interface Cached<T> {
  value: T;
  at: number;
}

const inflight = new Map<string, Promise<unknown>>();

export interface ReadThrough<T> {
  key: string;
  cached: Cached<T> | null | undefined;
  ttlMs: number;
  load: () => Promise<T>;
  /** Store a value; the caller stamps it with the current time. */
  save: (value: T) => void;
  /** Whether `next` may replace `prev` (prev undefined when nothing is cached). Default: always. */
  keep?: (next: T, prev: T | undefined) => boolean;
  now?: number;
}

export function readThrough<T>(o: ReadThrough<T>): Promise<T> {
  const now = o.now ?? Date.now();
  const c = o.cached;
  if (c && now - c.at < o.ttlMs) return Promise.resolve(c.value);
  let p = inflight.get(o.key) as Promise<T> | undefined;
  if (!p) {
    p = o
      .load()
      .then((next) => {
        const prev = o.cached?.value;
        if (!o.keep || o.keep(next, prev)) {
          o.save(next);
          return next;
        }
        if (prev !== undefined) {
          o.save(prev);
          return prev;
        }
        return next;
      })
      .finally(() => inflight.delete(o.key));
    inflight.set(o.key, p);
  }
  if (c) {
    p.catch(() => {});
    return Promise.resolve(c.value);
  }
  return p;
}

/** Refreshes in flight right now; for tests and diagnostics. */
export function inflightKeys(): string[] {
  return Array.from(inflight.keys());
}
