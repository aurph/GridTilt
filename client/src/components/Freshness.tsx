/**
 * Trust primitives (Lake 7A/7C): every widget can say how fresh its data is
 * and what to do when a fetch breaks. "Stale" (source missed its refresh
 * schedule) is visually distinct from "broken" (fetch failed) and from
 * "market closed" (handled per-page where it applies).
 */
import * as React from "react";
import { useEffect, useState } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

/** Full "as of" phrase. Under a minute reads "just now": raw second counts imply a precision the refresh cycle does not have. */
function fmtAge(ageMs: number): string {
  const s = Math.floor(ageMs / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `as of ${m}m ago`;
  const h = Math.floor(m / 60);
  return `as of ${h}h ${m % 60}m ago`;
}

/**
 * Quiet "as of" text for widget headers; hover shows the exact timestamp.
 * Deliberately never escalates to a warning: data age is context for the
 * reader, not an alarm - a calendar being an hour old is normal, quotes
 * being a night old while markets are closed is normal. Genuinely broken
 * sources surface through ErrorState and per-item delayed badges instead.
 */
export function AsOf({
  updatedAt,
  intervalMs: _intervalMs = 900_000,
  className = "",
}: {
  updatedAt: number | undefined;
  /** kept for call-site compatibility; age display does not depend on it */
  intervalMs?: number;
  className?: string;
}) {
  // re-render each 30s so the age stays live
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!updatedAt) return null;
  const age = Date.now() - updatedAt;
  return (
    <span
      className={`text-9 font-mono text-muted-foreground/60 cursor-default ${className}`}
      title={`as of ${fmtClock(updatedAt)}`}
      data-testid="asof"
    >
      {fmtAge(age)}
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
    // sr-only must sit on a wrapper div: width:1px is only a minimum for
    // display:table elements, so a bare table stays content-sized and
    // stretches the page's scrollable area on narrow screens.
    <div className="sr-only">
      <table>
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
    </div>
  );
}
