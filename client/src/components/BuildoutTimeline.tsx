import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { ErrorState } from "@/components/Freshness";
import { Skeleton } from "@/components/ui/skeleton";
import { BRAND } from "@/lib/tokens";
import { byYear, parseOpenYear, type FacilityLike } from "@/lib/facility-aggregates";
import { filterTrackedFacilities } from "@/lib/real-gauges";

/**
 * "When does all of this actually arrive?"
 *
 * The buildout is usually described as a trend, which hides how abrupt it is.
 * Laid out by opening year, the tracked set puts more power on the grid in 2026
 * and 2027 than in the two decades before them combined. That shape is the
 * answer, and it only reads if the quiet years stay on the axis.
 *
 * Everything from 2026 on is a target date rather than a record, and the bars
 * say which is which instead of leaving one ramp that implies equal confidence.
 */

type Facility = FacilityLike;

export function BuildoutTimeline() {
  const { data, isLoading, isError, refetch } = useQuery<Facility[]>({
    queryKey: ["/api/datacenters"],
  });

  // The same >=400 MW floor the map above uses, so this section counts the same
  // sites the page counts.
  const all = useMemo(() => filterTrackedFacilities(data ?? []), [data]);
  const years = useMemo(() => byYear(all), [all]);
  const peak = useMemo(() => years.reduce((m, y) => Math.max(m, y.arrivingMW), 0), [years]);

  // Open on the heaviest year, because that is the point of the section.
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
    <div className="border-t border-border px-4 sm:px-6 py-5" data-testid="buildout-timeline">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
        <span className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-foreground">When does it all arrive?</h2>
        </span>
        <span className="text-11 text-muted-foreground/70">Tap a year</span>
      </div>

      {isError ? (
        <ErrorState label="Facility data failed to load." onRetry={() => refetch()} className="py-4" />
      ) : isLoading ? (
        <div className="space-y-2 mt-3" aria-hidden="true">
          <Skeleton className="h-24 w-full rounded" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      ) : years.length === 0 || !active ? (
        <p className="text-xs text-muted-foreground py-4">
          No opening dates are recorded on the tracked facilities.
        </p>
      ) : (
        <>
          {/* Each year is a full-height button so the tap target is the column,
              not the bar, which on a phone is only a few pixels wide. */}
          <div className="mt-3 flex h-24 items-end gap-px" role="group" aria-label="Pick a year">
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
                      // A floor of 2px keeps an empty year visible as a baseline
                      // tick rather than vanishing into the gap.
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

          <div className="mt-3 rounded-lg border border-subtle bg-surface-raised p-4" data-testid="year-panel">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-[26px] font-bold leading-none text-brand tabular-nums">
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
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Tracked capacity open by the end of {active.year}:{" "}
              <span className="font-mono text-foreground tabular-nums">
                {Math.round(active.cumulativeMW).toLocaleString()} MW
              </span>
            </p>

            {sites.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-subtle pt-3" data-testid="year-sites">
                {sites.slice(0, 4).map((f) => (
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
                {sites.length > 4 && (
                  <li className="text-11 text-muted-foreground/60">
                    and {sites.length - 4} more opening in {active.year}
                  </li>
                )}
              </ul>
            )}
          </div>

          <p className="mt-3 text-10 leading-relaxed text-muted-foreground/70">
            Grouped by the year each tracked site opened or is expected to. Amber years are targets
            drawn from announced and under-construction schedules, so they move. Cumulative totals
            cover only the sites GridTilt tracks at 400 MW and above, not all US capacity.
          </p>
        </>
      )}
    </div>
  );
}
