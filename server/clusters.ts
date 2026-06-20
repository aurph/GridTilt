// ─── Compute Frontier metrics (pure) ─────────────────────────────────────
//
// The deterministic math behind the AI-supercluster tracker, extracted from
// routes.ts so the displayed numbers are unit-tested
// (server/__tests__/clusters.test.ts) and can never silently diverge from the
// curated dataset (server/data/clusters.json). Same discipline as
// server/metrics.ts: no baselines, no normalization, units are MW / GPUs /
// counts, every function a deterministic map from rows to displayed numbers.
//
// The cross-dataset "power needed vs power secured" join (clusters ->
// nuclear-for-AI deals) lives in the route layer, which is the only place
// that reads two datasets; this module stays clusters-only on purpose.

export interface ClusterLite {
  id: string;
  operator: string;
  status: "operational" | "construction" | "announced";
  gridRegion: string;
  gpuCount: number | null;
  ratedPowerMW: number;
  plannedPowerMW: number;
  linkedDeal: string | null;
}

export interface StatusBucket {
  status: string;
  count: number;
  ratedMW: number;
  plannedMW: number;
}

export interface OperatorBucket {
  operator: string;
  count: number;
  ratedMW: number;
  plannedMW: number;
  gpus: number;
}

export interface IsoBucket {
  iso: string;
  count: number;
  ratedMW: number;
  plannedMW: number;
}

export interface Concentration {
  topOperator: string | null;
  topOperatorPlannedShare: number; // 0..1 share of total planned MW
  hhi: number; // Herfindahl index of operator planned-MW shares, 0..1
  operatorCount: number;
}

export interface ClusterMetrics {
  clusterCount: number;
  operationalCount: number;
  constructionCount: number;
  announcedCount: number;
  totalRatedMW: number;
  operationalMW: number;
  totalPlannedMW: number;
  totalGpus: number;
  clustersWithGpuData: number;
  byStatus: StatusBucket[];
  byOperator: OperatorBucket[];
  byIso: IsoBucket[];
  gpusPerMW: number | null;
  concentration: Concentration;
  linkedDealCount: number;
  linkedDealIds: string[];
}

function round(n: number, dp: number): number {
  return parseFloat(n.toFixed(dp));
}

// Fixed display order for the status buckets present in the data.
const STATUS_ORDER = ["operational", "construction", "announced"];

/** All Compute Frontier headline + breakdown metrics from the cluster rows. */
export function computeClusterMetrics(clusters: ClusterLite[]): ClusterMetrics {
  let operationalCount = 0;
  let constructionCount = 0;
  let announcedCount = 0;
  let totalRatedMW = 0;
  let operationalMW = 0;
  let totalPlannedMW = 0;
  let totalGpus = 0;
  let clustersWithGpuData = 0;
  let gpuRatedMW = 0; // rated MW of ONLY the GPU-disclosing clusters (gpusPerMW denominator)

  const statusMap = new Map<string, StatusBucket>();
  const opMap = new Map<string, OperatorBucket>();
  const isoMap = new Map<string, IsoBucket>();
  const seenDeals = new Set<string>();
  const linkedDealIds: string[] = [];
  let linkedDealCount = 0;

  for (const c of clusters) {
    totalRatedMW += c.ratedPowerMW;
    totalPlannedMW += c.plannedPowerMW;
    if (c.status === "operational") {
      operationalCount++;
      operationalMW += c.ratedPowerMW;
    } else if (c.status === "construction") {
      constructionCount++;
    } else if (c.status === "announced") {
      announcedCount++;
    }

    if (c.gpuCount != null) {
      totalGpus += c.gpuCount;
      clustersWithGpuData++;
      gpuRatedMW += c.ratedPowerMW;
    }

    const sb = statusMap.get(c.status) ?? { status: c.status, count: 0, ratedMW: 0, plannedMW: 0 };
    sb.count++;
    sb.ratedMW += c.ratedPowerMW;
    sb.plannedMW += c.plannedPowerMW;
    statusMap.set(c.status, sb);

    const ob = opMap.get(c.operator) ?? { operator: c.operator, count: 0, ratedMW: 0, plannedMW: 0, gpus: 0 };
    ob.count++;
    ob.ratedMW += c.ratedPowerMW;
    ob.plannedMW += c.plannedPowerMW;
    ob.gpus += c.gpuCount ?? 0;
    opMap.set(c.operator, ob);

    const ib = isoMap.get(c.gridRegion) ?? { iso: c.gridRegion, count: 0, ratedMW: 0, plannedMW: 0 };
    ib.count++;
    ib.ratedMW += c.ratedPowerMW;
    ib.plannedMW += c.plannedPowerMW;
    isoMap.set(c.gridRegion, ib);

    if (c.linkedDeal) {
      linkedDealCount++;
      if (!seenDeals.has(c.linkedDeal)) {
        seenDeals.add(c.linkedDeal);
        linkedDealIds.push(c.linkedDeal);
      }
    }
  }

  const byStatus = STATUS_ORDER.filter((s) => statusMap.has(s)).map((s) => statusMap.get(s)!);
  const byOperator = Array.from(opMap.values()).sort(
    (a, b) => b.plannedMW - a.plannedMW || a.operator.localeCompare(b.operator),
  );
  const byIso = Array.from(isoMap.values()).sort(
    (a, b) => b.plannedMW - a.plannedMW || a.iso.localeCompare(b.iso),
  );

  const gpusPerMW = gpuRatedMW > 0 ? round(totalGpus / gpuRatedMW, 2) : null;

  const operatorCount = opMap.size;
  let topOperator: string | null = null;
  let topOperatorPlannedShare = 0;
  let hhi = 0;
  if (operatorCount > 0 && totalPlannedMW > 0) {
    topOperator = byOperator[0].operator;
    topOperatorPlannedShare = round(byOperator[0].plannedMW / totalPlannedMW, 4);
    hhi = round(
      byOperator.reduce((acc, o) => acc + Math.pow(o.plannedMW / totalPlannedMW, 2), 0),
      4,
    );
  }

  return {
    clusterCount: clusters.length,
    operationalCount,
    constructionCount,
    announcedCount,
    totalRatedMW,
    operationalMW,
    totalPlannedMW,
    totalGpus,
    clustersWithGpuData,
    byStatus,
    byOperator,
    byIso,
    gpusPerMW,
    concentration: { topOperator, topOperatorPlannedShare, hhi, operatorCount },
    linkedDealCount,
    linkedDealIds,
  };
}
