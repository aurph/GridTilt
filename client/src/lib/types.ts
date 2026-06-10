export interface TopMover {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  sector: string;
  marketCapDisplay?: string;
}

export interface SectorPulseItem {
  sector: string;
  label: string;
  avgChange: number;
}

export interface MergedCatalystItem {
  id: string;
  type: "earnings" | "catalyst";
  date: string;
  sortDate: string;
  ticker?: string;
  company?: string;
  time?: string;
  quarter?: string;
  stage?: string;
  stageColor?: string;
  category?: string;
  title?: string;
  description?: string;
  dateLabel?: string;
  affectedTickers?: string[];
  affectedSectors?: string[];
}

export interface AllCatalystsResponse {
  items: MergedCatalystItem[];
}

// Minimal shape of GET /api/metrics for surfaces that only need the
// headline numbers (the dashboard keeps its richer local interface).
export interface MetricsSummary {
  nuclear: { signedGW: number; announcedGW: number; signedDeals: number; totalDeals: number };
  pipeline: { operationalGW: number; constructionGW: number; announcedGW: number; siteCount: number };
  backlog: { queueOverallGW: number; medianWaitMonths: number };
  asOf: string;
}
