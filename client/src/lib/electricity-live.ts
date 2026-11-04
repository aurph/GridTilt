import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DATA_CENTER_ANCHORS,
  US_END_USE_SOURCE,
  electricityData,
  type ElectricityYear,
} from "@/data/electricity-demand";
import { US_SECTOR_DEMAND, US_SECTOR_SOURCE, sectorTotalTWh, type Sector } from "@/lib/sector-demand";

/**
 * Client side of /api/physical/electricity-use (server/eia-electricity.ts).
 *
 * The static tables in data/electricity-demand.ts and lib/sector-demand.ts are
 * now the fallback, not the source: the page renders from them immediately,
 * swaps to EIA's rows when they arrive, and keeps them, labelled with their
 * retrieval date, if the feed is down or the key is missing.
 */

export interface PeriodFigures {
  period: string;
  retailTotalTwh: number;
  sectors: Sector[];
}

export interface RollingFigures extends PeriodFigures {
  through: string;
  endUseTwh: number;
  endUseYoy: number;
  retailYoy: number;
}

export type ElectricityUse =
  | { configured: false; howTo: string }
  | {
      configured: true;
      source: string;
      sourceUrl: string;
      retrievedAt: string;
      stale: boolean;
      endUse: Array<{ year: string; twh: number }>;
      annual: PeriodFigures | null;
      rolling: RollingFigures | null;
    };

/** "2026-07" -> "Jul 2026". */
export function fmtMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Annual end use with the data-center report years attached. */
export function toElectricityYears(endUse: Array<{ year: string; twh: number }>): ElectricityYear[] {
  return endUse.map(({ year, twh }) => ({
    year,
    demand: twh,
    dcDemand: DATA_CENTER_ANCHORS.find((a) => a.year === year)?.twh ?? null,
  }));
}

export interface ElectricityView {
  /** True once EIA's own rows are on screen. */
  live: boolean;
  stale: boolean;
  series: ElectricityYear[];
  sectors: Sector[];
  sectorTotal: number;
  /** "12 months through Jul 2026" or "2025". */
  sectorPeriod: string;
  sourceLabel: string;
  sourceUrl: string;
  /** How the footnote dates the data: a data month when live, a retrieval date when not. */
  asOf: string;
  rolling: RollingFigures | null;
}

/** Pure, for tests: choose EIA's rows where they exist, the static tables where not. */
export function electricityView(data: ElectricityUse | undefined): ElectricityView {
  const live = data && data.configured && data.endUse.length > 0 ? data : null;
  const period = live?.rolling ?? live?.annual ?? null;
  return {
    live: Boolean(live),
    stale: live?.stale ?? false,
    series: live ? toElectricityYears(live.endUse) : electricityData,
    sectors: period?.sectors ?? US_SECTOR_DEMAND,
    sectorTotal: period?.retailTotalTwh ?? sectorTotalTWh(),
    sectorPeriod: live?.rolling
      ? `12 months through ${fmtMonth(live.rolling.through)}`
      : (live?.annual?.period ?? String(US_SECTOR_SOURCE.year)),
    sourceLabel: live ? live.source : US_END_USE_SOURCE.label,
    sourceUrl: live ? live.sourceUrl : US_END_USE_SOURCE.url,
    asOf: live?.rolling
      ? `data through ${fmtMonth(live.rolling.through)}`
      : live
        ? `data through ${live.endUse[live.endUse.length - 1].year}`
        : `retrieved ${US_END_USE_SOURCE.retrieved}`,
    rolling: live?.rolling ?? null,
  };
}

export function useElectricityUse(): ElectricityView {
  const { data } = useQuery<ElectricityUse>({
    queryKey: ["/api/physical/electricity-use"],
    // 503 is an honest "not configured" payload, not a failure.
    queryFn: async () => {
      const res = await fetch("/api/physical/electricity-use");
      if (!res.ok && res.status !== 503) throw new Error(`electricity-use ${res.status}`);
      return res.json();
    },
    staleTime: 6 * 60 * 60 * 1000,
    retry: false,
  });
  return useMemo(() => electricityView(data), [data]);
}
