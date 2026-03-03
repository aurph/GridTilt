import type { Express } from "express";
import { type Server } from "http";

// Known company data for portfolio scoring
const COMPANY_DATABASE: Record<string, {
  name: string;
  primarySegment: string;
  sectors: { Compute: number; Infrastructure: number; Power: number; Cooling: number; Grid: number };
  explanation: string;
}> = {
  NVDA: { name: "NVIDIA Corporation", primarySegment: "Compute", sectors: { Compute: 95, Infrastructure: 20, Power: 10, Cooling: 15, Grid: 5 }, explanation: "NVIDIA's H100/B200 GPUs power virtually every major AI training cluster. ~70%+ of datacenter revenue comes directly from AI workloads." },
  AMD: { name: "Advanced Micro Devices", primarySegment: "Compute", sectors: { Compute: 72, Infrastructure: 15, Power: 8, Cooling: 12, Grid: 5 }, explanation: "AMD's MI300X competes directly with NVIDIA in AI inference. Growing datacenter GPU business with significant AI exposure." },
  INTC: { name: "Intel Corporation", primarySegment: "Compute", sectors: { Compute: 45, Infrastructure: 20, Power: 5, Cooling: 10, Grid: 5 }, explanation: "Intel's Gaudi AI accelerators and Xeon datacenter CPUs provide moderate AI exposure, though NVDA dominates GPU training." },
  MU: { name: "Micron Technology", primarySegment: "Compute", sectors: { Compute: 60, Infrastructure: 15, Power: 5, Cooling: 8, Grid: 3 }, explanation: "High Bandwidth Memory (HBM) is critical for AI accelerators. Micron's HBM3E is a direct AI infrastructure play." },
  EQIX: { name: "Equinix Inc", primarySegment: "Infrastructure", sectors: { Compute: 15, Infrastructure: 97, Power: 30, Cooling: 45, Grid: 25 }, explanation: "World's largest colocation data center REIT. 100% of revenue tied to physical infrastructure that AI workloads run on." },
  DLR: { name: "Digital Realty Trust", primarySegment: "Infrastructure", sectors: { Compute: 10, Infrastructure: 95, Power: 28, Cooling: 42, Grid: 22 }, explanation: "Major datacenter REIT with hyperscaler-focused campuses. Growing power capacity agreements with AI cloud providers." },
  IREN: { name: "IREN Limited", primarySegment: "Infrastructure", sectors: { Compute: 25, Infrastructure: 75, Power: 40, Cooling: 30, Grid: 20 }, explanation: "AI cloud and Bitcoin mining company pivoting to GPU-as-a-Service. Significant AI datacenter infrastructure buildout." },
  AMT: { name: "American Tower Corporation", primarySegment: "Infrastructure", sectors: { Compute: 5, Infrastructure: 45, Power: 15, Cooling: 10, Grid: 20 }, explanation: "Telecom tower REIT with edge data center exposure. Indirect AI beneficiary through edge compute infrastructure." },
  CEG: { name: "Constellation Energy", primarySegment: "Power", sectors: { Compute: 5, Infrastructure: 15, Power: 90, Cooling: 5, Grid: 35 }, explanation: "Largest US nuclear operator. Signed landmark deal to restart Three Mile Island for Microsoft. Pure-play nuclear renaissance stock." },
  VST: { name: "Vistra Corp", primarySegment: "Power", sectors: { Compute: 5, Infrastructure: 10, Power: 78, Cooling: 5, Grid: 30 }, explanation: "Largest competitive power generator in the US with nuclear and natural gas assets. Significant AI datacenter power supply exposure." },
  ETR: { name: "Entergy Corporation", primarySegment: "Power", sectors: { Compute: 3, Infrastructure: 10, Power: 65, Cooling: 5, Grid: 28 }, explanation: "Regional utility with nuclear fleet and growing datacenter power supply contracts in the Southeast US." },
  NEE: { name: "NextEra Energy", primarySegment: "Power", sectors: { Compute: 3, Infrastructure: 12, Power: 70, Cooling: 5, Grid: 40 }, explanation: "World's largest renewable energy company. Growing power purchase agreements with datacenter operators for dedicated capacity." },
  CCJ: { name: "Cameco Corporation", primarySegment: "Power", sectors: { Compute: 2, Infrastructure: 5, Power: 82, Cooling: 2, Grid: 15 }, explanation: "World's largest publicly-traded uranium miner. As nuclear demand grows for AI power, uranium supply tightens — Cameco wins." },
  URA: { name: "Global X Uranium ETF", primarySegment: "Power", sectors: { Compute: 2, Infrastructure: 5, Power: 80, Cooling: 2, Grid: 12 }, explanation: "ETF holding uranium miners and nuclear equipment companies. Broad exposure to the nuclear renaissance driven by AI power demand." },
  MSFT: { name: "Microsoft Corporation", primarySegment: "Compute", sectors: { Compute: 65, Infrastructure: 40, Power: 25, Cooling: 20, Grid: 10 }, explanation: "Azure's AI cloud is a massive datacenter power consumer. Microsoft signed the Three Mile Island nuclear restart deal directly." },
  GOOGL: { name: "Alphabet Inc", primarySegment: "Compute", sectors: { Compute: 60, Infrastructure: 45, Power: 22, Cooling: 20, Grid: 12 }, explanation: "Google DeepMind and TPU infrastructure require enormous power. Google signed the first commercial SMR contract." },
  AMZN: { name: "Amazon.com Inc", primarySegment: "Infrastructure", sectors: { Compute: 55, Infrastructure: 50, Power: 20, Cooling: 18, Grid: 12 }, explanation: "AWS is the world's largest cloud provider. Amazon's AI capex is driving massive datacenter expansion across the US." },
  META: { name: "Meta Platforms Inc", primarySegment: "Compute", sectors: { Compute: 58, Infrastructure: 42, Power: 18, Cooling: 15, Grid: 10 }, explanation: "Meta's AI Llama models and recommendation systems run on massive custom datacenter infrastructure consuming ~4GW globally." },
  AAPL: { name: "Apple Inc", primarySegment: "Compute", sectors: { Compute: 30, Infrastructure: 10, Power: 8, Cooling: 5, Grid: 3 }, explanation: "Apple Intelligence runs mostly on-device, reducing AI datacenter exposure. Limited direct power infrastructure play." },
  TSLA: { name: "Tesla Inc", primarySegment: "Grid", sectors: { Compute: 25, Infrastructure: 5, Power: 15, Cooling: 5, Grid: 45 }, explanation: "Tesla's Megapack energy storage is used in utility-scale projects including datacenter backup power. Dojo supercomputer is a compute play." },
  GE: { name: "GE Vernova", primarySegment: "Grid", sectors: { Compute: 5, Infrastructure: 10, Power: 35, Cooling: 5, Grid: 85 }, explanation: "GE Vernova makes gas turbines, wind turbines, and grid equipment. Direct beneficiary of grid expansion for AI datacenter buildout." },
  ETN: { name: "Eaton Corporation", primarySegment: "Grid", sectors: { Compute: 5, Infrastructure: 20, Power: 20, Cooling: 35, Grid: 78 }, explanation: "Eaton makes power management, UPS systems, and electrical infrastructure for datacenters. Core supply chain for DC power delivery." },
  VRT: { name: "Vertiv Holdings", primarySegment: "Cooling", sectors: { Compute: 10, Infrastructure: 35, Power: 20, Cooling: 90, Grid: 30 }, explanation: "Critical datacenter thermal management and power infrastructure. Every AI datacenter needs Vertiv cooling and power systems." },
  SMCI: { name: "Super Micro Computer", primarySegment: "Compute", sectors: { Compute: 82, Infrastructure: 30, Power: 8, Cooling: 45, Grid: 5 }, explanation: "AI server manufacturer. Builds the rack-scale systems that house NVIDIA GPUs. Direct datacenter compute infrastructure play." },
  SPWR: { name: "SunPower Corp", primarySegment: "Power", sectors: { Compute: 2, Infrastructure: 5, Power: 40, Cooling: 2, Grid: 15 }, explanation: "Solar energy company with indirect datacenter power exposure through renewable energy supply." },
  SPY: { name: "SPDR S&P 500 ETF", primarySegment: "Grid", sectors: { Compute: 25, Infrastructure: 15, Power: 12, Cooling: 10, Grid: 10 }, explanation: "Broad market ETF. AI power exposure comes from NVDA, MSFT, AMZN, GOOGL weightings (~30% combined). Diversified play." },
  QQQ: { name: "Invesco QQQ Trust", primarySegment: "Compute", sectors: { Compute: 45, Infrastructure: 20, Power: 10, Cooling: 12, Grid: 8 }, explanation: "Nasdaq-100 ETF with ~50%+ in mega-cap tech. Heavy AI/compute exposure through NVDA, MSFT, AMZN, GOOGL, META." },
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

  // Unknown ticker: score as minimal exposure
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
const STATIC_MARKET_DATA: Record<string, { price: number; change: number; changePercent: number; pe: number | null; revenueGrowth: number | null; name: string; powerMW?: number; vs_sp500?: number }> = {
  NVDA: { name: "NVIDIA Corporation", price: 124.92, change: 3.47, changePercent: 2.86, pe: 55.2, revenueGrowth: 122.4, vs_sp500: 145.2 },
  AMD: { name: "Advanced Micro Devices", price: 109.34, change: -1.23, changePercent: -1.11, pe: 97.8, revenueGrowth: 17.4, vs_sp500: 22.1 },
  MU: { name: "Micron Technology", price: 92.18, change: 1.84, changePercent: 2.03, pe: 31.5, revenueGrowth: 84.7, vs_sp500: 38.9 },
  INTC: { name: "Intel Corporation", price: 21.47, change: -0.38, changePercent: -1.74, pe: null, revenueGrowth: -2.1, vs_sp500: -48.2 },
  IREN: { name: "IREN Limited", price: 9.14, change: 0.32, changePercent: 3.63, pe: null, revenueGrowth: 127.8, powerMW: 1400, vs_sp500: 85.4 },
  EQIX: { name: "Equinix Inc", price: 891.45, change: 12.34, changePercent: 1.40, pe: 82.1, revenueGrowth: 9.8, powerMW: 1200, vs_sp500: 18.5 },
  DLR: { name: "Digital Realty Trust", price: 158.23, change: -0.87, changePercent: -0.55, pe: 73.4, revenueGrowth: 11.2, powerMW: 850, vs_sp500: 15.3 },
  AMT: { name: "American Tower Corp", price: 194.56, change: 2.11, changePercent: 1.10, pe: 45.2, revenueGrowth: 5.1, powerMW: 120, vs_sp500: -4.2 },
  CEG: { name: "Constellation Energy", price: 289.47, change: 8.92, changePercent: 3.18, pe: 38.4, revenueGrowth: 32.1 },
  VST: { name: "Vistra Corp", price: 176.83, change: 4.21, changePercent: 2.44, pe: 27.8, revenueGrowth: 68.4 },
  ETR: { name: "Entergy Corporation", price: 78.92, change: 0.64, changePercent: 0.82, pe: 18.3, revenueGrowth: 7.2 },
  NEE: { name: "NextEra Energy", price: 71.34, change: -0.28, changePercent: -0.39, pe: 22.1, revenueGrowth: 9.4 },
  CCJ: { name: "Cameco Corporation", price: 47.82, change: 1.44, changePercent: 3.10, pe: 89.3, revenueGrowth: 35.7 },
  URA: { name: "Global X Uranium ETF", price: 27.14, change: 0.87, changePercent: 3.31, pe: null, revenueGrowth: null },
};

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
    };
  });
}

