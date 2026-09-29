/**
 * Reading NERC's reserve margins without inventing a verdict. See
 * client/src/data/nerc-reserve-margins.ts for the figures and their source.
 */
import { NERC_AREAS, REGION_AREAS, STATE_NERC_AREA, type NercArea, type NercRisk } from "../data/nerc-reserve-margins";
import { STATE_GRID } from "../data/state-grid";

/** Points of margin above the area's own reference level. Negative means below it. */
export function cushion(a: NercArea): number {
  return +(a.margin - a.reference).toFixed(2);
}

export function areasForRegion(region: string, areas: Record<string, NercArea> = NERC_AREAS): NercArea[] {
  return (REGION_AREAS[region] ?? []).map((k) => areas[k]).filter((a): a is NercArea => Boolean(a));
}

/**
 * The summer-peaking area with the smallest cushion above its own reference
 * level. Ranking raw margins across areas would compare MISO's 11.0% against
 * a 15% line NERC never applies to it (its reference is 8.1%).
 */
export function tightestArea(areas: NercArea[] = Object.values(NERC_AREAS)): NercArea | null {
  let best: NercArea | null = null;
  for (const a of areas) {
    if (a.season !== "summer 2026" || !Number.isFinite(a.margin) || !Number.isFinite(a.reference)) continue;
    if (!best || cushion(a) < cushion(best)) best = a;
  }
  return best;
}

/** Areas sorted by cushion, smallest first (summer-peaking only). */
export function byCushion(areas: NercArea[] = Object.values(NERC_AREAS)): NercArea[] {
  return areas.filter((a) => a.season === "summer 2026").sort((a, b) => cushion(a) - cushion(b) || a.key.localeCompare(b.key));
}

/** A region's NERC risk: its one area's level, or null when its areas differ. */
export function regionRisk(region: string): NercRisk | null {
  const levels = new Set(areasForRegion(region).map((a) => a.risk));
  return levels.size === 1 ? Array.from(levels)[0] : null;
}

/** How a region's risk reads in a table cell, naming the areas that differ. */
export function regionRiskText(region: string): string {
  const areas = areasForRegion(region);
  if (areas.length === 0) return "not assessed";
  const uniform = regionRisk(region);
  if (areas.length === 1) return uniform ?? "not assessed";
  if (uniform) return `${uniform} in all ${areas.length} areas`;
  const raised = areas.filter((a) => a.risk !== "Normal").map((a) => `${a.risk} in ${a.label}`);
  return `${raised.join("; ")}; Normal elsewhere`;
}

/** "29.7%" for one area; "18.3% to 22.3% across 2 areas" for a multi-area region. */
export function regionMarginText(region: string): string {
  const areas = areasForRegion(region);
  if (areas.length === 0) return "not assessed";
  if (areas.length === 1) return `${areas[0].margin.toFixed(1)}%`;
  const ms = areas.map((a) => a.margin);
  return `${Math.min(...ms).toFixed(1)}% to ${Math.max(...ms).toFixed(1)}% across ${areas.length} areas`;
}

/**
 * The NERC area for a state: its listed sub-area, or the one area of its
 * region. Null when the state sits in a multi-area region and no area is
 * listed for it, or has no assessed region (Alaska, Hawaii).
 */
export function areaForState(code: string): NercArea | null {
  const listed = STATE_NERC_AREA[code];
  if (listed) return NERC_AREAS[listed] ?? null;
  const region = STATE_GRID[code]?.region;
  const areas = region ? areasForRegion(region) : [];
  return areas.length === 1 ? areas[0] : null;
}
