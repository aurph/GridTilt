import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Zap } from "lucide-react";
import { ErrorState } from "@/components/Freshness";
import { Skeleton } from "@/components/ui/skeleton";
import { CATEGORY_COLORS, INK } from "@/lib/tokens";
import {
  tallyEnergySources,
  classifiedSiteCount,
  classifyEnergySource,
  clusterPowerMW,
  ENERGY_LABELS,
  ENERGY_NOTES,
  type EnergySource,
} from "@/lib/energy-source";

/**
 * "What actually powers a data center?"
 *
 * Most coverage implies each site has a power source, usually a dramatic one.
 * The tracked set says otherwise: the large majority simply plug into the same
 * public grid everyone else uses, and the on-site gas and nuclear stories are
 * real but much smaller. That gap is the point of this section.
 *
 * Presented as counts, never as shares. A site routinely draws on more than one
 * source, so these bars overlap and do not sum to the site total. Rendering this
 * as a pie would invent a breakdown the data does not contain.
 */

interface Cluster {
  id: string;
  name: string;
  operator?: string | null;
  /** Structured on the wire, not a string. Rendering it directly crashes React. */
  location?: { city?: string; state?: string; lat?: number; lng?: number } | null;
  energySource?: string | null;
  ratedPowerMW?: number | null;
  plannedPowerMW?: number | null;
}

function placeOf(c: Cluster): string {
  const parts = [c.location?.city, c.location?.state].filter(Boolean);
  return parts.join(", ");
}

const SOURCE_COLOR: Record<EnergySource, string> = {
  grid: CATEGORY_COLORS.grid,
  gas: CATEGORY_COLORS.gas,
  nuclear: CATEGORY_COLORS.nuclear,
  solar: CATEGORY_COLORS.solar,
  wind: CATEGORY_COLORS.wind,
  battery: CATEGORY_COLORS.storage,
  hydro: CATEGORY_COLORS.hydro,
};

export function PowerSourceMix() {
  const { data, isLoading, isError, refetch } = useQuery<Cluster[]>({
    queryKey: ["/api/clusters"],
  });

  const all = useMemo(() => data ?? [], [data]);
  const tally = useMemo(() => tallyEnergySources(all), [all]);
  const classified = useMemo(() => classifiedSiteCount(all), [all]);
  const max = tally[0]?.siteCount ?? 0;

  const [open, setOpen] = useState<EnergySource | null>(null);
  const examples = useMemo(() => {
    if (!open) return [];
    return all
      .filter((c) => classifyEnergySource(c.energySource).includes(open))
      .sort((a, b) => clusterPowerMW(b).mw - clusterPowerMW(a).mw)
      .slice(0, 5);
  }, [all, open]);

  return (
    <div className="border-t border-border px-4 sm:px-6 py-5" data-testid="power-source-mix">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
        <span className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-foreground">What actually powers them?</h2>
        </span>
        <span className="text-11 text-muted-foreground/70">Tap a source for examples</span>
      </div>

      {isError ? (
        <ErrorState label="Cluster data failed to load." onRetry={() => refetch()} className="py-4" />
      ) : isLoading ? (
        <div className="space-y-2 mt-3" aria-hidden="true">
          <Skeleton className="h-9 w-full rounded" />
          <Skeleton className="h-9 w-full rounded" />
          <Skeleton className="h-9 w-full rounded" />
        </div>
      ) : tally.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4">
          No power sources are recorded on the tracked compute sites.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Of the{" "}
            <span className="font-mono text-foreground tabular-nums">{classified}</span> tracked
            compute clusters with a recorded power source, this is how many draw on each. Sites
            often use more than one, so these do not add up to {classified}.
          </p>

          <ul className="mt-3 space-y-1">
            {tally.map((t) => {
              const expanded = open === t.source;
              return (
                <li key={t.source}>
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : t.source)}
                    aria-expanded={expanded}
                    className="w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-raised"
                    data-testid={`source-row-${t.source}`}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-xs text-foreground">
                        {ENERGY_LABELS[t.source]}
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">
                        {t.siteCount}
                        <span className="text-muted-foreground/60"> sites</span>
                      </span>
                    </span>
                    <span className="mt-1 block h-2 w-full rounded-full bg-surface-base" aria-hidden>
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${max > 0 ? (t.siteCount / max) * 100 : 0}%`,
                          backgroundColor: SOURCE_COLOR[t.source],
                        }}
                      />
                    </span>
                    <span className="mt-1 block text-10 leading-snug text-muted-foreground/70">
                      {ENERGY_NOTES[t.source]}
                    </span>
                  </button>

                  {expanded && (
                    <ul
                      className="mb-1 ml-2 space-y-1 border-l border-subtle pl-3"
                      data-testid={`source-examples-${t.source}`}
                    >
                      {examples.map((c) => {
                        const place = placeOf(c);
                        const { mw, basis } = clusterPowerMW(c);
                        return (
                          <li key={c.id} className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 truncate text-11 text-muted-foreground">
                              {c.name}
                              {place ? (
                                <span className="text-muted-foreground/60"> · {place}</span>
                              ) : null}
                            </span>
                            <span
                              className="shrink-0 font-mono text-10 tabular-nums"
                              style={{ color: INK.muted }}
                            >
                              {basis === null
                                ? "MW not published"
                                : `${mw.toLocaleString()} MW${basis === "planned" ? " planned" : ""}`}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="mt-3 text-10 leading-relaxed text-muted-foreground/70">
            Read from the curated power description on each tracked compute cluster. This is the
            wider cluster dataset behind Compute Frontier, not the 400 MW and above facilities
            mapped above, so the counts are larger. A site counts once for every source its
            description mentions, which is why the counts overlap. Nuclear includes small reactors
            that are contracted but not yet built.
          </p>
        </>
      )}
    </div>
  );
}
