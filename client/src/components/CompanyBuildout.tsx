import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronDown } from "lucide-react";
import { ErrorState } from "@/components/Freshness";
import { Skeleton } from "@/components/ui/skeleton";
import { BRAND } from "@/lib/tokens";
import { byCompany, totalTrackedMW, shareOfTotal, type FacilityLike } from "@/lib/facility-aggregates";

/**
 * "Who is actually building all this?"
 *
 * Names people already recognise, ranked by the power they have committed. The
 * running / being-built split rides on every bar because for several of these
 * companies the headline number is mostly announcement, and a single-length bar
 * would flatter them.
 *
 * Tapping a row opens that company's sites. Same /api/datacenters payload again.
 */

type Facility = FacilityLike;

export function CompanyBuildout() {
  const { data, isLoading, isError, refetch } = useQuery<Facility[]>({
    queryKey: ["/api/datacenters"],
  });

  const all = useMemo(() => data ?? [], [data]);
  const rows = useMemo(() => byCompany(all), [all]);
  const total = useMemo(() => totalTrackedMW(all), [all]);
  const max = rows[0]?.totalMW ?? 0;

  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="border-t border-border px-4 sm:px-6 py-5" data-testid="company-buildout">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
        <span className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-foreground">Who is building the most?</h2>
        </span>
        <span className="text-11 text-muted-foreground/70">Tap a name to see its sites</span>
      </div>

      {isError ? (
        <ErrorState label="Facility data failed to load." onRetry={() => refetch()} className="py-4" />
      ) : isLoading ? (
        <div className="space-y-2" aria-hidden="true">
          <Skeleton className="h-11 w-full rounded" />
          <Skeleton className="h-11 w-full rounded" />
          <Skeleton className="h-11 w-full rounded" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4">No facilities in the tracked set.</p>
      ) : (
        <>
          <ol className="space-y-1">
            {rows.map((r, i) => {
              const expanded = open === r.key;
              const share = shareOfTotal(r.totalMW, total);
              const sites = expanded
                ? all.filter((f) => f.company === r.key).sort((a, b) => b.powerMW - a.powerMW)
                : [];
              return (
                <li key={r.key}>
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : r.key)}
                    aria-expanded={expanded}
                    className="w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-raised"
                    data-testid={`company-row-${i}`}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="font-mono text-11 text-muted-foreground/60 tabular-nums">
                          {i + 1}
                        </span>
                        <span className="truncate text-xs font-medium text-foreground">{r.key}</span>
                        <ChevronDown
                          className={`h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform ${
                            expanded ? "rotate-180" : ""
                          }`}
                          aria-hidden
                        />
                      </span>
                      <span className="shrink-0 font-mono text-xs text-foreground tabular-nums">
                        {Math.round(r.totalMW).toLocaleString()} MW
                      </span>
                    </span>

                    <span className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-base" aria-hidden>
                      {/* Both segments scale against the leader, so bar length
                          compares across companies and the split compares within one. */}
                      <span
                        className="h-full"
                        style={{
                          width: `${max > 0 ? (r.runningMW / max) * 100 : 0}%`,
                          backgroundColor: BRAND.primary,
                        }}
                      />
                      <span
                        className="h-full"
                        style={{
                          width: `${max > 0 ? (r.buildingMW / max) * 100 : 0}%`,
                          backgroundColor: BRAND.secondary,
                        }}
                      />
                    </span>
                    <span className="mt-1 block text-10 text-muted-foreground/70">
                      {Math.round(r.runningMW).toLocaleString()} MW running ·{" "}
                      {Math.round(r.buildingMW).toLocaleString()} MW being built
                      {share !== null ? ` · ${share.toFixed(share < 10 ? 1 : 0)}% of tracked` : ""}
                    </span>
                  </button>

                  {expanded && (
                    <ul
                      className="mb-1 ml-6 space-y-1 border-l border-subtle pl-3"
                      data-testid={`company-sites-${i}`}
                    >
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
                  )}
                </li>
              );
            })}
          </ol>

          <p className="mt-3 text-10 leading-relaxed text-muted-foreground/70">
            Rated power of the sites GridTilt tracks at 400 MW and above, grouped by the company
            operating them. Sites a company leases rather than owns are attributed to the operator,
            so this reads as who runs the capacity, not who paid for it.
          </p>
        </>
      )}
    </div>
  );
}
