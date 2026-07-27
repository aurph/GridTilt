/**
 * Editorial primitives: the shared grammar every page speaks after the
 * warm-paper redesign. Real page titles, ruled sections, provenance lines,
 * pull stats. Spec: docs/superpowers/specs/2026-07-23-editorial-redesign-design.md
 */
import type { ReactNode } from "react";

/** Standard content container: one measure for every page. */
export function PageShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto px-5 sm:px-8 pb-12 ${wide ? "max-w-[1360px]" : "max-w-[1200px]"}`}>
      {children}
    </div>
  );
}

/**
 * The page lead: serif display title + one dek sentence. The dek replaces
 * the old info-popover; if a page needs more than a sentence of framing it
 * links to methodology instead of narrating in chrome.
 */
export function PageTitle({
  title,
  dek,
  right,
  testId,
}: {
  title: string;
  dek?: ReactNode;
  right?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="pt-7 sm:pt-9 pb-4 border-b border-rule mb-5" data-testid={testId}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-serif font-medium text-[30px] sm:text-[36px] leading-[1.05] tracking-tight text-ink">
            {title}
          </h1>
          {dek && (
            <p className="mt-2 max-w-[68ch] font-serif italic text-[15.5px] sm:text-[16.5px] leading-snug text-ink-secondary">
              {dek}
            </p>
          )}
        </div>
        {right && <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-1">{right}</div>}
      </div>
    </div>
  );
}

/** Ruled section band: sentence-case head over a hairline, meta on the right. */
export function RuleSection({
  head,
  aside,
  children,
  className = "",
  testId,
}: {
  head: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section className={`mt-8 ${className}`} data-testid={testId}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule-strong pb-1.5 mb-4">
        <h2 className="text-[17px] font-semibold leading-tight text-ink">{head}</h2>
        {aside && <div className="flex items-baseline gap-3 text-[12.5px] text-ink-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * Provenance line: the custody chain under a chart, table, or stat.
 * "Source: X · Updated Y". The single strongest crafted-vs-generated
 * signal - every data artifact carries one.
 */
export function Provenance({
  source,
  updated,
  href,
  extra,
  className = "",
}: {
  source: string;
  updated?: string;
  href?: string;
  extra?: ReactNode;
  className?: string;
}) {
  return (
    <p className={`mt-2 text-[12.5px] leading-relaxed text-ink-muted ${className}`} data-testid="provenance">
      Source:{" "}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink-muted underline decoration-rule-strong underline-offset-2 hover:text-brand-ink"
        >
          {source}
        </a>
      ) : (
        source
      )}
      {updated && <> · Updated {updated}</>}
      {extra && <> · {extra}</>}
    </p>
  );
}

/** Big number in the lead band: serif figure, sans label, optional delta. */
export function PullStat({
  label,
  value,
  delta,
  note,
  testId,
}: {
  label: string;
  value: string;
  delta?: ReactNode;
  note?: string;
  testId?: string;
}) {
  return (
    <div data-testid={testId}>
      <p className="text-[13px] leading-tight text-ink-secondary">{label}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="font-serif font-medium text-[28px] sm:text-[32px] leading-none text-ink tnum">
          {value}
        </span>
        {delta}
      </p>
      {note && <p className="mt-1 text-[12px] leading-snug text-ink-muted">{note}</p>}
    </div>
  );
}

/**
 * Footnote marker for estimated values: the ochre dagger. Pair with a
 * footnote line ("† estimated") near the table's provenance.
 */
export function EstFlag({ title = "Estimated value" }: { title?: string }) {
  return (
    <sup className="text-warning font-semibold cursor-default select-none" title={title} aria-label={title}>
      †
    </sup>
  );
}
