import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { ErrorState } from "@/components/Freshness";
import { Skeleton } from "@/components/ui/skeleton";
import { BRAND } from "@/lib/tokens";
import { byYear, parseOpenYear, type FacilityLike } from "@/lib/facility-aggregates";
import { filterTrackedFacilities } from "@/lib/real-gauges";
import { ExplainerSection } from "@/components/BarRow";

/**
 * Tracked capacity by opening year.
 *
 * Quiet years stay on the axis as zero bars; dropping them would compress the
 * gap between the 2010s and 2026-27. Years with nothing running are drawn in
 * amber and badged as targets, since an announced date is a schedule, not a record.
 */

type Facility = FacilityLike;

export function BuildoutTimeline() {
  const { data, isLoading, isError, refetch } = useQuery<Facility[]>({
    queryKey: ["/api/datacenters"],
  });

  const all = useMemo(() => filterTrackedFacilities(data ?? []), [data]);
  const years = useMemo(() => byYear(all), [all]);
  const peak = useMemo(() => years.reduce((m, y) => Math.max(m, y.arrivingMW), 0), [years]);

  // Default selection: the heaviest year.
  const busiest = useMemo(() => {
    let year: number | null = null;
    let mw = -1;
    for (const y of years) {
      if (y.arrivingMW > mw) {
        mw = y.arrivingMW;
        year = y.year;
      }
    }
    return year;
  }, [years]);
  const [picked, setPicked] = useState<number | null>(null);
  const activeYear = picked ?? busiest;
  const active = years.find((y) => y.year === activeYear) ?? null;

  const sites = useMemo(
    () =>
      active
        ? all
            .filter((f) => parseOpenYear(f.openDate) === active.year)
            .sort((a, b) => b.powerMW - a.powerMW)
        : [],
    [all, active],
  );

  return (
    <ExplainerSection
      icon={<CalendarClock />}
      title="When does it all arrive?"
      testid="buildout-timeline"
      aside={<span className="text-11 text-muted-foreground/70">Tap a year</span>}
    >
      {isError ? (
        <ErrorState label="Facility data failed to load." onRetry={() => refetch()} className="py-4" />
      ) : isLoading ? (
        <div className="space-y-2" aria-hidden="true">
          <Skeleton className="h-16 w-full rounded" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      ) : years.length === 0 || !active ? (
        <p className="text-xs text-muted-foreground py-4">
          No opening dates are recorded on the tracked facilities.
        </p>
      ) : (
        <>
          {/* Full-height buttons: the bar itself is a few pixels wide on a phone. */}
          <div className="flex h-16 items-end gap-px" role="group" aria-label="Pick a year">
            {years.map((y) => {
              const selected = y.year === active.year;
              return (
                <button
                  key={y.year}
                  type="button"
                  onClick={() => setPicked(y.year)}
                  aria-pressed={selected}
                  title={`${y.year}: ${Math.round(y.arrivingMW).toLocaleString()} MW`}
                  className="group flex h-full min-w-0 flex-1 flex-col justify-end"
                  data-testid={`year-col-${y.year}`}
                >
                  <span
                    className="w-full rounded-sm transition-opacity"
                    style={{
                      // 2% floor keeps an empty year visible as a baseline tick.
                      height: `${peak > 0 ? Math.max((y.arrivingMW / peak) * 100, 2) : 2}%`,
                      backgroundColor: y.allPlanned ? BRAND.secondary : BRAND.primary,
                      opacity: selected ? 1 : 0.45,
                    }}
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between font-mono text-10 text-muted-foreground/60">
            <span>{years[0].year}</span>
            <span>{years[years.length - 1].year}</span>
          </div>

          <div className="mt-2 rounded-lg border border-subtle bg-surface-raised px-3 py-2" data-testid="year-panel">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-[22px] font-bold leading-none text-brand tabular-nums">
                {active.year}
              </span>
              <span className="text-xs text-muted-foreground">
                {active.count === 0
                  ? "nothing tracked opened this year"
                  : `${Math.round(active.arrivingMW).toLocaleString()} MW across ${active.count} ${
                      active.count === 1 ? "site" : "sites"
                    }`}
              </span>
              {active.allPlanned && (
                <span className="rounded-sm border border-brand-2/40 px-1.5 py-0.5 font-mono text-10 uppercase tracking-wider text-brand-2">
                  target
                </span>
              )}
              <span className="ml-auto text-11 text-muted-foreground">
                open by end of {active.year}:{" "}
                <span className="font-mono text-foreground tabular-nums">
                  {Math.round(active.cumulativeMW).toLocaleString()} MW
                </span>
              </span>
            </div>

            {sites.length > 0 && (
              <ul className="mt-2 space-y-0.5 border-t border-subtle pt-2" data-testid="year-sites">
                {sites.slice(0, 3).map((f) => (
                  <li key={f.id} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-xs text-foreground">
                      {f.name}
                      <span className="text-muted-foreground/70">
                        {" "}
                        · {f.city}, {f.state}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-11 text-muted-foreground tabular-nums">
                      {f.powerMW.toLocaleString()} MW
                    </span>
                  </li>
                ))}
                {sites.length > 3 && (
                  <li className="text-11 text-muted-foreground/60">
                    and {sites.length - 3} more opening in {active.year}
                  </li>
                )}
              </ul>
            )}
          </div>

          <p className="mt-2 text-10 leading-relaxed text-muted-foreground/70">
            Grouped by the year each tracked site opened or is expected to. Amber years are targets
            drawn from announced and under-construction schedules, so they move. Totals cover only
            the sites GridTilt tracks at 400 MW and above.
          </p>
        </>
      )}
    </ExplainerSection>
  );
}
