export interface TopMover {
  ticker: string;
  name: string;
  price: number;
  // Null whenever Yahoo did not serve a live change for this ticker.
  // Never 0: that would claim flat when the truth is unknown.
  change: number | null;
  changePercent: number | null;
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

export interface KpiData {
  aiPowerIndex: number;
  npiValue: number;
  gridStress: number;
  smrPolicyScore: number;
  npiBaseDate: string;
  source?: "live" | "static";
  asOf?: string;
  constituents: {
    nvdaChange: number; tsmChange: number; eqixChange: number; muChange: number;
    cegPerf: number; vstPerf: number; ccjPerf: number; nlrPerf: number;
    uPerf: number; policyPerf: number; npiPolicyMultiplier: number; npiMomentum: number;
    vstChange: number; cegChange: number;
  };
}
