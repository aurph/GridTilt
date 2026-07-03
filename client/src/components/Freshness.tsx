/**
 * Trust primitives (Lake 7A/7C): every widget can say how fresh its data is
 * and what to do when a fetch breaks. "Stale" (source missed its refresh
 * schedule) is visually distinct from "broken" (fetch failed) and from
 * "market closed" (handled per-page where it applies).
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Clock, RotateCw } from "lucide-react";

function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function fmtAge(ageMs: number): string {
  const s = Math.floor(ageMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

/**
 * "as of" chip for widget headers. Hover shows the exact timestamp.
 * When the data is older than `staleAfterMs` (default: 2x the refresh
 * interval), it flips to an amber stale badge - the source missed its
 * schedule, which is different from being broken.
 */
export function AsOf({
  updatedAt,
  intervalMs = 900_000,
  staleAfterMs,
  className = "",
}: {
  updatedAt: number | undefined;
  intervalMs?: number;
  staleAfterMs?: number;
  className?: string;
}) {
  // re-render each 30s so the age and staleness stay live
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!updatedAt) return null;
  const age = Date.now() - updatedAt;
  const staleAt = staleAfterMs ?? intervalMs * 2;
  const stale = age > staleAt;

  if (stale) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-sm border border-warning/40 bg-warning/10 px-1.5 text-9 font-mono uppercase tracking-wide text-warning ${className}`}
        title={`Source missed its refresh schedule - last update ${fmtClock(updatedAt)} (${fmtAge(age)})`}
        data-testid="asof-stale"
      >
        <Clock className="h-2.5 w-2.5" />
        stale · {fmtAge(age)}
      </span>
    );
  }
  return (
    <span
      className={`text-9 font-mono text-muted-foreground/60 cursor-default ${className}`}
      title={`as of ${fmtClock(updatedAt)}`}
      data-testid="asof"
    >
      as of {fmtAge(age)}
    </span>
  );
}

/**
 * Designed in-place fetch-failure state with retry. Distinct from stale:
 * broken means the request failed, not that the source is late.
 */
export function ErrorState({
  label,
  onRetry,
  className = "",
}: {
  label: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 py-8 px-4 text-center ${className}`}
      role="alert"
      data-testid="error-state"
    >
      <AlertTriangle className="h-4 w-4 text-negative" />
      <p className="text-xs text-muted-foreground">{label}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded border border-subtle px-2.5 py-1 text-11 font-mono text-foreground hover:border-strong transition-colors"
          data-testid="error-retry"
        >
          <RotateCw className="h-3 w-3" />
          retry
        </button>
      )}
    </div>
  );
}

/**
 * Screen-reader data table for a chart (Lake 7E): renders the series as an
 * sr-only table so chart content is not locked inside pixels.
 */
export function SrChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
