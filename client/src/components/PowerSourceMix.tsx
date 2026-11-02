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
import { BarRow, ExplainerSection } from "@/components/BarRow";

/**
 * Power sources across the tracked compute clusters.
 *
 * Counts, not shares. A cluster can list several sources, so the bars overlap and
 * do not sum to the cluster count; a pie would invent a breakdown the data has not
 * got. Reads the cluster dataset, which is wider than the mapped facilities.
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
    <ExplainerSection
      icon={<Zap />}
      title="What actually powers them?"
      testid="power-source-mix"
      span
      aside={
        <span className="text-11 text-muted-foreground/70">
          {classified > 0
            ? `Sources named on ${classified} tracked compute clusters. Sites often use more than one, so counts overlap. Tap a source for examples.`
            : "Tap a source for examples"}
        </span>
      }
    >
      {isError ? (
        <ErrorState label="Cluster data failed to load." onRetry={() => refetch()} className="py-4" />
      ) : isLoading ? (
        <div className="space-y-2" aria-hidden="true">
          <Skeleton className="h-7 w-full rounded" />
          <Skeleton className="h-7 w-full rounded" />
          <Skeleton className="h-7 w-full rounded" />
        </div>
      ) : tally.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4">
          No power sources are recorded on the tracked compute sites.
        </p>
      ) : (
        <>
          <ul className="grid gap-x-10 sm:grid-cols-2">
            {tally.map((t) => {
              const expanded = open === t.source;
              return (
                <li key={t.source} className={expanded ? "sm:col-span-2" : undefined}>
                  <BarRow
                    label={ENERGY_LABELS[t.source]}
                    segments={[{ pct: max > 0 ? (t.siteCount / max) * 100 : 0, color: SOURCE_COLOR[t.source] }]}
                    value={
                      <>
                        {t.siteCount}
                        <span className="text-muted-foreground/60"> sites</span>
                      </>
                    }
                    onClick={() => setOpen(expanded ? null : t.source)}
                    expanded={expanded}
                    title={ENERGY_NOTES[t.source]}
                    testid={`source-row-${t.source}`}
                  />

                  {expanded && (
                    <div className="mb-2 ml-2 border-l border-subtle pl-3" data-testid={`source-examples-${t.source}`}>
                      <p className="mb-1 text-10 text-muted-foreground/70">{ENERGY_NOTES[t.source]}</p>
                      <ul className="space-y-0.5">
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
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="mt-2 text-10 leading-relaxed text-muted-foreground/70">
            Read from the curated power description on each tracked compute cluster, the wider
            dataset behind Compute Frontier, not only the 400 MW and above facilities mapped above.
            A site counts once for every source its description mentions. Nuclear includes small
            reactors that are contracted but not yet built.
          </p>
        </>
      )}
    </ExplainerSection>
  );
}
