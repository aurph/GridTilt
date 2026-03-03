import type { Express } from "express";
import { type Server } from "http";

// Known company data for portfolio scoring
const COMPANY_DATABASE: Record<string, {
  name: string;
  primarySegment: string;
  sectors: { Compute: number; Infrastructure: number; Power: number; Cooling: number; Grid: number };
  explanation: string;
}> = {
  NVDA: { name: "NVIDIA Corporation", primarySegment: "Compute", sectors: { Compute: 95, Infrastructure: 20, Power: 10, Cooling: 15, Grid: 5 }, explanation: "NVIDIA's H100/B200 GPUs power virtually every major AI training cluster. Approximately 70% of datacenter revenue comes directly from AI workloads." },
  AMD: { name: "Advanced Micro Devices", primarySegment: "Compute", sectors: { Compute: 72, Infrastructure: 15, Power: 8, Cooling: 12, Grid: 5 }, explanation: "AMD's MI300X competes directly with NVIDIA in AI inference. Growing datacenter GPU business with significant AI exposure." },
  TSM: { name: "Taiwan Semiconductor Mfg", primarySegment: "Compute", sectors: { Compute: 88, Infrastructure: 15, Power: 12, Cooling: 18, Grid: 8 }, explanation: "TSMC manufactures virtually all advanced AI chips (NVDA, AMD, Apple, Google TPUs). The irreplaceable foundry at the base of the AI compute stack." },
  INTC: { name: "Intel Corporation", primarySegment: "Compute", sectors: { Compute: 45, Infrastructure: 20, Power: 5, Cooling: 10, Grid: 5 }, explanation: "Intel's Gaudi AI accelerators and Xeon datacenter CPUs provide moderate AI exposure, though NVDA dominates GPU training." },
  MU: { name: "Micron Technology", primarySegment: "Compute", sectors: { Compute: 60, Infrastructure: 15, Power: 5, Cooling: 8, Grid: 3 }, explanation: "High Bandwidth Memory (HBM) is critical for AI accelerators. Micron's HBM3E is a direct AI infrastructure play." },
  EQIX: { name: "Equinix Inc", primarySegment: "Infrastructure", sectors: { Compute: 15, Infrastructure: 97, Power: 30, Cooling: 45, Grid: 25 }, explanation: "World's largest colocation data center REIT. 100% of revenue tied to physical infrastructure that AI workloads run on." },
  DLR: { name: "Digital Realty Trust", primarySegment: "Infrastructure", sectors: { Compute: 10, Infrastructure: 95, Power: 28, Cooling: 42, Grid: 22 }, explanation: "Major datacenter REIT with hyperscaler-focused campuses. Growing power capacity agreements with AI cloud providers." },
  VRT: { name: "Vertiv Holdings", primarySegment: "Cooling", sectors: { Compute: 10, Infrastructure: 35, Power: 20, Cooling: 90, Grid: 30 }, explanation: "Critical datacenter thermal management and power infrastructure. Every AI datacenter needs Vertiv cooling and power systems. Fastest organic revenue growth in the sector." },
  IREN: { name: "IREN Limited", primarySegment: "Infrastructure", sectors: { Compute: 25, Infrastructure: 75, Power: 40, Cooling: 30, Grid: 20 }, explanation: "AI cloud and Bitcoin mining company pivoting to GPU-as-a-Service. Significant AI datacenter infrastructure buildout." },
  AMT: { name: "American Tower Corporation", primarySegment: "Infrastructure", sectors: { Compute: 5, Infrastructure: 45, Power: 15, Cooling: 10, Grid: 20 }, explanation: "Telecom tower REIT with edge data center exposure. Indirect AI beneficiary through edge compute infrastructure." },
  CEG: { name: "Constellation Energy", primarySegment: "Power", sectors: { Compute: 5, Infrastructure: 15, Power: 90, Cooling: 5, Grid: 35 }, explanation: "Largest US nuclear operator. Signed landmark deal to restart Three Mile Island for Microsoft. Pure-play nuclear renaissance stock." },
  VST: { name: "Vistra Corp", primarySegment: "Power", sectors: { Compute: 5, Infrastructure: 10, Power: 78, Cooling: 5, Grid: 30 }, explanation: "Largest competitive power generator in the US with nuclear and natural gas assets. Significant AI datacenter power supply exposure." },
  ETR: { name: "Entergy Corporation", primarySegment: "Power", sectors: { Compute: 3, Infrastructure: 10, Power: 65, Cooling: 5, Grid: 28 }, explanation: "Regional utility with nuclear fleet and growing datacenter power supply contracts in the Southeast US." },
  NEE: { name: "NextEra Energy", primarySegment: "Power", sectors: { Compute: 3, Infrastructure: 12, Power: 70, Cooling: 5, Grid: 40 }, explanation: "World's largest renewable energy company. Growing power purchase agreements with datacenter operators for dedicated capacity." },
  CCJ: { name: "Cameco Corporation", primarySegment: "Power", sectors: { Compute: 2, Infrastructure: 5, Power: 82, Cooling: 2, Grid: 15 }, explanation: "World's largest publicly-traded uranium miner. As nuclear demand grows for AI power, uranium supply tightens. Cameco has the highest direct uranium spot price beta of any large-cap." },
  NXE: { name: "NexGen Energy", primarySegment: "Power", sectors: { Compute: 2, Infrastructure: 5, Power: 78, Cooling: 2, Grid: 10 }, explanation: "Development-stage uranium miner holding the Rook I project in Saskatchewan's Athabasca Basin, the world's highest-grade uranium deposit. Speculative but high-upside nuclear renaissance play." },
  URA: { name: "Global X Uranium ETF", primarySegment: "Power", sectors: { Compute: 2, Infrastructure: 5, Power: 80, Cooling: 2, Grid: 12 }, explanation: "ETF holding uranium miners and nuclear equipment companies. Broad exposure to the nuclear renaissance driven by AI power demand." },
  MSFT: { name: "Microsoft Corporation", primarySegment: "Compute", sectors: { Compute: 65, Infrastructure: 40, Power: 25, Cooling: 20, Grid: 10 }, explanation: "Azure's AI cloud is a massive datacenter power consumer. Microsoft signed the Three Mile Island nuclear restart deal directly." },
  GOOGL: { name: "Alphabet Inc", primarySegment: "Compute", sectors: { Compute: 60, Infrastructure: 45, Power: 22, Cooling: 20, Grid: 12 }, explanation: "Google DeepMind and TPU infrastructure require enormous power. Google signed the first commercial SMR contract." },
  AMZN: { name: "Amazon.com Inc", primarySegment: "Infrastructure", sectors: { Compute: 55, Infrastructure: 50, Power: 20, Cooling: 18, Grid: 12 }, explanation: "AWS is the world's largest cloud provider. Amazon's AI capex is driving massive datacenter expansion across the US." },
  META: { name: "Meta Platforms Inc", primarySegment: "Compute", sectors: { Compute: 58, Infrastructure: 42, Power: 18, Cooling: 15, Grid: 10 }, explanation: "Meta's AI Llama models and recommendation systems run on massive custom datacenter infrastructure consuming approximately 4 GW globally." },
  AAPL: { name: "Apple Inc", primarySegment: "Compute", sectors: { Compute: 30, Infrastructure: 10, Power: 8, Cooling: 5, Grid: 3 }, explanation: "Apple Intelligence runs mostly on-device, reducing AI datacenter exposure. Limited direct power infrastructure play." },
  TSLA: { name: "Tesla Inc", primarySegment: "Grid", sectors: { Compute: 25, Infrastructure: 5, Power: 15, Cooling: 5, Grid: 45 }, explanation: "Tesla's Megapack energy storage is used in utility-scale projects including datacenter backup power. Dojo supercomputer is a compute play." },
  GE: { name: "GE Vernova", primarySegment: "Grid", sectors: { Compute: 5, Infrastructure: 10, Power: 35, Cooling: 5, Grid: 85 }, explanation: "GE Vernova makes gas turbines, wind turbines, and grid equipment. Direct beneficiary of grid expansion for AI datacenter buildout." },
  ETN: { name: "Eaton Corporation", primarySegment: "Grid", sectors: { Compute: 5, Infrastructure: 20, Power: 20, Cooling: 35, Grid: 78 }, explanation: "Eaton makes power management, UPS systems, and electrical infrastructure for datacenters. Core supply chain for DC power delivery." },
  SMCI: { name: "Super Micro Computer", primarySegment: "Compute", sectors: { Compute: 82, Infrastructure: 30, Power: 8, Cooling: 45, Grid: 5 }, explanation: "AI server manufacturer. Builds the rack-scale systems that house NVIDIA GPUs. Direct datacenter compute infrastructure play." },
  SPY: { name: "SPDR S&P 500 ETF", primarySegment: "Grid", sectors: { Compute: 25, Infrastructure: 15, Power: 12, Cooling: 10, Grid: 10 }, explanation: "Broad market ETF. AI power exposure comes from NVDA, MSFT, AMZN, GOOGL weightings (~30% combined). Diversified play." },
  QQQ: { name: "Invesco QQQ Trust", primarySegment: "Compute", sectors: { Compute: 45, Infrastructure: 20, Power: 10, Cooling: 12, Grid: 8 }, explanation: "Nasdaq-100 ETF with approximately 50% in mega-cap tech. Heavy AI/compute exposure through NVDA, MSFT, AMZN, GOOGL, META." },
  XLU: { name: "Utilities Select SPDR ETF", primarySegment: "Power", sectors: { Compute: 2, Infrastructure: 5, Power: 72, Cooling: 3, Grid: 40 }, explanation: "Utility sector ETF. Growing AI tailwind as datacenters sign long-term power purchase agreements with utilities." },
  XLK: { name: "Technology Select SPDR ETF", primarySegment: "Compute", sectors: { Compute: 70, Infrastructure: 25, Power: 8, Cooling: 12, Grid: 5 }, explanation: "Technology sector ETF. High AI exposure through semiconductor and cloud infrastructure holdings." },
};

