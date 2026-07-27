/**
 * Lake 8: exhaustive unit coverage for The Stack transform module -
 * market-cap parsing/sorting, sparkline window math, treemap layout,
 * diverging heat colors.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HEAT_SATURATION_PCT,
  blendHex,
  buildHeatmapInput,
  heatColor,
  heatTextColor,
  layoutHeatmap,
  marketCapOf,
  parseMarketCapDisplay,
  pctFromSparkline,
  sortTableRows,
  windowDirection,
} from "../stack-transforms";
import { INK, SURFACE } from "../tokens";

describe("parseMarketCapDisplay", () => {
  it("parses T/B/M suffixes into $B units", () => {
    assert.equal(parseMarketCapDisplay("$3.2T"), 3200);
    assert.equal(parseMarketCapDisplay("850B"), 850);
    assert.equal(parseMarketCapDisplay("$500M"), 0.5);
  });
  it("the old parseM bug: $50M must NOT equal $50B", () => {
    assert.notEqual(parseMarketCapDisplay("$50M"), parseMarketCapDisplay("$50B"));
    assert.equal(parseMarketCapDisplay("$50M"), 0.05);
    assert.equal(parseMarketCapDisplay("$50B"), 50);
  });
  it("tolerates spacing and lowercase units", () => {
    assert.equal(parseMarketCapDisplay(" $1.5 t "), 1500);
    assert.equal(parseMarketCapDisplay("2b"), 2);
  });
  it("returns null for garbage, empty, and missing", () => {
    for (const bad of [undefined, null, "", "N/A", "big", "$-3B"]) {
      assert.equal(parseMarketCapDisplay(bad as never), null, String(bad));
    }
  });
});

describe("marketCapOf", () => {
  it("prefers the live numeric field (in dollars) over the display string", () => {
    assert.equal(marketCapOf({ marketCap: 4.5e12, marketCapDisplay: "$3.8T" }), 4500);
  });
  it("falls back to the display string", () => {
    assert.equal(marketCapOf({ marketCapDisplay: "$100B" }), 100);
  });
  it("ignores non-positive numeric caps", () => {
    assert.equal(marketCapOf({ marketCap: 0, marketCapDisplay: "$1B" }), 1);
    assert.equal(marketCapOf({ marketCap: -5 }), null);
  });
});

describe("pctFromSparkline", () => {
  it("computes first->last % change", () => {
    assert.equal(pctFromSparkline([100, 110]), 10);
    assert.equal(pctFromSparkline([100, 90]), -10);
  });
  it("skips leading zeros/non-finite when picking the base", () => {
    assert.equal(pctFromSparkline([0, 100, 110]), 10);
    assert.equal(pctFromSparkline([NaN, 100, 110]), 10);
  });
  it("null for short or missing windows", () => {
    assert.equal(pctFromSparkline([]), null);
    assert.equal(pctFromSparkline([5]), null);
    assert.equal(pctFromSparkline(undefined), null);
    assert.equal(pctFromSparkline(null), null);
  });
});

describe("windowDirection", () => {
  it("up/down by the window's own net move", () => {
    assert.equal(windowDirection([100, 101]), "up");
    assert.equal(windowDirection([101, 100]), "down");
  });
  it("negligible moves are flat", () => {
    assert.equal(windowDirection([100, 100.001]), "flat");
  });
  it("null when the window cannot be computed", () => {
    assert.equal(windowDirection([]), null);
  });
});

describe("sortTableRows", () => {
  const rows = [
    { ticker: "A", price: 10, d1: 1, d5: null, m1: 2, mktcap: 100, pe: null, revGrowth: 5 },
    { ticker: "B", price: 20, d1: -1, d5: 3, m1: null, mktcap: null, pe: 30, revGrowth: null },
    { ticker: "C", price: null, d1: 0, d5: 1, m1: 1, mktcap: 50, pe: 10, revGrowth: 0 },
  ];
  it("sorts numerically desc with nulls always last", () => {
    const out = sortTableRows(rows, "mktcap", "desc");
    assert.deepEqual(out.map((r) => r.ticker), ["A", "C", "B"]);
  });
  it("nulls stay last even ascending", () => {
    const out = sortTableRows(rows, "mktcap", "asc");
    assert.deepEqual(out.map((r) => r.ticker), ["C", "A", "B"]);
  });
  it("ticker sort is lexicographic and respects direction", () => {
    assert.deepEqual(sortTableRows(rows, "ticker", "asc").map((r) => r.ticker), ["A", "B", "C"]);
    assert.deepEqual(sortTableRows(rows, "ticker", "desc").map((r) => r.ticker), ["C", "B", "A"]);
  });
  it("all-null column falls back to ticker order", () => {
    const allNull = rows.map((r) => ({ ...r, pe: null }));
    assert.deepEqual(sortTableRows(allNull, "pe", "desc").map((r) => r.ticker), ["A", "B", "C"]);
  });
  it("does not mutate the input", () => {
    const before = rows.map((r) => r.ticker);
    sortTableRows(rows, "price", "desc");
    assert.deepEqual(rows.map((r) => r.ticker), before);
  });
});

const LAYERS = [
  { key: "compute", title: "Compute", color: "#123" },
  { key: "nuclear", title: "Nuclear", color: "#456" },
  { key: "etfsBenchmarks", title: "ETFs", color: "#789" },
];

describe("buildHeatmapInput", () => {
  it("groups by layer and totals sizes", () => {
    const input = buildHeatmapInput(LAYERS, {
      compute: [
        { ticker: "NVDA", name: "NVIDIA", changePercent: 1, marketCap: 4e12 },
        { ticker: "AMD", name: "AMD", changePercent: -1, marketCapDisplay: "$300B" },
      ],
      nuclear: [{ ticker: "CEG", name: "Constellation", changePercent: 0.5, marketCapDisplay: "$85B" }],
    });
    assert.equal(input.groups.length, 2);
    const compute = input.groups.find((g) => g.key === "compute")!;
    assert.equal(compute.stocks.length, 2);
    assert.equal(compute.totalB, 4000 + 300);
  });
  it("excludes ETF benchmarks entirely", () => {
    const input = buildHeatmapInput(LAYERS, {
      etfsBenchmarks: [{ ticker: "SPY", name: "SPDR", changePercent: 1, marketCapDisplay: "$500B" }],
      compute: [{ ticker: "NVDA", name: "NVIDIA", changePercent: 1, marketCap: 4e12 }],
    });
    assert.equal(input.groups.length, 1);
    assert.equal(input.groups[0].key, "compute");
  });
  it("lists unsized tickers instead of silently dropping them", () => {
    const input = buildHeatmapInput(LAYERS, {
      compute: [
        { ticker: "NVDA", name: "NVIDIA", changePercent: 1, marketCap: 4e12 },
        { ticker: "MYST", name: "Mystery", changePercent: 2 },
      ],
    });
    assert.deepEqual(input.unsized, ["MYST"]);
  });
  it("drops empty groups", () => {
    const input = buildHeatmapInput(LAYERS, { compute: [], nuclear: [] });
    assert.equal(input.groups.length, 0);
  });
});

describe("layoutHeatmap", () => {
  const input = buildHeatmapInput(LAYERS, {
    compute: [
      { ticker: "BIG", name: "Big", changePercent: 1, marketCapDisplay: "$900B" },
      { ticker: "SML", name: "Small", changePercent: -1, marketCapDisplay: "$100B" },
    ],
  });
  it("tiles stay inside the canvas and have positive area", () => {
    const { tiles } = layoutHeatmap(input, 800, 400);
    assert.equal(tiles.length, 2);
    for (const t of tiles) {
      assert.ok(t.x0 >= 0 && t.y0 >= 0 && t.x1 <= 800 && t.y1 <= 400);
      assert.ok(t.x1 > t.x0 && t.y1 > t.y0);
    }
  });
  it("areas are proportional to market cap (within padding tolerance)", () => {
    const { tiles } = layoutHeatmap(input, 800, 400);
    const area = (t: (typeof tiles)[number]) => (t.x1 - t.x0) * (t.y1 - t.y0);
    const big = tiles.find((t) => t.ticker === "BIG")!;
    const sml = tiles.find((t) => t.ticker === "SML")!;
    const ratio = area(big) / area(sml);
    assert.ok(ratio > 7 && ratio < 11, `ratio ${ratio}`);
  });
  it("group rect carries the header band and contains its tiles", () => {
    const { tiles, groups } = layoutHeatmap(input, 800, 400);
    assert.equal(groups.length, 1);
    const g = groups[0];
    for (const t of tiles) {
      assert.ok(t.x0 >= g.x0 && t.x1 <= g.x1 && t.y0 >= g.y0 && t.y1 <= g.y1);
    }
  });
  it("degenerate canvas or empty input yields nothing", () => {
    assert.deepEqual(layoutHeatmap(input, 0, 400), { tiles: [], groups: [] });
    assert.deepEqual(layoutHeatmap({ groups: [], unsized: [] }, 800, 400), { tiles: [], groups: [] });
  });
});

describe("blendHex", () => {
  it("f=0 returns a, f=1 returns b, midpoint blends", () => {
    assert.equal(blendHex("#000000", "#ffffff", 0), "#000000");
    assert.equal(blendHex("#000000", "#ffffff", 1), "#ffffff");
    assert.equal(blendHex("#000000", "#ffffff", 0.5), "#808080");
  });
  it("clamps f outside [0,1]", () => {
    assert.equal(blendHex("#000000", "#ffffff", -1), "#000000");
    assert.equal(blendHex("#000000", "#ffffff", 2), "#ffffff");
  });
});

describe("heatColor", () => {
  it("null and non-finite get the neutral surface (absence is not a flat day)", () => {
    assert.equal(heatColor(null), SURFACE.overlay);
    assert.equal(heatColor(NaN), SURFACE.overlay);
  });
  it("positive and negative diverge from neutral", () => {
    assert.notEqual(heatColor(2), heatColor(-2));
    assert.notEqual(heatColor(2), SURFACE.overlay);
  });
  it("magnitude saturates at the cap", () => {
    assert.equal(heatColor(HEAT_SATURATION_PCT), heatColor(HEAT_SATURATION_PCT * 3));
  });
  it("larger magnitude moves further from neutral", () => {
    const dist = (hex: string) => {
      const c = (s: string, i: number) => parseInt(s.slice(i, i + 2), 16);
      const n = SURFACE.overlay;
      return (
        Math.abs(c(hex, 1) - c(n, 1)) + Math.abs(c(hex, 3) - c(n, 3)) + Math.abs(c(hex, 5) - c(n, 5))
      );
    };
    assert.ok(dist(heatColor(3)) > dist(heatColor(0.5)));
  });
});

describe("heatTextColor", () => {
  it("muted ink on unknown, primary ink on real values", () => {
    assert.equal(heatTextColor(null), INK.muted);
    assert.equal(heatTextColor(2.5), INK.primary);
  });
});
