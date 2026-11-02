import type { ReactNode } from "react";

export interface BarSegment {
  /** Width as a percentage of the row, 0 to 100. Segments stack left to right. */
  pct: number;
  color: string;
}

interface BarRowProps {
  rank?: number;
  label: ReactNode;
  segments: BarSegment[];
  value: ReactNode;
  /** When set the row is a button and gets a hover state. */
  onClick?: () => void;
  expanded?: boolean;
  title?: string;
  /** Overrides the label column width, e.g. "w-32 sm:w-48" for long site names. */
  labelClassName?: string;
  testid?: string;
}

/**
 * One-line ranked bar: rank, label, bar, value. 28px tall so a list of eight
 * reads at a glance instead of taking a screen. The bar fills the space
 * between the label and the value, so density comes from the row, not the bar.
 */
export function BarRow({
  rank,
  label,
  segments,
  value,
  onClick,
  expanded,
  title,
  labelClassName = "w-28 sm:w-40",
  testid,
}: BarRowProps) {
  const inner = (
    <>
      {rank !== undefined && (
        <span className="w-4 shrink-0 font-mono text-10 text-muted-foreground/60 tabular-nums">
          {rank}
        </span>
      )}
      <span className={`${labelClassName} shrink-0 truncate text-xs text-foreground`}>{label}</span>
      <span
        className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-base"
        aria-hidden
      >
        {segments.map((s, i) => (
          <span
            key={i}
            className="h-full"
            style={{
              width: `${Math.max(0, Math.min(100, s.pct))}%`,
              backgroundColor: s.color,
            }}
          />
        ))}
      </span>
      <span className="w-[4.5rem] shrink-0 text-right font-mono text-xs text-foreground tabular-nums">
        {value}
      </span>
    </>
  );

  const base = "flex h-7 w-full items-center gap-2.5";

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-expanded={expanded}
        title={title}
        className={`${base} -mx-1 rounded px-1 text-left transition-colors hover:bg-surface-raised`}
        data-testid={testid}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className={base} title={title} data-testid={testid}>
      {inner}
    </div>
  );
}

/** Section shell shared by the five explainers under the map. */
export function ExplainerSection({
  icon,
  title,
  aside,
  span,
  testid,
  children,
}: {
  icon: ReactNode;
  title: string;
  aside?: ReactNode;
  /** Full width on desktop; the default is one of two columns. */
  span?: boolean;
  testid: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`border-t border-border px-4 sm:px-6 py-4 lg:odd:border-r ${span ? "lg:col-span-2 lg:odd:border-r-0" : ""}`}
      data-testid={testid}
    >
      <div className="mb-3 flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-2">
          <span className="text-brand [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        </span>
        {aside}
      </div>
      {children}
    </section>
  );
}
