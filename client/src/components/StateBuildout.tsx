import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { ErrorState } from "@/components/Freshness";
import { Skeleton } from "@/components/ui/skeleton";
import { BRAND, INK } from "@/lib/tokens";
import { STATE_GRID } from "@/data/state-grid";
import { byState, totalTrackedMW, shareOfTotal, type FacilityLike } from "@/lib/facility-aggregates";
import { filterTrackedFacilities } from "@/lib/real-gauges";
import { ExplainerSection } from "@/components/BarRow";

/**
 * Tracked facilities by state.
 *
 * Only states present in the tracked set get a chip. Listing all 50 would imply
 * coverage that does not exist, and empty states would read as "nothing here"
 * rather than "not tracked".
 */

type Facility = FacilityLike;

export function StateBuildout() {
  const { data, isLoading, isError, refetch } = useQuery<Facility[]>({
    queryKey: ["/api/datacenters"],
  });

  const all = useMemo(() => filterTrackedFacilities(data ?? []), [data]);
  const rows = useMemo(() => byState(all), [all]);
  const total = useMemo(() => totalTrackedMW(all), [all]);

  const [picked, setPicked] = useState<string | null>(null);
  // Default to the biggest state rather than an empty panel, so the section
  // answers something before it is touched.
  const active = rows.find((r) => r.key === picked) ?? rows[0];

  const sites = useMemo(
    () =>
      active
        ? all
            .filter((f) => f.state === active.key)
            .sort((a, b) => b.powerMW - a.powerMW)
        : [],
    [all, active],
  );

  const share = active ? shareOfTotal(active.totalMW, total) : null;
  const grid = active ? STATE_GRID[active.key] : undefined;

  return (
    <ExplainerSection
      icon={<MapPin />}
      title="Is your state in it?"
      testid="state-buildout"
      aside={
        <span className="text-11 text-muted-foreground/70">
          {rows.length > 0 ? `${rows.length} states have a tracked site` : ""}
        </span>
      }
    >
      {isError ? (
        <ErrorState label="Facility data failed to load." onRetry={() => refetch()} className="py-4" />
      ) : isLoading ? (
        <div className="space-y-2" aria-hidden="true">
          <Skeleton className="h-7 w-full rounded" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ) : !active ? (
        <p className="text-xs text-muted-foreground py-4">No facilities in the tracked set.</p>
      ) : (
        <>
          {/* Horizontal scroll rather than wrapping, so the panel stays on screen. */}
          <div
            className="-mx-4 sm:-mx-6 px-4 sm:px-6 flex gap-1 overflow-x-auto pb-1.5 scrollbar-none"
            role="group"
            aria-label="Pick a state"
          >
            {rows.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setPicked(r.key)}
                aria-pressed={r.key === active.key}
                className={`shrink-0 rounded-md border px-2 py-1 font-mono text-11 transition-colors ${
                  r.key === active.key
                    ? "border-brand bg-brand text-black font-semibold"
                    : "border-subtle bg-surface-raised text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`state-chip-${r.key}`}
              >
                {r.key}
              </button>
            ))}
          </div>

          <div className="mt-1.5 rounded-lg border border-subtle bg-surface-raised px-3 py-2" data-testid="state-panel">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[15px] font-semibold leading-tight text-foreground">
                  {grid?.name ?? active.key}
                </span>
                <span className="ml-2 text-11 text-muted-foreground">
                  {active.count} tracked {active.count === 1 ? "site" : "sites"}
                  {grid ? ` on ${grid.operatorLabel}` : ""}
                </span>
              </div>
              <span className="shrink-0 font-mono text-[22px] font-bold leading-none text-brand tabular-nums">
                {Math.round(active.totalMW).toLocaleString()} MW
              </span>
            </div>

            {/* Running and being built as one bar. */}
            {active.totalMW > 0 && (
              <>
                <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-base" aria-hidden>
                  <span
                    className="h-full"
                    style={{
                      width: `${(active.runningMW / active.totalMW) * 100}%`,
                      backgroundColor: BRAND.primary,
                    }}
                  />
                  <span
                    className="h-full"
                    style={{
                      width: `${(active.buildingMW / active.totalMW) * 100}%`,
                      backgroundColor: BRAND.secondary,
                    }}
                  />
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-10 text-muted-foreground">
                  <span>
                    <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: BRAND.primary }} />
                    {Math.round(active.runningMW).toLocaleString()} MW running
                  </span>
                  <span>
                    <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: BRAND.secondary }} />
                    {Math.round(active.buildingMW).toLocaleString()} MW being built
                  </span>
                  {share !== null && <span>{share.toFixed(share < 10 ? 1 : 0)}% of tracked</span>}
                </div>
              </>
            )}

            <ul className="mt-2 space-y-0.5 border-t border-subtle pt-2" data-testid="state-sites">
              {sites.slice(0, 3).map((f) => (
                <li key={f.id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-xs text-foreground">
                    {f.name}
                    <span className="text-muted-foreground/70"> · {f.company}</span>
                  </span>
                  <span className="shrink-0 font-mono text-11 tabular-nums" style={{ color: f.status === "operational" ? INK.primary : INK.muted }}>
                    {f.powerMW.toLocaleString()} MW
                  </span>
                </li>
              ))}
              {sites.length > 3 && (
                <li className="text-11 text-muted-foreground/60">
                  and {sites.length - 3} more in {grid?.name ?? active.key}
                </li>
              )}
            </ul>
            {active.unknownPower > 0 && (
              <p className="mt-1.5 text-10 text-muted-foreground/60">
                {active.unknownPower} site{active.unknownPower === 1 ? "" : "s"} here have no
                published power rating and are left out of the totals.
              </p>
            )}
          </div>
        </>
      )}
    </ExplainerSection>
  );
}
