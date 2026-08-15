/**
 * Aggregations over the tracked facility set.
 *
 * Every consumer-facing rollup on the Power Map reads from here rather than
 * grouping inline, so the state view, the company view and the map can never
 * disagree about what "total tracked power" means.
 *
 * Two rules hold throughout:
 *  - "running" is status === "operational". Everything else is not yet drawing
 *    power, and lumping them together is the single easiest way to overstate
 *    what exists today.
 *  - a facility with no usable powerMW contributes nothing rather than zero, and
 *    is counted separately so a caller can say so instead of silently dropping it.
 */

export interface FacilityLike {
  id: number;
  name: string;
  company: string;
  city: string;
  state: string;
  powerMW: number;
  status: "operational" | "construction" | "announced";
  annualMWh: number;
  gridOperator: string;
  /** Curated as a year or a year and quarter: "2023", "2026 Q1". */
  openDate?: string | null;
}

export interface Rollup {
  /** State code or company name. */
  key: string;
  /** Sum of powerMW across every facility in the group. */
  totalMW: number;
  /** Sum across operational facilities only. */
  runningMW: number;
  /** Sum across construction + announced. */
  buildingMW: number;
  count: number;
  /** Facilities in the group with no usable powerMW. */
  unknownPower: number;
  /** Largest facility in the group by powerMW, or null when none is usable. */
  largest: FacilityLike | null;
}

function usableMW(f: FacilityLike): number | null {
  return typeof f.powerMW === "number" && Number.isFinite(f.powerMW) && f.powerMW > 0
    ? f.powerMW
    : null;
}

function rollup(key: string, group: FacilityLike[]): Rollup {
  let totalMW = 0;
  let runningMW = 0;
  let buildingMW = 0;
  let unknownPower = 0;
  let largest: FacilityLike | null = null;

  for (const f of group) {
    const mw = usableMW(f);
    if (mw === null) {
      unknownPower += 1;
      continue;
    }
    totalMW += mw;
    if (f.status === "operational") runningMW += mw;
    else buildingMW += mw;
    if (largest === null || mw > largest.powerMW) largest = f;
  }

  return { key, totalMW, runningMW, buildingMW, count: group.length, unknownPower, largest };
}

function groupBy(facilities: FacilityLike[], pick: (f: FacilityLike) => string): Rollup[] {
  const buckets = new Map<string, FacilityLike[]>();
  // Keys are tracked separately rather than iterating the Map, which the build
  // target cannot spread.
  const order: string[] = [];
  for (const f of facilities) {
    const k = pick(f);
    if (!k) continue;
    const arr = buckets.get(k);
    if (arr) {
      arr.push(f);
    } else {
      buckets.set(k, [f]);
      order.push(k);
    }
  }
  return order
    .map((k) => rollup(k, buckets.get(k) as FacilityLike[]))
    // Descending by total power, then by name so equal totals have a stable order
    // rather than depending on insertion.
    .sort((a, b) => b.totalMW - a.totalMW || a.key.localeCompare(b.key));
}

export function byState(facilities: FacilityLike[]): Rollup[] {
  return groupBy(facilities, (f) => f.state);
}

export function byCompany(facilities: FacilityLike[]): Rollup[] {
  return groupBy(facilities, (f) => f.company);
}

/** Total tracked power across every facility, used as the denominator for shares. */
export function totalTrackedMW(facilities: FacilityLike[]): number {
  return facilities.reduce((sum, f) => sum + (usableMW(f) ?? 0), 0);
}

/**
 * Share of the tracked total, 0-100. Returns null when the denominator is zero,
 * so a caller renders nothing rather than a meaningless 0%.
 */
export function shareOfTotal(partMW: number, totalMW: number): number | null {
  if (!Number.isFinite(totalMW) || totalMW <= 0) return null;
  return (partMW / totalMW) * 100;
}

export interface YearBucket {
  year: number;
  /** Power from facilities whose opening date falls in this year. */
  arrivingMW: number;
  /** Running total from the first tracked year through this one. */
  cumulativeMW: number;
  count: number;
  /**
   * True when nothing in this year is running yet, so the whole bar is a target
   * date rather than a record of something that happened.
   */
  allPlanned: boolean;
}

/**
 * Year out of a curated opening date. Accepts "2023" and "2026 Q1" and refuses
 * anything else rather than guessing, so a curator typo drops a facility out of
 * the timeline instead of parking it in year 0.
 */
export function parseOpenYear(openDate: string | null | undefined): number | null {
  if (typeof openDate !== "string") return null;
  const m = /^\s*(\d{4})\b/.exec(openDate);
  if (!m) return null;
  const year = Number(m[1]);
  // A tracked facility outside this window is a data error, not a real date.
  return year >= 1990 && year <= 2100 ? year : null;
}

/**
 * Capacity by opening year, contiguous from the first tracked year to the last.
 *
 * Empty years are kept as zero bars rather than skipped: a gap that closes up
 * would compress a quiet stretch and make the buildout look smoother than it is.
 * Facilities with no usable year or power are excluded entirely.
 */
export function byYear(facilities: FacilityLike[]): YearBucket[] {
  const arriving = new Map<number, { mw: number; count: number; running: number }>();
  let min = Infinity;
  let max = -Infinity;

  for (const f of facilities) {
    const year = parseOpenYear(f.openDate);
    const mw = usableMW(f);
    if (year === null || mw === null) continue;
    const cur = arriving.get(year) ?? { mw: 0, count: 0, running: 0 };
    cur.mw += mw;
    cur.count += 1;
    if (f.status === "operational") cur.running += 1;
    arriving.set(year, cur);
    if (year < min) min = year;
    if (year > max) max = year;
  }

  if (!Number.isFinite(min)) return [];

  const out: YearBucket[] = [];
  let cumulative = 0;
  for (let year = min; year <= max; year += 1) {
    const b = arriving.get(year) ?? { mw: 0, count: 0, running: 0 };
    cumulative += b.mw;
    out.push({
      year,
      arrivingMW: b.mw,
      cumulativeMW: cumulative,
      count: b.count,
      allPlanned: b.count > 0 && b.running === 0,
    });
  }
  return out;
}
