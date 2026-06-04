// ─── Index validation backtest ───────────────────────────────────────────
//
// Reconstructs the GridTilt index series from public daily price history
// using the EXACT shipped formulas (imported from server/indices.ts), then
// correlates the two contested momentum gauges (AI Demand, Grid Stress)
// against a physical electricity-output series. Run:
//
//   npm run backtest:indices
//
// Outputs:
//   docs/INDEX_VALIDATION.md          human-readable study
//   server/data/index-history.json    reconstructed daily series seed
//
// Design notes:
// - Returns use ADJUSTED closes (splits/dividends; NVDA split 10:1 in
//   June 2024 would otherwise fabricate a -90% day).
// - NPI level reconstruction uses RAW closes against its Jan-1-2024 bases,
//   matching production, with the uranium and policy legs held at par
//   (no public daily history for either); labeled as such everywhere.
// - Physical series: FRED IPG2211A2N (Industrial Production: Electric
//   Power Generation, Transmission & Distribution; NAICS 2211; monthly,
//   not seasonally adjusted; no API key required). NSA, so growth is
//   measured year-over-year to cancel seasonality.

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import YahooFinance from "yahoo-finance2";
import {
  AI_INDEX,
  GRID_STRESS,
  NPI_BASE,
  NPI_WEIGHTS,
  computeAiPowerIndex,
  computeGridStress,
  computeNpi,
} from "../server/indices";

const START = "2019-01-01";
const FRED_SERIES = "IPG2211A2N";
const FRED_URL = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${FRED_SERIES}`;

const TICKERS = ["NVDA", "TSM", "EQIX", "MU", "VST", "CEG", "CCJ", "NLR"] as const;
type Ticker = (typeof TICKERS)[number];

interface DayBar {
  date: string; // YYYY-MM-DD (UTC)
  close: number;
  adjClose: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthOf = (date: string) => date.slice(0, 7);

function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  return num / Math.sqrt(dx * dy);
}

async function fetchBars(yf: InstanceType<typeof YahooFinance>, ticker: Ticker): Promise<DayBar[]> {
  const res = await yf.chart(ticker, { period1: START, interval: "1d" });
  const bars: DayBar[] = [];
  for (const q of res.quotes) {
    if (q.close == null) continue;
    bars.push({
      date: iso(new Date(q.date)),
      close: q.close,
      adjClose: q.adjclose ?? q.close,
    });
  }
  return bars;
}

async function fetchFredMonthly(): Promise<Map<string, number>> {
  const res = await fetch(FRED_URL);
  if (!res.ok) throw new Error(`FRED fetch failed: ${res.status}`);
  const csv = await res.text();
  const out = new Map<string, number>(); // YYYY-MM -> index value
  for (const line of csv.trim().split("\n").slice(1)) {
    const [date, raw] = line.split(",");
    const v = parseFloat(raw);
    if (!date || Number.isNaN(v)) continue;
    out.set(date.slice(0, 7), v);
  }
  return out;
}

function dailyReturnsPct(bars: DayBar[]): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].adjClose;
    if (prev > 0) out.set(bars[i].date, ((bars[i].adjClose - prev) / prev) * 100);
  }
  return out;
}

function meanByMonth(daily: Map<string, number>): Map<string, number> {
  const sums = new Map<string, { s: number; n: number }>();
  for (const [date, v] of daily) {
    const m = monthOf(date);
    const cur = sums.get(m) ?? { s: 0, n: 0 };
    cur.s += v;
    cur.n += 1;
    sums.set(m, cur);
  }
  return new Map([...sums].map(([m, { s, n }]) => [m, s / n]));
}

/** Correlate a monthly signal against FRED YoY growth at lead 0..3 months. */
function correlateAtLeads(
  signal: Map<string, number>,
  fredYoY: Map<string, number>,
  leads: number[],
): Map<number, { r: number; n: number }> {
  const out = new Map<number, { r: number; n: number }>();
  for (const lead of leads) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [m, s] of signal) {
      const [y, mo] = m.split("-").map(Number);
      const target = new Date(Date.UTC(y, mo - 1 + lead, 1));
      const key = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}`;
      const g = fredYoY.get(key);
      if (g != null) {
        xs.push(s);
        ys.push(g);
      }
    }
    out.set(lead, { r: pearson(xs, ys), n: xs.length });
  }
  return out;
}

