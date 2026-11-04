/**
 * fetch with a deadline.
 *
 * Node's fetch has no default timeout. An upstream that accepts the connection
 * and then never answers holds the promise open forever, which on an
 * autoscaling deployment means the Express handler, its request, and the
 * instance capacity behind it are pinned indefinitely. Every outbound call in
 * this server talks to a third party (FRED, EIA, LBNL, Resend), so every one of
 * them needs a deadline.
 *
 * server/gpu-live.ts had already solved this locally with its own
 * AbortController; this is the same 8s budget hoisted so the rest of the server
 * shares it.
 *
 * On timeout the underlying fetch rejects with an AbortError, which callers
 * handle exactly like any other network failure: the documented behaviour is to
 * serve null/empty and let the UI say so, never to invent a value.
 */
export const DEFAULT_TIMEOUT_MS = 8_000;

export async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  // A caller-supplied signal wins: it usually carries a shorter or
  // request-scoped lifetime that this helper must not silently extend.
  if (init.signal) return fetch(url, init);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Long enough for EIA's largest response, which normally takes 1-3 s. */
export const BODY_DEADLINE_MS = 15_000;

/**
 * Deadline on a whole fetch, body included. fetchWithTimeout's timer stops once
 * headers arrive, so a response that stalls mid-body (seen from EIA: 8 KB, then
 * nothing for three minutes) would hang forever. Behind a single-flight cache
 * that hangs every visitor, not just one. Runs `load`, and once more if the
 * first try missed the deadline; any other failure is passed straight through.
 */
export async function withDeadline<T>(load: () => Promise<T>, ms: number = BODY_DEADLINE_MS): Promise<T> {
  const attempt = () =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new DeadlineError()), ms);
      load().then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  try {
    return await attempt();
  } catch (error) {
    if (!(error instanceof DeadlineError)) throw error;
    return attempt();
  }
}

class DeadlineError extends Error {
  constructor() {
    super("upstream response missed its deadline");
  }
}