function scorePortfolioTicker(ticker: string) {
  const known = COMPANY_DATABASE[ticker.toUpperCase()];
  if (known) {
    const sectors = known.sectors;
    const score = Math.round(
      sectors.Compute * 0.3 +
      sectors.Infrastructure * 0.25 +
      sectors.Power * 0.25 +
      sectors.Cooling * 0.1 +
      sectors.Grid * 0.1
    );
    return {
      ticker: ticker.toUpperCase(),
      name: known.name,
      score: Math.min(score, 100),
      sectors,
      primarySegment: known.primarySegment,
      explanation: known.explanation,
    };
  }

  return {
    ticker: ticker.toUpperCase(),
    name: `${ticker.toUpperCase()} (Unknown)`,
    score: 8,
    sectors: { Compute: 10, Infrastructure: 5, Power: 5, Cooling: 5, Grid: 5 },
    primarySegment: "Other",
    explanation: "No direct AI power infrastructure exposure identified. May have indirect benefits from broader technology adoption.",
  };
}

// Generate realistic sparkline data
function generateSparkline(basePrice: number, volatility: number = 0.02): number[] {
  const points = 30;
  const data: number[] = [basePrice];
  for (let i = 1; i < points; i++) {
    const change = data[i - 1] * (1 + (Math.random() - 0.5) * volatility * 2);
    data.push(parseFloat(change.toFixed(2)));
  }
  return data;
}

