import { useQuery } from "@tanstack/react-query";

/**
 * Client side of /api/physical/grid-live (server/eia-grid.ts): EIA hourly
 * demand for the lower 48 and each grid operator, plus generation by fuel
 * for the latest hour. One hook, one payload, every page reads the same copy.
 */

export interface HourPoint {
  /** EIA period, UTC hour, e.g. "2026-11-03T16". */
  t: string;
  mw: number;
}

export interface OperatorDemand {
  label: string;
  respondents: string[];
  composed: boolean;
  note: string;
  latestMw: number;
  latestPeriodUtc: string;
  peakMw: number;
  peakPeriodUtc: string;
  minMw: number;
  points: HourPoint[];
}

export interface FuelShare {
  code: string;
  label: string;
  mw: number;
  sharePct: number;
}

export interface GenerationMix {
  periodUtc: string;
  totalMw: number;
  fuels: FuelShare[];
}

export type GridLive =
  | { configured: false; howTo: string }
  | {
      configured: true;
      source: string;
      sourceUrl: string;
      retrievedAt: string;
      stale: boolean;
      latestPeriodUtc: string | null;
      demand: Record<string, OperatorDemand>;
      mix: GenerationMix | null;
    };

export type GridLiveConfigured = Extract<GridLive, { configured: true }>;

export function useGridLive() {
  const q = useQuery<GridLive>({
    queryKey: ["/api/physical/grid-live"],
    // 503 is an honest "not configured" payload, not a failure.
    queryFn: async () => {
      const res = await fetch("/api/physical/grid-live");
      if (!res.ok && res.status !== 503) throw new Error(`grid-live ${res.status}`);
      return res.json();
    },
    staleTime: 15 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  });
  const live = q.data && q.data.configured ? q.data : null;
  return { ...q, live };
}

/** "2026-11-03T16" -> Date for the start of that UTC hour. */
export function periodToDate(period: string): Date {
  return new Date(`${period}:00:00Z`);
}

/** "4 PM ET, Nov 3" for an EIA period. */
export function fmtPeriodET(period: string): string {
  const d = periodToDate(period);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", timeZone: "America/New_York" });
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
  return `${time} ET, ${day}`;
}

/** 459058 -> "459.1" (gigawatts, one decimal). */
export function fmtGW(mw: number, digits = 1): string {
  return (mw / 1000).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/**
 * Tracked AI load as a share of what the grid is carrying right now. The
 * registry's MW is nameplate, not metered draw, so this is "if every tracked
 * site pulled its full rating this hour", and copy must say so.
 */
export function aiSharePct(trackedMw: number, demandMw: number): number | null {
  if (!Number.isFinite(trackedMw) || !Number.isFinite(demandMw) || demandMw <= 0) return null;
  return Math.round((trackedMw / demandMw) * 1000) / 10;
}

/** Axis bounds for a sparkline that is not drawn from zero: a little air each side. */
export function sparkAxis(points: HourPoint[]): { min: number; max: number } {
  if (points.length === 0) return { min: 0, max: 1 };
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    if (p.mw < min) min = p.mw;
    if (p.mw > max) max = p.mw;
  }
  const pad = Math.max(1, (max - min) * 0.08);
  return { min: Math.floor(min - pad), max: Math.ceil(max + pad) };
}
