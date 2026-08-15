/**
 * Reads the free-text energySource field on a cluster: "grid + on-site gas",
 * "nuclear (Susquehanna BTM)", "grid (DTE) + battery".
 *
 * A site can list several sources, so these tallies overlap and do not sum to the
 * site count. Present as "how many sites use X", never as a share or a pie.
 */

export type EnergySource = "nuclear" | "gas" | "solar" | "wind" | "hydro" | "battery" | "grid";

/** Display order: firm and dedicated first, shared grid last. */
export const ENERGY_SOURCES: EnergySource[] = [
  "grid",
  "gas",
  "nuclear",
  "solar",
  "wind",
  "battery",
  "hydro",
];

export const ENERGY_LABELS: Record<EnergySource, string> = {
  grid: "Public grid",
  gas: "Natural gas",
  nuclear: "Nuclear",
  solar: "Solar",
  wind: "Wind",
  battery: "Battery storage",
  hydro: "Hydro",
};

/** Plain-language note per source, short enough to sit under a bar on a phone. */
export const ENERGY_NOTES: Record<EnergySource, string> = {
  grid: "Drawn from the same public network that serves homes and businesses",
  gas: "Burned on site or nearby, usually to avoid waiting for a grid connection",
  nuclear: "Reactor output, either an existing plant or a small reactor still planned",
  solar: "Panels contracted or built alongside the site",
  wind: "Turbine output contracted to the site",
  battery: "Storage that shifts supply rather than generating it",
  hydro: "Existing dam output, mostly in the Pacific Northwest",
};

/** "grid" is last: it is the generic word that appears in most strings. */
const PATTERNS: Array<[EnergySource, RegExp]> = [
  ["nuclear", /nuclear|\bsmr\b|reactor/i],
  ["gas", /\bgas\b|turbine/i],
  ["solar", /solar|photovoltaic|\bpv\b/i],
  ["wind", /\bwind\b/i],
  ["hydro", /hydro/i],
  ["battery", /batter|storage|\bbess\b/i],
  ["grid", /\bgrid\b|utility/i],
];

/**
 * Every source a description mentions. Returns an empty array for missing or
 * unrecognised text so the caller counts nothing rather than guessing "grid".
 */
export function classifyEnergySource(text: string | null | undefined): EnergySource[] {
  if (typeof text !== "string" || !text.trim()) return [];
  return PATTERNS.filter(([, re]) => re.test(text)).map(([source]) => source);
}

export interface SourceTally {
  source: EnergySource;
  /** Sites whose description mentions this source. Overlapping across sources. */
  siteCount: number;
  /** Rated (or planned) power of those sites. Also overlapping - see note above. */
  totalMW: number;
}

export interface ClusterLike {
  energySource?: string | null;
  ratedPowerMW?: number | null;
  plannedPowerMW?: number | null;
}

/**
 * A site's power figure and which field it came from.
 *
 * Several nuclear-linked sites carry ratedPowerMW 0 with the real number in
 * plannedPowerMW. The basis travels with the number so callers can label planned
 * capacity as planned rather than printing it as rated or reading the 0 as zero.
 */
export function clusterPowerMW(c: ClusterLike): { mw: number; basis: "rated" | "planned" | null } {
  if (typeof c.ratedPowerMW === "number" && Number.isFinite(c.ratedPowerMW) && c.ratedPowerMW > 0) {
    return { mw: c.ratedPowerMW, basis: "rated" };
  }
  if (
    typeof c.plannedPowerMW === "number" &&
    Number.isFinite(c.plannedPowerMW) &&
    c.plannedPowerMW > 0
  ) {
    return { mw: c.plannedPowerMW, basis: "planned" };
  }
  return { mw: 0, basis: null };
}

function powerOf(c: ClusterLike): number {
  return clusterPowerMW(c).mw;
}

/**
 * Tally sites per source, biggest first. A site counts once per source it
 * mentions, so the counts overlap by design.
 */
export function tallyEnergySources(clusters: ClusterLike[]): SourceTally[] {
  const counts = new Map<EnergySource, { siteCount: number; totalMW: number }>();
  // Keys are tracked separately rather than iterating the Map, which the build
  // target cannot spread.
  const order: EnergySource[] = [];
  for (const c of clusters) {
    const mw = powerOf(c);
    for (const source of classifyEnergySource(c.energySource)) {
      let cur = counts.get(source);
      if (!cur) {
        cur = { siteCount: 0, totalMW: 0 };
        counts.set(source, cur);
        order.push(source);
      }
      cur.siteCount += 1;
      cur.totalMW += mw;
    }
  }
  return order
    .map((source) => ({ source, ...(counts.get(source) as { siteCount: number; totalMW: number }) }))
    .sort((a, b) => b.siteCount - a.siteCount || a.source.localeCompare(b.source));
}

/** Sites with any usable energySource text, the honest denominator for the tallies. */
export function classifiedSiteCount(clusters: ClusterLike[]): number {
  return clusters.filter((c) => classifyEnergySource(c.energySource).length > 0).length;
}
