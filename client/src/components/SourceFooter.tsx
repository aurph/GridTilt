import type { ReactNode } from "react";
import { useRegistryDay } from "@/components/Freshness";

/**
 * One line under a chart or stat: where the number came from, what hour or
 * date it describes, and how often it refreshes. Every chart on the site
 * should end with one of these so a reader never has to guess which is a
 * live feed and which is a table someone typed in.
 *
 * `est` marks a modeled number: pass the short reason ("planned capacity as
 * announced, not metered") and the line reads "est." followed by it. A
 * published series or a count of registry rows never carries it.
 *
 * `asOf` is the data's own date, never when the page loaded. Pass it
 * preformatted so each surface controls the precision (an hour for live
 * demand, a month for retail rates, a year for annual series).
 */
export function SourceFooter({
  source,
  href,
  asOf,
  cadence,
  stale = false,
  est = false,
  children,
  className = "",
  testid = "source-footer",
}: {
  source: string;
  href?: string;
  asOf?: string | null;
  /** e.g. "refreshed every 30 min" or "updated with each EIA release". */
  cadence?: string;
  /** The latest refresh failed and this is the previous good fetch. */
  stale?: boolean;
  /** The number is modeled, not published: true, or how it is modeled. */
  est?: boolean | string;
  children?: ReactNode;
  className?: string;
  testid?: string;
}) {
  return (
    <p className={`text-10 leading-relaxed text-muted-foreground/70 ${className}`} data-testid={testid}>
      Source:{" "}
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand-2">
          {source}
        </a>
      ) : (
        <span className="text-muted-foreground">{source}</span>
      )}
      {asOf && (
        <>
          {" "}· as of <span className="font-mono tabular-nums text-muted-foreground">{asOf}</span>
        </>
      )}
      {cadence && <> · {cadence}</>}
      {est && (
        <>
          {" "}· <span className="text-muted-foreground" data-testid={`${testid}-est`}>est.</span>
          {typeof est === "string" ? ` ${est}` : ""}
        </>
      )}
      {stale && <> · <span className="text-warning">last refresh failed, showing the previous fetch</span></>}
      {children}
    </p>
  );
}

/**
 * SourceFooter for a number that comes from one of GridTilt's own registries:
 * the as-of date is the registry's own date (/api/data-status), so a chart
 * drawn from records reviewed in October says October. `source` defaults to
 * nothing: name the registry at the call site.
 */
export function RegistrySourceFooter({
  dataset,
  ...rest
}: { dataset: string } & Omit<Parameters<typeof SourceFooter>[0], "asOf">) {
  const day = useRegistryDay(dataset);
  return <SourceFooter {...rest} asOf={day} />;
}