// Static market data (fallback when Yahoo Finance is unavailable)
const STATIC_MARKET_DATA: Record<string, {
  price: number; change: number; changePercent: number; pe: number | null;
  revenueGrowth: number | null; name: string; powerMW?: number; vs_sp500?: number; marketCapDisplay?: string;
}> = {
  NVDA: { name: "NVIDIA Corporation", price: 124.92, change: 3.47, changePercent: 2.86, pe: 55.2, revenueGrowth: 122.4, vs_sp500: 145.2, marketCapDisplay: "$3.1T" },
  TSM:  { name: "Taiwan Semiconductor Mfg", price: 176.42, change: 2.81, changePercent: 1.62, pe: 22.8, revenueGrowth: 38.9, vs_sp500: 72.4, marketCapDisplay: "$920B" },
  AMD:  { name: "Advanced Micro Devices", price: 109.34, change: -1.23, changePercent: -1.11, pe: 97.8, revenueGrowth: 17.4, vs_sp500: 22.1, marketCapDisplay: "$175B" },
  MU:   { name: "Micron Technology", price: 92.18, change: 1.84, changePercent: 2.03, pe: 31.5, revenueGrowth: 84.7, vs_sp500: 38.9, marketCapDisplay: "$97B" },
  INTC: { name: "Intel Corporation", price: 21.47, change: -0.38, changePercent: -1.74, pe: null, revenueGrowth: -2.1, vs_sp500: -48.2, marketCapDisplay: "$90B" },
  EQIX: { name: "Equinix Inc", price: 891.45, change: 12.34, changePercent: 1.40, pe: 82.1, revenueGrowth: 9.8, powerMW: 1200, vs_sp500: 18.5, marketCapDisplay: "$77B" },
  DLR:  { name: "Digital Realty Trust", price: 158.23, change: -0.87, changePercent: -0.55, pe: 73.4, revenueGrowth: 11.2, powerMW: 850, vs_sp500: 15.3, marketCapDisplay: "$45B" },
  VRT:  { name: "Vertiv Holdings", price: 88.74, change: 2.14, changePercent: 2.47, pe: 58.2, revenueGrowth: 19.8, powerMW: 600, vs_sp500: 142.3, marketCapDisplay: "$33B" },
  IREN: { name: "IREN Limited", price: 9.14, change: 0.32, changePercent: 3.63, pe: null, revenueGrowth: 127.8, powerMW: 1400, vs_sp500: 85.4, marketCapDisplay: "$2.4B" },
  AMT:  { name: "American Tower Corp", price: 194.56, change: 2.11, changePercent: 1.10, pe: 45.2, revenueGrowth: 5.1, powerMW: 120, vs_sp500: -4.2, marketCapDisplay: "$40B" },
  CEG:  { name: "Constellation Energy", price: 289.47, change: 8.92, changePercent: 3.18, pe: 38.4, revenueGrowth: 32.1, marketCapDisplay: "$69B" },
  VST:  { name: "Vistra Corp", price: 176.83, change: 4.21, changePercent: 2.44, pe: 27.8, revenueGrowth: 68.4, marketCapDisplay: "$46B" },
  ETR:  { name: "Entergy Corporation", price: 78.92, change: 0.64, changePercent: 0.82, pe: 18.3, revenueGrowth: 7.2 },
  NEE:  { name: "NextEra Energy", price: 71.34, change: -0.28, changePercent: -0.39, pe: 22.1, revenueGrowth: 9.4 },
  CCJ:  { name: "Cameco Corporation", price: 47.82, change: 1.44, changePercent: 3.10, pe: 89.3, revenueGrowth: 35.7, marketCapDisplay: "$21B" },
  NXE:  { name: "NexGen Energy", price: 5.94, change: 0.18, changePercent: 3.12, pe: null, revenueGrowth: null, marketCapDisplay: "$2.7B" },
  URA:  { name: "Global X Uranium ETF", price: 27.14, change: 0.87, changePercent: 3.31, pe: null, revenueGrowth: null },
  NLR:  { name: "VanEck Uranium+Nuclear ETF", price: 67.84, change: 0.54, changePercent: 0.80, pe: null, revenueGrowth: null, marketCapDisplay: "$1.1B" },
};

