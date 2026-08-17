import { useEffect, useRef, useState } from "react";
import { loadingLine } from "@/lib/loading-progress";

/**
 * Progress line for the two reader-facing endpoints slow enough to need one:
 * /api/news at 5.0s cold and /api/stack at 4.2s.
 *
 * A skeleton says something is happening. It does not say for how long, and it
 * looks the same at one second and at thirty, which is when a reader decides the
 * page is broken. This counts up and, past six seconds, names the upstream.
 *
 * Renders nothing for the first 500ms so a cached response, which arrives in
 * single-digit milliseconds, never flashes it.
 *
 * The count starts when this component begins watching, not when the request
 * left. On a cold page those differ by however long the app took to mount, so
 * the number reads low against a network trace. It is there to tell a reader the
 * page is still working, which it does either way.
 */
export function SlowLoad({
  active,
  label,
  upstream,
  className = "",
}: {
  active: boolean;
  label: string;
  /** Named only once the wait outlasts a normal cold fetch. */
  upstream?: string;
  className?: string;
}) {
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      startedAt.current = null;
      setElapsed(0);
      return;
    }
    startedAt.current = Date.now();
    setElapsed(0);
    // 250ms keeps the seconds honest without re-rendering every frame.
    const id = setInterval(() => {
      if (startedAt.current !== null) setElapsed(Date.now() - startedAt.current);
    }, 250);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;
  const line = loadingLine(elapsed, label, upstream);
  if (!line) return null;

  return (
    <span
      className={`inline-flex items-baseline gap-2 font-mono text-11 ${className}`}
      role="status"
      aria-live="polite"
      data-testid="slow-load"
    >
      {/* A block that blinks rather than a spinner: this is a terminal, and a
          spinner is the one shape every other dashboard already uses. */}
      <span
        aria-hidden
        className="inline-block h-2.5 w-1.5 translate-y-px animate-pulse bg-brand"
      />
      <span className={line.stalled ? "text-brand-2" : "text-muted-foreground"}>{line.text}</span>
      <span className="tabular-nums text-muted-foreground/60">{line.elapsed}</span>
    </span>
  );
}
