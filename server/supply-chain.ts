// ─── Supply chain stages (pure) ─────────────────────────────────────────────
//
// server/data/supply-chain-stages.json holds, per stage, the tickers whose
// quotes the page shows and GridTilt's dated assessment of that stage. A
// status is only allowed with evidence: each piece is one sourced, dated
// statement. The demand stage (end use) carries no status; it shows live
// counts from the Compute Frontier registry instead of a typed figure.

export type StageStatus = "Tightening" | "Bottlenecked";

export interface StageEvidence {
  statement: string;
  url: string;
  publisher: string;
  /** YYYY-MM or YYYY-MM-DD the figure applies to. */
  asOf: string;
}

export interface StageRecord {
  name: string;
  tagline: string;
  status: StageStatus | null;
  evidence: StageEvidence[];
  tickers: string[];
}

export interface StagesFile {
  /** YYYY-MM-DD the assessments were last reviewed against their sources. */
  reviewed: string;
  method: string;
  stages: Record<string, StageRecord>;
}

const DATE = /^\d{4}-\d{2}(-\d{2})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Every rule the stage file must meet; an empty list means it is valid. */
export function validateStages(root: StagesFile): string[] {
  const problems: string[] = [];
  if (!DAY.test(root?.reviewed ?? "")) problems.push("reviewed must be YYYY-MM-DD");
  if (!root?.method?.trim()) problems.push("method is required");
  for (const [key, st] of Object.entries(root?.stages ?? {})) {
    if (st.status !== null && st.status !== "Tightening" && st.status !== "Bottlenecked") problems.push(`${key}: unknown status ${st.status}`);
    if (st.status && st.evidence.length === 0) problems.push(`${key}: a status needs evidence`);
    (st.evidence ?? []).forEach((e, i) => {
      if (!/^https:\/\//.test(e.url ?? "")) problems.push(`${key} evidence ${i}: url must be https`);
      if (!DATE.test(e.asOf ?? "")) problems.push(`${key} evidence ${i}: asOf must be YYYY-MM or YYYY-MM-DD`);
      if (!e.publisher?.trim() || !e.statement?.trim()) problems.push(`${key} evidence ${i}: publisher and statement are required`);
    });
    if (!Array.isArray(st.tickers) || st.tickers.length === 0) problems.push(`${key}: tickers required`);
  }
  return problems;
}

export interface ClusterLike {
  status: string;
}

/** Live counts for the demand stage, from the Compute Frontier registry. */
export function endUseLive(clusters: ClusterLike[]): { value: string; label: string; href: string } | null {
  if (!clusters.length) return null;
  const operational = clusters.filter((c) => c.status === "operational").length;
  return {
    value: clusters.length.toLocaleString("en-US"),
    label: `AI clusters tracked, ${operational.toLocaleString("en-US")} operational`,
    href: "/compute-frontier",
  };
}

export interface StockRow {
  ticker: string;
  name: string;
  price: number;
  change: number | null;
  changePercent: number | null;
  marketCapDisplay?: string;
  stale?: boolean;
}

export function buildSupplyChainPayload(
  file: StagesFile,
  stockData: Record<string, StockRow | undefined>,
  clusters: ClusterLike[],
  averageLiveChanges: (changes: Array<number | null | undefined>) => number | null,
) {
  const stages = Object.entries(file.stages).map(([key, stage]) => {
    const stocks = stage.tickers.map((t) => stockData[t]).filter((s): s is StockRow => Boolean(s));
    return {
      key,
      name: stage.name,
      tagline: stage.tagline,
      companyCount: stocks.length,
      // Stale tickers are excluded, not zeroed (see averageLiveChanges).
      avgChange: averageLiveChanges(stocks.map((st) => st.changePercent)),
      status: stage.status,
      evidence: stage.evidence,
      live: key === "endUse" ? endUseLive(clusters) : null,
      stocks: stocks.map((s) => ({
        ticker: s.ticker,
        name: s.name,
        price: s.price,
        change: s.change,
        changePercent: s.changePercent,
        marketCapDisplay: s.marketCapDisplay,
        stale: s.stale ?? false,
      })),
    };
  });
  const tightest = stages.find((s) => s.status === "Bottlenecked");
  return { reviewed: file.reviewed, method: file.method, stages, tightestBottleneck: tightest?.name ?? null };
}
