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
