/**
 * Real headline gauges (owner-directed replacement for the synthetic
 * AI Power Demand / NPI / Grid Stress indices). Every number here is a
 * direct computation over sourced data - no baselines, no rebasing, no
 * sentiment formulas. Pure module, 100% covered in Lake-8 style.
 *
 * Sources:
 * - Tracked AI DC power: the verified facility dataset (/api/datacenters)
 * - Cost of AI compute: the GPU rental index (/api/gpu-prices/metrics)
 * - Grid headroom: NERC LTRA reserve margins (data/rto-config)
 */
import type { RTOConfig } from "@/data/rto-config";

/**
 * Same hyperscale floor the Power map advertises: only >=400 MW sites are
 * "tracked". The two surfaces must agree or the headline contradicts its
 * own drill-down.
 */
export const MIN_TRACKED_MW = 400;

export function filterTrackedFacilities<T extends FacilityLite>(facilities: T[]): T[] {
  return (facilities ?? []).filter(
    (f) => typeof f.powerMW === "number" && Number.isFinite(f.powerMW) && f.powerMW >= MIN_TRACKED_MW,
  );
}

export interface FacilityLite {
  powerMW: number | null | undefined;
  status: string;
  openDate?: string | null;
  name?: string;
}

// ─── Tracked AI DC power ────────────────────────────────────────────────────

export interface TrackedPower {
  operationalMW: number;
  constructionMW: number;
  announcedMW: number;
  /** headline: operational + construction (committed steel, not press releases) */
  trackedMW: number;
  operationalCount: number;
  constructionCount: number;
  announcedCount: number;
}

export function computeTrackedPower(facilities: FacilityLite[]): TrackedPower {
  const t: TrackedPower = {
    operationalMW: 0,
    constructionMW: 0,
    announcedMW: 0,
    trackedMW: 0,
    operationalCount: 0,
    constructionCount: 0,
    announcedCount: 0,
  };
  for (const f of facilities ?? []) {
    const mw = typeof f.powerMW === "number" && Number.isFinite(f.powerMW) && f.powerMW > 0 ? f.powerMW : 0;
    if (f.status === "operational") {
      t.operationalMW += mw;
      t.operationalCount++;
    } else if (f.status === "construction") {
      t.constructionMW += mw;
      t.constructionCount++;
    } else if (f.status === "announced") {
      t.announcedMW += mw;
      t.announcedCount++;
    }
  }
  t.trackedMW = t.operationalMW + t.constructionMW;
  return t;
}

export function fmtGW(mw: number, digits = 1): string {
  return `${(mw / 1000).toFixed(digits)} GW`;
}

// ─── Buildout history (real series from facility open dates) ────────────────

/**
 * "2023" -> Jan 1 2023; "2026 Q3" -> first day of that quarter. Null on
 * anything else - unparseable dates are excluded, never guessed.
 */
export function parseOpenDate(openDate: string | null | undefined): number | null {
  if (!openDate) return null;
  const m = /^(\d{4})(?:\s*Q([1-4]))?$/.exec(openDate.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const quarter = m[2] ? Number(m[2]) : null;
  const month = quarter ? (quarter - 1) * 3 : 0;
  const t = Date.UTC(year, month, 1);
  return Number.isFinite(t) ? t : null;
}

export interface BuildoutPoint {
  t: number;
  /** cumulative MW online (or committed, for the pipeline series) at t */
  cumMW: number;
  addedMW: number;
  name?: string;
}

export interface BuildoutHistory {
  /** operational facilities by open date, cumulative - observed history */
  online: BuildoutPoint[];
  /** construction facilities by planned open date, cumulative ON TOP of the
   * operational total - the committed pipeline, rendered dashed */
  pipeline: BuildoutPoint[];
  /** facilities excluded because their open date could not be parsed */
  undatedCount: number;
}

/**
 * Cumulative tracked capacity over time. Facilities at the same date
 * aggregate into one step. Announced facilities are excluded entirely -
 * press releases are not steel.
 */
export function buildBuildoutHistory(facilities: FacilityLite[]): BuildoutHistory {
  let undatedCount = 0;
  const collect = (status: string) => {
    const byT = new Map<number, { mw: number; names: string[] }>();
    for (const f of facilities ?? []) {
      if (f.status !== status) continue;
      const mw = typeof f.powerMW === "number" && Number.isFinite(f.powerMW) && f.powerMW > 0 ? f.powerMW : 0;
      const t = parseOpenDate(f.openDate);
      if (t === null) {
        undatedCount++;
        continue;
      }
      const cur = byT.get(t) ?? { mw: 0, names: [] };
      cur.mw += mw;
      if (f.name) cur.names.push(f.name);
      byT.set(t, cur);
    }
    return Array.from(byT.entries()).sort((a, b) => a[0] - b[0]);
  };

  const online: BuildoutPoint[] = [];
  let cum = 0;
  for (const [t, { mw, names }] of collect("operational")) {
    cum += mw;
    online.push({ t, cumMW: cum, addedMW: mw, name: names.length === 1 ? names[0] : undefined });
  }

  const pipeline: BuildoutPoint[] = [];
  let pcum = cum; // pipeline continues from the operational total
  for (const [t, { mw, names }] of collect("construction")) {
    pcum += mw;
    pipeline.push({ t, cumMW: pcum, addedMW: mw, name: names.length === 1 ? names[0] : undefined });
  }

  return { online, pipeline, undatedCount };
}

// ─── Grid headroom ──────────────────────────────────────────────────────────

export interface GridHeadroom {
  rto: string;
  label: string;
  reserveMarginPct: number;
  aiSignal: RTOConfig["aiSignal"];
}

/** The tightest reserve margin among tracked RTOs - the binding constraint. */
export function tightestRTO(config: Record<string, RTOConfig>): GridHeadroom | null {
  let best: GridHeadroom | null = null;
  for (const [rto, c] of Object.entries(config ?? {})) {
    if (!Number.isFinite(c.reserveMargin)) continue;
    if (!best || c.reserveMargin < best.reserveMarginPct) {
      best = { rto, label: c.label, reserveMarginPct: c.reserveMargin, aiSignal: c.aiSignal };
    }
  }
  return best;
}
