import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { ErrorState } from "@/components/Freshness";
import { Skeleton } from "@/components/ui/skeleton";
import { BRAND } from "@/lib/tokens";
import { byCompany, totalTrackedMW, shareOfTotal, type FacilityLike } from "@/lib/facility-aggregates";
import { filterTrackedFacilities } from "@/lib/real-gauges";
import { BarRow, ExplainerSection } from "@/components/BarRow";

/**
 * Tracked facilities by operating company, ranked by power.
 *
 * Every bar carries the running / being-built split: for several of these
 * companies the total is mostly announcement, which a single bar would hide.
 */

type Facility = FacilityLike;

export function CompanyBuildout() {
  const { data, isLoading, isError, refetch } = useQuery<Facility[]>({
    queryKey: ["/api/datacenters"],
  });

  const all = useMemo(() => filterTrackedFacilities(data ?? []), [data]);
  const rows = useMemo(() => byCompany(all), [all]);
  const total = useMemo(() => totalTrackedMW(all), [all]);
  const max = rows[0]?.totalMW ?? 0;

  const [open, setOpen] = useState<string | null>(null);

  return (
    <ExplainerSection
      icon={<Building2 />}
      title="Who is building the most?"
      testid="company-buildout"
      aside={
        <span className="flex flex-wrap items-center gap-x-3 text-10 text-muted-foreground/70">
          <span>
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: BRAND.primary }} />
            running
          </span>
          <span>
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: BRAND.secondary }} />
            being built
          </span>
          <span>Tap a name for its sites</span>
        </span>
      }
    >
      {isError ? (
        <ErrorState label="Facility data failed to load." onRetry={() => refetch()} className="py-4" />
      ) : isLoading ? (
        <div className="space-y-2" aria-hidden="true">
          <Skeleton className="h-7 w-full rounded" />
          <Skeleton className="h-7 w-full rounded" />
          <Skeleton className="h-7 w-full rounded" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4">No facilities in the tracked set.</p>
      ) : (
        <>
          <ol>
            {rows.map((r, i) => {
              const expanded = open === r.key;
              const share = shareOfTotal(r.totalMW, total);
              const sites = expanded
                ? all.filter((f) => f.company === r.key).sort((a, b) => b.powerMW - a.powerMW)
                : [];
              const detail = `${Math.round(r.runningMW).toLocaleString()} MW running · ${Math.round(
                r.buildingMW,
              ).toLocaleString()} MW being built${
                share !== null ? ` · ${share.toFixed(share < 10 ? 1 : 0)}% of tracked` : ""
              }`;
              return (
                <li key={r.key}>
                  <BarRow
                    rank={i + 1}
                    label={r.key}
                    segments={[
                      { pct: max > 0 ? (r.runningMW / max) * 100 : 0, color: BRAND.primary },
                      { pct: max > 0 ? (r.buildingMW / max) * 100 : 0, color: BRAND.secondary },
                    ]}
                    value={`${Math.round(r.totalMW).toLocaleString()} MW`}
                    onClick={() => setOpen(expanded ? null : r.key)}
                    expanded={expanded}
                    title={detail}
                    testid={`company-row-${i}`}
                  />

                  {expanded && (
                    <div className="mb-2 ml-6 border-l border-subtle pl-3" data-testid={`company-sites-${i}`}>
                      <p className="mb-1 text-10 text-muted-foreground/70">{detail}</p>
                      <ul className="space-y-0.5">
                        {sites.map((f) => (
                          <li key={f.id} className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 truncate text-11 text-muted-foreground">
                              {f.name}
                              <span className="text-muted-foreground/60">
                                {" "}
                                · {f.city}, {f.state}
                              </span>
                            </span>
                            <span className="shrink-0 font-mono text-10 text-muted-foreground tabular-nums">
                              {f.powerMW.toLocaleString()} MW
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          <p className="mt-2 text-10 leading-relaxed text-muted-foreground/70">
            Rated power of the sites GridTilt tracks at 400 MW and above, grouped by the company
            operating them. Leased sites are attributed to the operator, so this reads as who runs
            the capacity, not who paid for it.
          </p>
        </>
      )}
    </ExplainerSection>
  );
}