// Nuclear Renaissance Index (NRI) — Jan 1, 2024 base prices
// Jan 1, 2024 is the anchor date: narrative around AI baseload demand started accelerating.
// All prices are closing prices circa Jan 2, 2024 (first trading day 2024).
const NRI_BASE = {
  CEG: 146.00,       // CEG ~$143-148 range, pre-AI PPA narrative acceleration
  VST: 28.50,        // VST ~$25-32 range, pre-AI merchant power premium
  CCJ: 47.50,        // CCJ ~$46-49, pre-2024 uranium spot spike to $107
  NLR: 68.00,        // VanEck Uranium+Nuclear ETF, early-Jan 2024 baseline
  URANIUM_SPOT: 91.00,  // U3O8 spot ~$90-95/lb in Jan 2024 (pre-Feb 2024 spike to $107)
};

// SMR & PPA policy score (1-10 qualitative, updated periodically)
// Current: 7.8 — NRC Kairos/Oklo approvals, Microsoft TMI restart PPA, Amazon/Talen Virginia nuclear PPA,
// Google advanced nuclear PPAs, several state-level nuclear support legislation packages.
const SMR_POLICY_SCORE = 7.8;

// Current U3O8 uranium spot price $/lb (approximate — spot has pulled back from Feb 2024 peak of $107)
const URANIUM_SPOT_CURRENT = 74.0;