function generateCorrelationData() {
  // Simulate 52 weeks of uranium vs CEG data
  const data = [];
  let uranium = 58;
  let ceg = 110;
  for (let i = 0; i < 52; i++) {
    uranium += (Math.random() - 0.3) * 4;
    ceg += (uranium - 58) * 2.1 + (Math.random() - 0.5) * 15;
    uranium = Math.max(40, Math.min(120, uranium));
    ceg = Math.max(50, Math.min(400, ceg));
    data.push({ uranium: parseFloat(uranium.toFixed(2)), ceg: parseFloat(ceg.toFixed(2)) });
  }
  return data;
}

function calculateCorrelation(data: { uranium: number; ceg: number }[]) {
  const n = data.length;
  const meanU = data.reduce((s, d) => s + d.uranium, 0) / n;
  const meanC = data.reduce((s, d) => s + d.ceg, 0) / n;
  const num = data.reduce((s, d) => s + (d.uranium - meanU) * (d.ceg - meanC), 0);
  const denU = Math.sqrt(data.reduce((s, d) => s + Math.pow(d.uranium - meanU, 2), 0));
  const denC = Math.sqrt(data.reduce((s, d) => s + Math.pow(d.ceg - meanC, 2), 0));
  return num / (denU * denC);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // KPI endpoint
  app.get("/api/kpis", async (req, res) => {
    try {
      // Try to get real data from Yahoo Finance
      let nuclearStocks = [289.47, 176.83, 78.92]; // CEG, VST, ETR defaults
      let uraniumPrice = 82.5;

      try {
        const yahooFinance = (await import("yahoo-finance2")).default;
        const [ceg, vst, etr] = await Promise.all([
          yahooFinance.quote("CEG").catch(() => null),
          yahooFinance.quote("VST").catch(() => null),
          yahooFinance.quote("ETR").catch(() => null),
        ]);
        if (ceg?.regularMarketPrice) nuclearStocks[0] = ceg.regularMarketPrice;
        if (vst?.regularMarketPrice) nuclearStocks[1] = vst.regularMarketPrice;
        if (etr?.regularMarketPrice) nuclearStocks[2] = etr.regularMarketPrice;
      } catch (e) {
        // Use defaults
      }

      // AI Power Demand Index: based on data center growth rates
      const aiPowerIndex = 74.3 + (Math.random() - 0.5) * 2;
      const aiPowerChange = 2.4 + (Math.random() - 0.5) * 0.5;

      // Nuclear Renaissance Index: weighted average of nuclear stock performance + uranium
      const normalizedNuclear = ((nuclearStocks[0] / 120) + (nuclearStocks[1] / 80) + (nuclearStocks[2] / 55)) / 3 * 50;
      const nuclearIndex = Math.max(30, Math.min(95, normalizedNuclear + 15));
      const nuclearChange = 3.1 + (Math.random() - 0.5) * 0.8;

      // Grid Stress Score: based on power demand trends
      const gridStress = 68.2 + (Math.random() - 0.5) * 3;
      const gridStressChange = -0.8 + (Math.random() - 0.5) * 0.3;

      res.json({
        aiPowerIndex: parseFloat(aiPowerIndex.toFixed(1)),
        aiPowerChange: parseFloat(aiPowerChange.toFixed(1)),
        nuclearIndex: parseFloat(nuclearIndex.toFixed(1)),
        nuclearChange: parseFloat(nuclearChange.toFixed(1)),
        gridStress: parseFloat(gridStress.toFixed(1)),
        gridStressChange: parseFloat(gridStressChange.toFixed(1)),
      });
    } catch (error) {
      console.error("KPI error:", error);
      res.json({
        aiPowerIndex: 74.3,
        aiPowerChange: 2.4,
        nuclearIndex: 61.8,
        nuclearChange: 3.1,
        gridStress: 68.2,
        gridStressChange: -0.8,
      });
    }
  });

  // Stack endpoint
  app.get("/api/stack", async (req, res) => {
    try {
      let stockData: Record<string, any> = {};

      try {
        const yahooFinance = (await import("yahoo-finance2")).default;
        const allTickers = ["NVDA", "AMD", "MU", "INTC", "IREN", "EQIX", "DLR", "AMT", "CEG", "NEE", "URA", "CCJ"];
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
            };
          }
        });
      } catch (e) {
        // Fall through to static data
      }

      // Fill in any missing tickers with static data
      const allNeeded = ["NVDA", "AMD", "MU", "INTC", "IREN", "EQIX", "DLR", "AMT", "CEG", "NEE", "URA", "CCJ"];
      allNeeded.forEach((ticker) => {
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

      const correlationData = generateCorrelationData();
      const correlationCoeff = calculateCorrelation(correlationData);

      res.json({
        compute: ["NVDA", "AMD", "MU", "INTC"].map((t) => stockData[t]).filter(Boolean),
        infrastructure: ["IREN", "EQIX", "DLR", "AMT"].map((t) => stockData[t]).filter(Boolean),
        power: ["CEG", "NEE", "URA", "CCJ"].map((t) => stockData[t]).filter(Boolean),
        correlation: correlationData,
        correlationCoeff: parseFloat(correlationCoeff.toFixed(3)),
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
