/**
 * Buildout reality: how much of the announced AI build-out is actually
 * energized today. The segments partition totalPlannedMW exactly, so the
 * proportion bar is mathematically true, never suggestive:
 *
 *   energized        rated MW of operational clusters (running today)
 *   growingOnSite    operational clusters' planned MW beyond what runs
 *   construction     planned MW of clusters under construction
 *   announced        planned MW of announced-only clusters
 *
 * Capex context uses Epoch AI's published ~$38B per GW of IT capacity
 * ($26B compute + $12B construction). Our MW mix facility and IT bases,
 * so the dollar figure is order-of-magnitude context, labeled as such.
 */

export interface StatusBucketLite {
  status: string;
  ratedMW: number;
  plannedMW: number;
}

export interface BuildoutReality {
  totalPlannedMW: number;
  energizedMW: number;
  growingOnSiteMW: number;
  constructionMW: number;
  announcedMW: number;
  energizedShare: number; // 0..1 of the full announced build-out
  unbuiltMW: number;
  unbuiltCapexB: number; // rough $B at Epoch's ~$38B/GW
}

export const EPOCH_CAPEX_B_PER_GW = 38;

export function computeBuildoutReality(m: {
  totalPlannedMW: number;
  operationalMW: number;
  byStatus: StatusBucketLite[];
}): BuildoutReality {
  const bucket = (s: string) => m.byStatus.find((b) => b.status === s);
  const opPlanned = bucket("operational")?.plannedMW ?? 0;
  const energizedMW = m.operationalMW;
  const growingOnSiteMW = Math.max(0, opPlanned - energizedMW);
  const constructionMW = bucket("construction")?.plannedMW ?? 0;
  const announcedMW = bucket("announced")?.plannedMW ?? 0;
  const totalPlannedMW = m.totalPlannedMW;
  const unbuiltMW = Math.max(0, totalPlannedMW - energizedMW);
  return {
    totalPlannedMW,
    energizedMW,
    growingOnSiteMW,
    constructionMW,
    announcedMW,
    energizedShare: totalPlannedMW > 0 ? energizedMW / totalPlannedMW : 0,
    unbuiltMW,
    unbuiltCapexB: Math.round((unbuiltMW / 1000) * EPOCH_CAPEX_B_PER_GW),
  };
}