function getStockData(tickers: string[]) {
  return tickers.map((ticker) => {
    const data = STATIC_MARKET_DATA[ticker] ?? {
      name: `${ticker}`,
      price: 50 + Math.random() * 200,
      change: (Math.random() - 0.4) * 5,
      changePercent: (Math.random() - 0.4) * 4,
      pe: null,
      revenueGrowth: null,
    };
    return {
      ticker,
      name: data.name,
      price: data.price,
      change: data.change,
      changePercent: data.changePercent,
      pe: data.pe,
      revenueGrowth: data.revenueGrowth,
      sparkline: generateSparkline(data.price),
      powerMW: (data as any).powerMW,
      vs_sp500: (data as any).vs_sp500,
      marketCapDisplay: (data as any).marketCapDisplay,
    };
  });
}

// Generate scatter data with a target Pearson r using the standard linear noise model:
//   y = r * x_std + sqrt(1 - r^2) * noise_std  (both in z-score space, then rescale)
function gaussianRandom(): number {
  // Box-Muller
  const u1 = Math.random() || 1e-10;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// CCJ (Cameco): pure uranium miner — tight beta to U3O8 spot, target r ≈ 0.82
// Uranium spot range approx $45-$110 over 52-week scatter; CCJ approx $32-$62
function generateCCJCorrelationData() {
  const data = [];
  const targetR = 0.82;
  const sqrtTerm = Math.sqrt(1 - targetR * targetR);
  for (let i = 0; i < 52; i++) {
    const x = gaussianRandom(); // shared factor (uranium direction)
    const e = gaussianRandom(); // idiosyncratic noise
    const uStd = x;
    const cStd = targetR * x + sqrtTerm * e;
    // Rescale: uranium mean=78, sd=12; ccj mean=47, sd=7
    const uranium = parseFloat((78 + uStd * 12).toFixed(2));
    const ccj = parseFloat((47 + cStd * 7).toFixed(2));
    data.push({
      uranium: Math.max(50, Math.min(108, uranium)),
      ccj: Math.max(30, Math.min(65, ccj))
    });
  }
  return data;
}

// CEG (Constellation Energy): nuclear utility — looser uranium beta, target r ≈ 0.65
// CEG influenced by electricity contracts, capex, and macro beyond uranium spot
function generateCEGCorrelationData() {
  const data = [];
  const targetR = 0.65;
  const sqrtTerm = Math.sqrt(1 - targetR * targetR);
  for (let i = 0; i < 52; i++) {
    const x = gaussianRandom();
    const e = gaussianRandom();
    const uStd = x;
    const cStd = targetR * x + sqrtTerm * e;
    // Rescale: uranium mean=78, sd=12; ceg mean=220, sd=50
    const uranium = parseFloat((78 + uStd * 12).toFixed(2));
    const ceg = parseFloat((220 + cStd * 50).toFixed(2));
    data.push({
      uranium: Math.max(50, Math.min(108, uranium)),
      ceg: Math.max(110, Math.min(360, ceg))
    });
  }
  return data;
}

function calculateCorrelation(xs: number[], ys: number[]) {
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  const num = xs.reduce((s, v, i) => s + (v - meanX) * (ys[i] - meanY), 0);
  const denX = Math.sqrt(xs.reduce((s, v) => s + Math.pow(v - meanX, 2), 0));
  const denY = Math.sqrt(ys.reduce((s, v) => s + Math.pow(v - meanY, 2), 0));
  return num / (denX * denY);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // KPI endpoint — three composite indicators
  app.get("/api/kpis", async (req, res) => {
    // Static defaults for intraday % changes
    let nvdaChange = 2.86, tsmChange = 1.62, muChange = 2.03, eqixChange = 1.40;
    let cegChange = 3.18,  vstChange = 2.44,  ccjChange = 3.10, neeChange = -0.39, etrChange = 0.82;
    // Static defaults for NRI price levels (used for since-base performance)
    let cegPrice  = STATIC_MARKET_DATA.CEG.price;   // 289.47
    let vstPrice  = STATIC_MARKET_DATA.VST.price;   // 176.83
    let ccjPrice  = STATIC_MARKET_DATA.CCJ.price;   // 47.82
    let nlrPrice  = STATIC_MARKET_DATA.NLR.price;   // 67.84

    try {
      const yahooFinance = (await import("yahoo-finance2")).default;
      const quotes = await Promise.all([
        yahooFinance.quote("NVDA").catch(() => null),
        yahooFinance.quote("TSM").catch(() => null),
        yahooFinance.quote("MU").catch(() => null),
        yahooFinance.quote("EQIX").catch(() => null),
        yahooFinance.quote("CEG").catch(() => null),
        yahooFinance.quote("VST").catch(() => null),
        yahooFinance.quote("CCJ").catch(() => null),
        yahooFinance.quote("NLR").catch(() => null),
        yahooFinance.quote("NEE").catch(() => null),
        yahooFinance.quote("ETR").catch(() => null),
      ]);
      if (quotes[0]?.regularMarketChangePercent != null) nvdaChange  = quotes[0].regularMarketChangePercent;
      if (quotes[1]?.regularMarketChangePercent != null) tsmChange   = quotes[1].regularMarketChangePercent;
      if (quotes[2]?.regularMarketChangePercent != null) muChange    = quotes[2].regularMarketChangePercent;
      if (quotes[3]?.regularMarketChangePercent != null) eqixChange  = quotes[3].regularMarketChangePercent;
      if (quotes[4]?.regularMarketChangePercent != null) cegChange   = quotes[4].regularMarketChangePercent;
      if (quotes[5]?.regularMarketChangePercent != null) vstChange   = quotes[5].regularMarketChangePercent;
      if (quotes[6]?.regularMarketChangePercent != null) ccjChange   = quotes[6].regularMarketChangePercent;
      if (quotes[8]?.regularMarketChangePercent != null) neeChange   = quotes[8].regularMarketChangePercent;
      if (quotes[9]?.regularMarketChangePercent != null) etrChange   = quotes[9].regularMarketChangePercent;
      // Live prices for NRI basket performance calculation
      if (quotes[4]?.regularMarketPrice != null) cegPrice = quotes[4].regularMarketPrice;
      if (quotes[5]?.regularMarketPrice != null) vstPrice = quotes[5].regularMarketPrice;
      if (quotes[6]?.regularMarketPrice != null) ccjPrice = quotes[6].regularMarketPrice;
      if (quotes[7]?.regularMarketPrice != null) nlrPrice = quotes[7].regularMarketPrice;
    } catch (_e) {
      // Fall through to static defaults
    }

    // ─────────────────────────────────────────────────────────
    // 1. NUCLEAR RENAISSANCE INDEX (NRI)
    // Anchored basket index — base = 100 on January 1, 2024.
    // Six components across utilities, miners, ETF, policy, and raw commodity.
    // Policy multiplier (0.9-1.1) captures regulatory/legislative regime separately
    // from the 10% direct policy component.
    // ─────────────────────────────────────────────────────────
    const cegPerf  = cegPrice  / NRI_BASE.CEG;           // stock performance vs base date
    const vstPerf  = vstPrice  / NRI_BASE.VST;
    const ccjPerf  = ccjPrice  / NRI_BASE.CCJ;
    const nlrPerf  = nlrPrice  / NRI_BASE.NLR;
    const uPerf    = URANIUM_SPOT_CURRENT / NRI_BASE.URANIUM_SPOT;  // uranium spot performance
    // SMR policy component: 0 + (score/10) normalized so 5/10=1.0 baseline, 10/10=1.5
    // Using: perf = 0.5 + (score / 10), giving 0.5 at score=0 and 1.5 at score=10
    const policyPerf = 0.5 + (SMR_POLICY_SCORE / 10);

    const nriWeightedPerf =
      0.25 * cegPerf +
      0.20 * vstPerf +
      0.15 * ccjPerf +
      0.20 * nlrPerf +
      0.10 * uPerf   +
      0.10 * policyPerf;

    // Policy multiplier: separate regulatory regime factor (0.9 to 1.1)
    // At score 7.8: 0.9 + (7.8/10 × 0.2) = 1.056
    const nriPolicyMultiplier = 0.9 + (SMR_POLICY_SCORE / 10) * 0.2;
    const nriValue = parseFloat((100 * nriWeightedPerf * nriPolicyMultiplier).toFixed(1));

    // Intraday momentum signal for display (not used in index calculation)
    const nriMomentum = cegChange * 0.35 + vstChange * 0.30 + ccjChange * 0.20 + neeChange * 0.15;

    // ─────────────────────────────────────────────────────────
    // 2. AI POWER DEMAND INDEX (0-100)
    // Measures the pace at which AI compute infrastructure is driving
    // power demand pressure on the US grid.
    //
    // Structural baseline = 72/100, derived from:
    //   - US data center electricity share ~6-7% of national grid (Lawrence Berkeley Lab / EIA, 2025 estimate)
    //   - AI-driven demand CAGR: ~35%/yr (2022-2025 actuals, EIA + utility regulatory filings)
    //   - Hyperscaler 2025 AI capex actuals: ~$320B (MSFT $80B, GOOGL $75B, AMZN $105B, META $65B)
    // NOTE: Structural baseline is a static hardcoded constant. Uranium spot price ($74/lb),
    // SMR policy score (7.8/10), and electricity demand data are also static estimates.
    // Only stock prices and intraday % changes are live (Yahoo Finance).
    //   - GPU/HBM demand backlog: NVDA revenue +122% YoY (FY2025), TSM CoWoS capacity constrained
    //   - 100 would represent grid fully saturated by AI demand (theoretical maximum)
    //
    // Momentum layer: intraday signals from key infrastructure names (±8 pt range)
    //   NVDA (40%) + TSM (25%) + EQIX (20%) + MU (15%)
    //   Rationale: GPU demand (NVDA/TSM) drives primary load signal;
    //   EQIX reflects live data center capacity absorption; MU tracks HBM memory demand.
    // ─────────────────────────────────────────────────────────
    const aiMomentum = (nvdaChange * 0.40 + tsmChange * 0.25 + eqixChange * 0.20 + muChange * 0.15) * 1.2;
    const aiPowerIndex = Math.max(52, Math.min(94, 72 + aiMomentum + (Math.random() - 0.5) * 0.3));

    // ─────────────────────────────────────────────────────────
    // 3. GRID STRESS SCORE (0-100)
    // Measures supply/demand gap pressure on the US transmission grid.
    //
    // Structural baseline = 68/100, derived from:
    //   - PJM reserve margin: declined from 27% (2020) to 20% (2024); projected <15% by 2028
    //   - MISO issued formal capacity shortfall warnings for 2027-2028
    //   - ERCOT: 900+ hours of high-price scarcity events in 2023
    //   - EIA long-term: 30GW+ of announced DC load vs <15GW new dispatchable capacity planned
    //   - 100 would represent a declared grid emergency / rolling blackout conditions
    //
    // Momentum layer: power price signals from merchant generators (±8 pt range)
    //   VST (40%) + CEG (35%): rising merchant power stocks = power prices tightening
    //   EQIX (25%): rising DC REIT = forward load commitment accelerating
    // ─────────────────────────────────────────────────────────
    const stressMomentum = (vstChange * 0.40 + cegChange * 0.35 + eqixChange * 0.25) * 1.0;
    const gridStress = Math.max(52, Math.min(92, 68 + stressMomentum + (Math.random() - 0.5) * 0.4));

    res.json({
      aiPowerIndex:  parseFloat(aiPowerIndex.toFixed(1)),
      nriValue:      nriValue,
      gridStress:    parseFloat(gridStress.toFixed(1)),
      smrPolicyScore: SMR_POLICY_SCORE,
      nriBaseDate:   "Jan 1, 2024",
      constituents: {
        // AI Power Index signals
        nvdaChange:  parseFloat(nvdaChange.toFixed(2)),
        tsmChange:   parseFloat(tsmChange.toFixed(2)),
        eqixChange:  parseFloat(eqixChange.toFixed(2)),
        muChange:    parseFloat(muChange.toFixed(2)),
        // NRI price performance since Jan 1, 2024
        cegPerf:     parseFloat(cegPerf.toFixed(3)),
        vstPerf:     parseFloat(vstPerf.toFixed(3)),
        ccjPerf:     parseFloat(ccjPerf.toFixed(3)),
        nlrPerf:     parseFloat(nlrPerf.toFixed(3)),
        uPerf:       parseFloat(uPerf.toFixed(3)),
        policyPerf:  parseFloat(policyPerf.toFixed(3)),
        nriPolicyMultiplier: parseFloat(nriPolicyMultiplier.toFixed(3)),
        nriMomentum: parseFloat(nriMomentum.toFixed(2)),
        // Grid Stress signals
        vstChange:   parseFloat(vstChange.toFixed(2)),
        cegChange:   parseFloat(cegChange.toFixed(2)),
      },
    });
  });

  // Stack endpoint
  app.get("/api/stack", async (req, res) => {
    try {
      let stockData: Record<string, any> = {};

      const allTickers = ["NVDA", "TSM", "AMD", "MU", "EQIX", "DLR", "VRT", "IREN", "CEG", "VST", "CCJ", "NXE"];

      try {
        const yahooFinance = (await import("yahoo-finance2")).default;
        const results = await Promise.all(
          allTickers.map((t) => yahooFinance.quote(t).catch(() => null))
        );
        results.forEach((r, i) => {
          if (r?.regularMarketPrice) {
            const ticker = allTickers[i];
            const staticData = STATIC_MARKET_DATA[ticker];
            stockData[ticker] = {
              ticker,
              name: r.longName || r.shortName || staticData?.name || ticker,
              price: r.regularMarketPrice,
              change: r.regularMarketChange ?? 0,
              changePercent: r.regularMarketChangePercent ?? 0,
              pe: r.trailingPE ?? staticData?.pe ?? null,
              revenueGrowth: staticData?.revenueGrowth ?? null,
              sparkline: generateSparkline(r.regularMarketPrice),
              powerMW: staticData?.powerMW,
              vs_sp500: staticData?.vs_sp500,
              marketCapDisplay: staticData?.marketCapDisplay,
            };
          }
        });
      } catch (e) {
        // Fall through to static data
      }

      // Fill in missing tickers with static data
      allTickers.forEach((ticker) => {
        if (!stockData[ticker]) {
          const s = STATIC_MARKET_DATA[ticker];
          if (s) {
            stockData[ticker] = {
              ticker,
              ...s,
              sparkline: generateSparkline(s.price),
            };
          }
        }
      });

      const ccjCorrelationData = generateCCJCorrelationData();
      const cegCorrelationData = generateCEGCorrelationData();
      const ccjR = calculateCorrelation(
        ccjCorrelationData.map((d) => d.uranium),
        ccjCorrelationData.map((d) => d.ccj)
      );
      const cegR = calculateCorrelation(
        cegCorrelationData.map((d) => d.uranium),
        cegCorrelationData.map((d) => d.ceg)
      );

      res.json({
        compute: ["NVDA", "TSM", "AMD", "MU"].map((t) => stockData[t]).filter(Boolean),
        infrastructure: ["EQIX", "DLR", "VRT", "IREN"].map((t) => stockData[t]).filter(Boolean),
        power: ["CEG", "VST", "CCJ", "NXE"].map((t) => stockData[t]).filter(Boolean),
        correlation: ccjCorrelationData,
        correlationCoeff: parseFloat(ccjR.toFixed(3)),
        cegCorrelationCoeff: parseFloat(cegR.toFixed(3)),
      });
    } catch (error) {
      console.error("Stack error:", error);
      res.status(500).json({ error: "Failed to fetch stack data" });
    }
  });

  // Portfolio scoring endpoint
  app.post("/api/portfolio-score", async (req, res) => {
    try {
      const { tickers } = req.body;
      if (!Array.isArray(tickers) || tickers.length === 0) {
        return res.status(400).json({ error: "tickers must be a non-empty array" });
      }

      const results = tickers.slice(0, 15).map((ticker: string) =>
        scorePortfolioTicker(ticker.trim().toUpperCase())
      );

      res.json({ results });
    } catch (error) {
      console.error("Portfolio score error:", error);
      res.status(500).json({ error: "Failed to score portfolio" });
    }
  });

  return httpServer;
}
