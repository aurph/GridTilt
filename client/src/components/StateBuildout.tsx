import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { ErrorState } from "@/components/Freshness";
import { Skeleton } from "@/components/ui/skeleton";
import { BRAND, INK } from "@/lib/tokens";
import { STATE_GRID } from "@/data/state-grid";
import { homesEquivalent } from "@/lib/scale-compare";
import { byState, totalTrackedMW, shareOfTotal, type FacilityLike } from "@/lib/facility-aggregates";
import { filterTrackedFacilities } from "@/lib/real-gauges";

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
  const homes = active ? homesEquivalent(sites.reduce((s, f) => s + (f.annualMWh || 0), 0)) : null;

  return (
    <div className="border-t border-border px-4 sm:px-6 py-5" data-testid="state-buildout">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
        <span className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-foreground">Is your state in it?</h2>
        </span>
        <span className="text-11 text-muted-foreground/70">
          {rows.length > 0 ? `${rows.length} states have a tracked site` : ""}
        </span>
      </div>

      {isError ? (
        <ErrorState label="Facility data failed to load." onRetry={() => refetch()} className="py-4" />
      ) : isLoading ? (
        <div className="space-y-2 mt-3" aria-hidden="true">
          <Skeleton className="h-8 w-full rounded" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      ) : !active ? (
        <p className="text-xs text-muted-foreground py-4">No facilities in the tracked set.</p>
      ) : (
        <>
          {/* Horizontal scroll rather than wrapping, so the panel stays on screen. */}
          <div
            className="-mx-4 sm:-mx-6 px-4 sm:px-6 mt-3 flex gap-1.5 overflow-x-auto pb-2 scrollbar-none"
            role="group"
            aria-label="Pick a state"
          >
            {rows.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setPicked(r.key)}
                aria-pressed={r.key === active.key}
                className={`shrink-0 rounded-md border px-2.5 py-1.5 font-mono text-xs transition-colors ${
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

          <div className="mt-2 rounded-lg border border-subtle bg-surface-raised p-4" data-testid="state-panel">
            <p className="text-[15px] font-semibold leading-tight text-foreground">
              {grid?.name ?? active.key}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {active.count} tracked {active.count === 1 ? "site" : "sites"}
              {grid ? ` on ${grid.operatorLabel}` : ""}
            </p>

            <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-mono text-[26px] font-bold leading-none text-brand tabular-nums">
                {Math.round(active.totalMW).toLocaleString()} MW
              </span>
              {share !== null && (
                <span className="text-xs text-muted-foreground">
                  {share.toFixed(share < 10 ? 1 : 0)}% of all the power GridTilt tracks
                </span>
              )}
            </div>

            {/* Running and being built as one bar. */}
            {active.totalMW > 0 && (
              <>
                <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-surface-base" aria-hidden>
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
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-11">
                  <span className="text-muted-foreground">
                    <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: BRAND.primary }} />
                    {Math.round(active.runningMW).toLocaleString()} MW running
                  </span>
                  <span className="text-muted-foreground">
                    <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: BRAND.secondary }} />
                    {Math.round(active.buildingMW).toLocaleString()} MW being built
                  </span>
                </div>
              </>
            )}

            {homes !== null && (
              <p className="mt-3 text-xs text-muted-foreground">
                Run flat out, that is about the electricity{" "}
                <span className="font-mono text-foreground tabular-nums">
                  {homes.toLocaleString("en-US")}
                </span>{" "}
                US homes use in a year.
              </p>
            )}

            <ul className="mt-3 space-y-1 border-t border-subtle pt-3" data-testid="state-sites">
              {sites.slice(0, 4).map((f) => (
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
              {sites.length > 4 && (
                <li className="text-11 text-muted-foreground/60">
                  and {sites.length - 4} more in {grid?.name ?? active.key}
                </li>
              )}
            </ul>
            {active.unknownPower > 0 && (
              <p className="mt-2 text-10 text-muted-foreground/60">
                {active.unknownPower} site{active.unknownPower === 1 ? "" : "s"} here have no
                published power rating and are left out of the totals.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
