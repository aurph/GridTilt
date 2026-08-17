/**
 * Timing rules for the slow-load indicator.
 *
 * Measured cold with the caches empty: /api/news 5.0s, /api/stack 4.2s,
 * /api/kpis 3.9s. Every other endpoint reads local JSON and returns in under
 * 30ms, where an indicator would be a flash of noise. /api/kpis has no client
 * consumer, so only news and stack reach a reader.
 *
 * Warm, both return in milliseconds. So the indicator stays invisible until a
 * wait is real, then says how long it has been and, past a point, which upstream
 * is not answering.
 */

/**
 * Nothing renders before this. A cached response arrives inside it, so the
 * common case shows no indicator at all rather than a flicker.
 */
export const REVEAL_AFTER_MS = 500;

/**
 * Past this the wait is longer than any measured cold fetch, so the upstream is
 * the useful thing to name rather than the elapsed count alone.
 */
export const STALL_AFTER_MS = 6000;

/** Elapsed time, in the coarsest unit that still reads as progress. */
export function fmtElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const total = Math.floor(ms / 1000);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

/** Whether the indicator is visible yet. */
export function isRevealed(elapsedMs: number): boolean {
  return Number.isFinite(elapsedMs) && elapsedMs >= REVEAL_AFTER_MS;
}

/** Whether the wait has outlasted a normal cold fetch. */
export function isStalled(elapsedMs: number): boolean {
  return Number.isFinite(elapsedMs) && elapsedMs >= STALL_AFTER_MS;
}

/**
 * What to show for a wait of this length.
 *
 * Before the reveal, nothing. After it, the label. Past the stall point, the
 * upstream, so a reader waiting on Yahoo is told it is Yahoo rather than being
 * left to assume the page is broken. Returns null when nothing should render,
 * so callers branch on one value.
 */
export function loadingLine(
  elapsedMs: number,
  label: string,
  upstream?: string,
): { text: string; elapsed: string; stalled: boolean } | null {
  if (!isRevealed(elapsedMs)) return null;
  const stalled = isStalled(elapsedMs);
  return {
    text: stalled && upstream ? `Still waiting on ${upstream}` : label,
    elapsed: fmtElapsed(elapsedMs),
    stalled,
  };
}