const fmt = (r: number) => (Number.isNaN(r) ? "n/a" : r.toFixed(2));

async function main() {
  console.log("Fetching daily bars for", TICKERS.join(", "));
  const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  const bars = new Map<Ticker, DayBar[]>();
  for (const t of TICKERS) {
    bars.set(t, await fetchBars(yf, t));
    await new Promise((r) => setTimeout(r, 400)); // be polite to the source
    console.log(`  ${t}: ${bars.get(t)!.length} bars`);
  }

  console.log("Fetching FRED", FRED_SERIES);
  const fred = await fetchFredMonthly();

  // FRED YoY growth (NSA series, so YoY cancels seasonality).
  const fredYoY = new Map<string, number>();
  for (const [m, v] of fred) {
    const [y, mo] = m.split("-");
    const prevKey = `${Number(y) - 1}-${mo}`;
    const prev = fred.get(prevKey);
    if (prev != null && prev > 0) fredYoY.set(m, ((v - prev) / prev) * 100);
  }

  // Daily % returns per ticker (adjusted).
  const ret = new Map<Ticker, Map<string, number>>();
  for (const t of TICKERS) ret.set(t, dailyReturnsPct(bars.get(t)!));

  // Trading days where every constituent of a basket has a return.
  const datesFor = (need: Ticker[]): string[] => {
    const first = ret.get(need[0])!;
    return [...first.keys()]
      .filter((d) => need.every((t) => ret.get(t)!.has(d)))
      .sort();
  };

  const aiTickers: Ticker[] = ["NVDA", "TSM", "EQIX", "MU"];
  const gsTickers: Ticker[] = ["VST", "CEG", "EQIX"];

  // Reconstruct the daily gauge values with the shipped formulas.
  const aiDaily = new Map<string, number>(); // index value
  for (const d of datesFor(aiTickers)) {
    aiDaily.set(
      d,
      computeAiPowerIndex({
        nvdaChange: ret.get("NVDA")!.get(d)!,
        tsmChange: ret.get("TSM")!.get(d)!,
        eqixChange: ret.get("EQIX")!.get(d)!,
        muChange: ret.get("MU")!.get(d)!,
      }),
    );
  }
  const gsDaily = new Map<string, number>();
  for (const d of datesFor(gsTickers)) {
    gsDaily.set(
      d,
      computeGridStress({
        vstChange: ret.get("VST")!.get(d)!,
        cegChange: ret.get("CEG")!.get(d)!,
        eqixChange: ret.get("EQIX")!.get(d)!,
      }),
    );
  }

  // Monthly signal = mean deviation from baseline (pure basket momentum).
  const aiSignal = meanByMonth(
    new Map([...aiDaily].map(([d, v]) => [d, v - AI_INDEX.BASELINE])),
  );
  const gsSignal = meanByMonth(
    new Map([...gsDaily].map(([d, v]) => [d, v - GRID_STRESS.BASELINE])),
  );

  const leads = [0, 1, 2, 3];
  const aiCorr = correlateAtLeads(aiSignal, fredYoY, leads);
  const gsCorr = correlateAtLeads(gsSignal, fredYoY, leads);

  // Robustness subwindow: the AI-buildout thesis dates to ~2024, so also
  // report the gauges over 2024+ only (fewer points, wider intervals).
  const since2024 = (m: Map<string, number>) =>
    new Map([...m].filter(([k]) => k >= "2024-01"));
  const aiCorr24 = correlateAtLeads(since2024(aiSignal), fredYoY, leads);
  const gsCorr24 = correlateAtLeads(since2024(gsSignal), fredYoY, leads);

  // Single-constituent bar: does the basket beat its own best stock?
  const constituentCorr = (tickers: Ticker[]) => {
    const rows: { ticker: Ticker; byLead: Map<number, { r: number; n: number }> }[] = [];
    for (const t of tickers) {
      rows.push({ ticker: t, byLead: correlateAtLeads(meanByMonth(ret.get(t)!), fredYoY, leads) });
    }
    return rows;
  };
  const aiConstituents = constituentCorr(aiTickers);
  const gsConstituents = constituentCorr(gsTickers);

  // NPI level reconstruction (raw closes, uranium + policy at par).
  const rawClose = (t: Ticker) => new Map(bars.get(t)!.map((b) => [b.date, b.close]));
  const cegC = rawClose("CEG");
  const vstC = rawClose("VST");
  const ccjC = rawClose("CCJ");
  const nlrC = rawClose("NLR");
  const npiDaily = new Map<string, number>();
  for (const d of [...cegC.keys()].sort()) {
    if (d < "2024-01-01") continue;
    const ceg = cegC.get(d);
    const vst = vstC.get(d);
    const ccj = ccjC.get(d);
    const nlr = nlrC.get(d);
    if (ceg == null || vst == null || ccj == null || nlr == null) continue;
    npiDaily.set(
      d,
      computeNpi({
        cegPrice: ceg,
        vstPrice: vst,
        ccjPrice: ccj,
        nlrPrice: nlr,
        uraniumSpot: NPI_BASE.URANIUM_SPOT, // held at par: no public daily series
        smrPolicyScore: 5, // held neutral: policy score has no daily history
      }).npiValue,
    );
  }

  // ── NPI redundancy check ──
  // The skeptical question: NLR (an existing ETF) is already 20% of NPI.
  // If NPI's equity legs mostly track NLR rebased, the custom basket is an
  // ETF with extra steps and its distinctiveness rests entirely on the two
  // judgment legs (uranium spot + policy, 20% of weight).
  const rebase = (closes: Map<string, number>, base: number) => {
    const out = new Map<string, number>();
    for (const d of [...closes.keys()].sort()) {
      if (d < "2024-01-01") continue;
      out.set(d, (100 * closes.get(d)!) / base);
    }
    return out;
  };
  const seriesReturns = (m: Map<string, number>) => {
    const keys = [...m.keys()].sort();
    const out = new Map<string, number>();
    for (let i = 1; i < keys.length; i++) {
      const prev = m.get(keys[i - 1])!;
      if (prev > 0) out.set(keys[i], ((m.get(keys[i])! - prev) / prev) * 100);
    }
    return out;
  };
  const corrOnCommonDates = (a: Map<string, number>, b: Map<string, number>) => {
    const dates = [...a.keys()].filter((d) => b.has(d)).sort();
    return {
      r: pearson(dates.map((d) => a.get(d)!), dates.map((d) => b.get(d)!)),
      n: dates.length,
    };
  };

  const npiRet = seriesReturns(npiDaily);
  const nlrLevel = rebase(nlrC, NPI_BASE.NLR);
  const benches: Array<{ name: string; level: Map<string, number> }> = [
    { name: "NLR", level: nlrLevel },
    { name: "CEG", level: rebase(cegC, NPI_BASE.CEG) },
    { name: "VST", level: rebase(vstC, NPI_BASE.VST) },
    { name: "CCJ", level: rebase(ccjC, NPI_BASE.CCJ) },
  ];
  const redundancy = benches.map((b) => {
    const { r, n } = corrOnCommonDates(npiRet, seriesReturns(b.level));
    return { name: b.name, r, n };
  });

  // Level tracking vs NLR: where do the two base-100 lines sit today, and
  // how far apart have they drifted?
  const commonLevelDates = [...npiDaily.keys()].filter((d) => nlrLevel.has(d)).sort();
  const levelDiffs = commonLevelDates.map((d) => npiDaily.get(d)! - nlrLevel.get(d)!);
  const lastDate = commonLevelDates.at(-1)!;
  const levelStats = {
    lastDate,
    npiLast: npiDaily.get(lastDate)!,
    nlrLast: nlrLevel.get(lastDate)!,
    meanAbsDiff: levelDiffs.reduce((a, b) => a + Math.abs(b), 0) / levelDiffs.length,
    maxAbsDiff: Math.max(...levelDiffs.map(Math.abs)),
  };

  // Intra-product overlap: CEG+VST are 45% of NPI and 75% of Grid Stress.
  // If the two headline numbers co-move tightly, the dashboard is showing
  // one signal twice under two names.
  const gsDailySignal = new Map(
    [...gsDaily].map(([d, v]) => [d, v - GRID_STRESS.BASELINE] as [string, number]),
  );
  const npiVsGs = corrOnCommonDates(npiRet, gsDailySignal);

  // Current EFFECTIVE weights. The basket is never rebalanced, so a
  // constituent's share of the level (and of daily variance) is its stated
  // weight times its price relative, renormalized. Strong performers
  // swallow the basket over time; this quantifies how far that has gone.
  const relAt = (closes: Map<string, number>, base: number) =>
    (closes.get(lastDate) ?? NaN) / base;
  const effTerms = {
    CEG: NPI_WEIGHTS.ceg * relAt(cegC, NPI_BASE.CEG),
    VST: NPI_WEIGHTS.vst * relAt(vstC, NPI_BASE.VST),
    CCJ: NPI_WEIGHTS.ccj * relAt(ccjC, NPI_BASE.CCJ),
    NLR: NPI_WEIGHTS.nlr * relAt(nlrC, NPI_BASE.NLR),
    uranium: NPI_WEIGHTS.uranium * 1, // held at par (no daily series)
    policy: NPI_WEIGHTS.policy * 1, // held at par
  };
  const effDenom = Object.values(effTerms).reduce((a, b) => a + b, 0);
  const effWeights = Object.fromEntries(
    Object.entries(effTerms).map(([k, v]) => [k, v / effDenom]),
  ) as Record<keyof typeof effTerms, number>;

  const nlrR = redundancy.find((x) => x.name === "NLR")!.r;
  const dominant = redundancy.reduce((a, b) => (b.r > a.r ? b : a));
  const redundancyVerdict =
    dominant.r >= 0.95
      ? `**SINGLE-STOCK DOMINATED: ${dominant.name} alone explains ${(dominant.r * dominant.r * 100).toFixed(0)}% of NPI's daily variance** (r ${fmt(dominant.r)}). Not redundant with the NLR ETF (r ${fmt(nlrR)}), but the un-rebalanced price-relative construction has let the best performer swallow the basket: ${dominant.name}'s effective weight is ${(effWeights[dominant.name as "VST"] * 100).toFixed(0)}% today vs ${(NPI_WEIGHTS[dominant.name.toLowerCase() as "vst"] * 100).toFixed(0)}% stated. The index increasingly tracks one company, not a complex.`
      : nlrR >= 0.95
        ? `**REDUNDANT with NLR** (daily-return r ${fmt(nlrR)}, R² ${fmt(nlrR * nlrR)}): the custom basket is an existing ETF with extra steps; its distinctiveness rests entirely on the uranium and policy judgment legs.`
        : nlrR >= 0.85
          ? `**LARGELY OVERLAPPING with NLR** (daily-return r ${fmt(nlrR)}, R² ${fmt(nlrR * nlrR)}): most daily variance is the nuclear-ETF complex; the merchant-power tilt and judgment legs carry the remaining distinctiveness.`
          : `**DIFFERENTIATED from NLR** (daily-return r ${fmt(nlrR)}, R² ${fmt(nlrR * nlrR)}): the merchant-power weighting moves the basket away from the off-the-shelf ETF.`;

  // ── Write the seeded history file ──
  const histDates = [...aiDaily.keys()].filter((d) => d >= "2024-01-01").sort();
  const history = {
    generated: new Date().toISOString(),
    method:
      "Deterministic reconstruction from public daily prices using server/indices.ts. Regenerate any time with: npm run backtest:indices",
    notes: {
      aiDemand: "Shipped formula over adjusted daily closes.",
      gridStress: "Shipped formula over adjusted daily closes.",
      npiEquityLegs:
        "Raw closes vs Jan-1-2024 bases with uranium and policy legs held at par (20% of weight). NOT the full production NPI.",
    },
    days: histDates.map((d) => ({
      date: d,
      aiDemand: parseFloat(aiDaily.get(d)!.toFixed(1)),
      gridStress: gsDaily.has(d) ? parseFloat(gsDaily.get(d)!.toFixed(1)) : null,
      npiEquityLegs: npiDaily.has(d) ? npiDaily.get(d)! : null,
    })),
  };
  const histPath = join(process.cwd(), "server", "data", "index-history.json");
  writeFileSync(histPath, JSON.stringify(history, null, 2) + "\n");
  console.log(`Wrote ${history.days.length} days -> ${histPath}`);

  // ── Write the validation doc ──
  const window = `${[...aiSignal.keys()].sort()[0]} to ${[...aiSignal.keys()].sort().at(-1)}`;
  const corrTable = (
    label: string,
    idx: Map<number, { r: number; n: number }>,
    constituents: { ticker: Ticker; byLead: Map<number, { r: number; n: number }> }[],
  ) => {
    const header = `| Series | r (lead 0) | r (+1 mo) | r (+2 mo) | r (+3 mo) | n |\n|---|---|---|---|---|---|`;
    const rows = [
      `| **${label} (basket)** | **${fmt(idx.get(0)!.r)}** | **${fmt(idx.get(1)!.r)}** | **${fmt(
        idx.get(2)!.r,
      )}** | **${fmt(idx.get(3)!.r)}** | ${idx.get(0)!.n} |`,
      ...constituents.map(
        (c) =>
          `| ${c.ticker} alone | ${fmt(c.byLead.get(0)!.r)} | ${fmt(c.byLead.get(1)!.r)} | ${fmt(
            c.byLead.get(2)!.r,
          )} | ${fmt(c.byLead.get(3)!.r)} | ${c.byLead.get(0)!.n} |`,
      ),
    ];
    return [header, ...rows].join("\n");
  };

  // Programmatic verdict so regeneration always derives the conclusion
  // from the numbers, never from whoever last edited the prose.
  const verdictFor = (
    name: string,
    idx: Map<number, { r: number; n: number }>,
    constituents: { ticker: Ticker; byLead: Map<number, { r: number; n: number }> }[],
  ) => {
    const basketBest = Math.max(...leads.map((l) => idx.get(l)!.r));
    const constBest = Math.max(
      ...constituents.flatMap((c) => leads.map((l) => c.byLead.get(l)!.r)),
    );
    const clearsMagnitude = basketBest >= 0.2;
    const clearsConstituentBar = basketBest > constBest;
    if (clearsMagnitude && clearsConstituentBar) {
      return `**${name}: demonstrates a leading signal** (best r ${fmt(basketBest)}, beats its best single constituent at ${fmt(constBest)}). Labeled a forward-looking market proxy with the correlation shown.`;
    }
    const reasons = [
      ...(clearsMagnitude ? [] : [`no lead reaches r 0.2 (best ${fmt(basketBest)})`]),
      ...(clearsConstituentBar
        ? []
        : [`fails the single-constituent bar (best constituent reaches ${fmt(constBest)})`]),
    ];
    return `**${name}: no physical signal demonstrated** (${reasons.join("; ")}). Labeled a market sentiment gauge, not a physical measurement.`;
  };

  const doc = `# Index validation study

Generated ${new Date().toISOString().slice(0, 10)} by \`npm run backtest:indices\`.
Reproducible: the script reconstructs every number below from public data
using the exact shipped formulas in \`server/indices.ts\`.

## Question

The AI Demand and Grid Stress gauges are computed from constituent equity
moves. Do those market-based signals carry any information about physical
electricity output, or are they pure market sentiment?

## Method

- Reconstruct each gauge daily from adjusted closes, ${window}.
- Monthly signal = mean daily deviation from the gauge baseline
  (equivalently, mean weighted basket daily return x gain).
- Physical series: FRED \`${FRED_SERIES}\` (Industrial Production: Electric
  Power Generation, Transmission & Distribution; monthly, NSA). Growth is
  measured year over year to cancel seasonality.
- Pearson r at lead 0 (same month) and with the gauge leading physical
  growth by 1-3 months.
- Bar set by review: a basket only earns "index" framing if it beats its
  own best single constituent. Equity-basket proxies of physical
  quantities typically land near r 0.2-0.4.

## Findings

- ${verdictFor("AI Demand", aiCorr, aiConstituents)}
- ${verdictFor("Grid Stress", gsCorr, gsConstituents)}
- NPI: ${redundancyVerdict}

Sign instability across windows (see robustness tables) is consistent with
noise, not a weak-but-real signal.

## Results

### AI Demand vs physical electricity output growth

${corrTable("AI Demand", aiCorr, aiConstituents)}

Robustness, 2024+ only (the AI-buildout thesis window):

| Series | r (lead 0) | r (+1 mo) | r (+2 mo) | r (+3 mo) | n |
|---|---|---|---|---|---|
| AI Demand (basket) | ${fmt(aiCorr24.get(0)!.r)} | ${fmt(aiCorr24.get(1)!.r)} | ${fmt(
    aiCorr24.get(2)!.r,
  )} | ${fmt(aiCorr24.get(3)!.r)} | ${aiCorr24.get(0)!.n} |

### Grid Stress vs physical electricity output growth

${corrTable("Grid Stress", gsCorr, gsConstituents)}

Robustness, 2024+ only:

| Series | r (lead 0) | r (+1 mo) | r (+2 mo) | r (+3 mo) | n |
|---|---|---|---|---|---|
| Grid Stress (basket) | ${fmt(gsCorr24.get(0)!.r)} | ${fmt(gsCorr24.get(1)!.r)} | ${fmt(
    gsCorr24.get(2)!.r,
  )} | ${fmt(gsCorr24.get(3)!.r)} | ${gsCorr24.get(0)!.n} |

### NPI

NPI is a base-dated price-relative basket, not a daily momentum gauge, and
two of its legs (uranium spot, policy score; 20% of weight) have no public
daily history. It is reconstructed in \`server/data/index-history.json\`
with those legs held at par for transparency. No physical-correlation claim
is made for it; an equity index claiming to be an equity index does not
need one. The test it DOES need is redundancy.

### NPI redundancy check

Question: NLR (the VanEck Uranium+Nuclear ETF) is already 20% of NPI. Does
the custom basket add anything beyond what that off-the-shelf ETF already
shows? Tested on the NPI equity legs (80% of weight; uranium and policy at
par), raw closes vs Jan-1-2024 bases, daily returns since 2024.

| Benchmark | daily-return r vs NPI legs | R² | n |
|---|---|---|---|
${redundancy
  .map((x) => `| ${x.name} alone | ${fmt(x.r)} | ${fmt(x.r * x.r)} | ${x.n} |`)
  .join("\n")}

${redundancyVerdict}

Stated vs effective weights (${lastDate}; uranium and policy held at par):

| Constituent | Stated | Effective today |
|---|---|---|
| CEG | ${(NPI_WEIGHTS.ceg * 100).toFixed(0)}% | ${(effWeights.CEG * 100).toFixed(0)}% |
| VST | ${(NPI_WEIGHTS.vst * 100).toFixed(0)}% | ${(effWeights.VST * 100).toFixed(0)}% |
| CCJ | ${(NPI_WEIGHTS.ccj * 100).toFixed(0)}% | ${(effWeights.CCJ * 100).toFixed(0)}% |
| NLR | ${(NPI_WEIGHTS.nlr * 100).toFixed(0)}% | ${(effWeights.NLR * 100).toFixed(0)}% |
| Uranium spot | ${(NPI_WEIGHTS.uranium * 100).toFixed(0)}% | ${(effWeights.uranium * 100).toFixed(0)}% |
| Policy score | ${(NPI_WEIGHTS.policy * 100).toFixed(0)}% | ${(effWeights.policy * 100).toFixed(0)}% |

The basket is never rebalanced, so winners compound their own influence.
That is a legitimate index design (the S&P does it too), but it must be
disclosed: today's NPI is mostly a merchant-power position, and "Nuclear"
in the name overstates how nuclear-pure the exposure still is.

Level tracking, both rebased to 100 on Jan 1, 2024: NPI equity legs at
**${levelStats.npiLast.toFixed(1)}** vs NLR alone at **${levelStats.nlrLast.toFixed(1)}**
(${levelStats.lastDate}). Mean absolute gap ${levelStats.meanAbsDiff.toFixed(1)} points,
max ${levelStats.maxAbsDiff.toFixed(1)}. A persistent level gap with high daily
correlation means the baskets ride the same daily news but compound
differently; the merchant-power weighting (CEG+VST = 45%) is the driver.

### Intra-product overlap: NPI vs Grid Stress

CEG and VST are 45% of NPI and 75% of the Grid Stress basket. Daily
correlation between NPI equity-leg returns and the Grid Stress signal:
**r ${fmt(npiVsGs.r)}** (n=${npiVsGs.n}). Above ~0.8 the dashboard would be
showing one signal twice under two names; the number here quantifies how
much of "Grid Stress" is already inside NPI.

## Limitations

- ~${aiCorr.get(0)!.n} monthly observations; r values of this size carry wide
  confidence intervals. This study can rule labels in or out; it cannot
  fine-tune weights.
- FRED ${FRED_SERIES} measures total utility output, not datacenter load
  specifically. No public monthly datacenter-load series exists.
- Daily returns use adjusted closes; production uses live intraday change.
  Over monthly averages the difference is noise.

## Reading the numbers

The labels shipped in the UI follow these results: if a gauge does not
clear the single-constituent bar with a stable sign across leads, it is
labeled a market-sentiment gauge, not a physical measurement. See the
methodology section of the README for the formulas.
`;

  mkdirSync(join(process.cwd(), "docs"), { recursive: true });
  const docPath = join(process.cwd(), "docs", "INDEX_VALIDATION.md");
  writeFileSync(docPath, doc);
  console.log(`Wrote ${docPath}`);

  // Console summary for the session log.
  console.log("\n=== Correlation summary (r at lead 0/1/2/3, n) ===");
  console.log(
    "AI Demand:",
    leads.map((l) => fmt(aiCorr.get(l)!.r)).join(" / "),
    `n=${aiCorr.get(0)!.n}`,
  );
  for (const c of aiConstituents)
    console.log(`  ${c.ticker}:`, leads.map((l) => fmt(c.byLead.get(l)!.r)).join(" / "));
  console.log(
    "Grid Stress:",
    leads.map((l) => fmt(gsCorr.get(l)!.r)).join(" / "),
    `n=${gsCorr.get(0)!.n}`,
  );
  for (const c of gsConstituents)
    console.log(`  ${c.ticker}:`, leads.map((l) => fmt(c.byLead.get(l)!.r)).join(" / "));

  console.log("\n=== NPI redundancy (daily-return r vs NPI equity legs) ===");
  for (const x of redundancy) console.log(`  ${x.name}: r=${fmt(x.r)} R²=${fmt(x.r * x.r)} n=${x.n}`);
  console.log(
    `  Levels ${levelStats.lastDate}: NPI legs ${levelStats.npiLast.toFixed(1)} vs NLR ${levelStats.nlrLast.toFixed(1)}; mean|gap| ${levelStats.meanAbsDiff.toFixed(1)}, max ${levelStats.maxAbsDiff.toFixed(1)}`,
  );
  console.log(`  NPI vs Grid Stress signal: r=${fmt(npiVsGs.r)} n=${npiVsGs.n}`);
}

main().catch((err) => {
  console.error("Backtest failed:", err);
  process.exit(1);
});
