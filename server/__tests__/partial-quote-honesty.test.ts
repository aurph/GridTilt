// The gap between "Yahoo is down" and "Yahoo is up": a quote that carries a
// price but no change fields.
//
// cached-stock-data-throttle.test.ts covers total failure, where the static
// fallback branch correctly emits null. This file covers the SUCCESS branch,
// which used to write `regularMarketChange ?? 0`. That fabricated a flat 0 for
// a move that was simply unknown, and because averageLiveChanges can only skip
// nulls, the fake 0 was then averaged in as a real observation. The doctrine
// was defeated at the source and every downstream guard was decoration.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

process.env.UNSUB_TOKEN_SECRET ||= "test-secret-for-partial-quote-test";
process.env.NODE_ENV = "test";

interface YahooLike {
  quote: (...args: unknown[]) => Promise<unknown>;
  chart: (...args: unknown[]) => Promise<unknown>;
  search?: (...args: unknown[]) => Promise<unknown>;
}

const yahooModule = await import("yahoo-finance2");
const YahooFinanceClass = (yahooModule as unknown as { default: new () => YahooLike }).default;
const proto = YahooFinanceClass.prototype as YahooLike;
const originalQuote = proto.quote;
const originalChart = proto.chart;
const originalSearch = proto.search;

// Every quote succeeds with a price and a name, and deliberately omits
// regularMarketChange / regularMarketChangePercent.
proto.quote = (...args: unknown[]) =>
  Promise.resolve({
    symbol: String(args[0] ?? "TEST"),
    longName: `Partial ${String(args[0] ?? "TEST")}`,
    regularMarketPrice: 100,
    marketCap: 1_000_000_000,
    marketState: "REGULAR",
    regularMarketPreviousClose: 100,
  });
proto.chart = () => Promise.resolve({ quotes: [] });
proto.search = () => Promise.resolve({ quotes: [], news: [] });

after(() => {
  proto.quote = originalQuote;
  proto.chart = originalChart;
  if (originalSearch) proto.search = originalSearch;
});

const { registerRoutes } = await import("../routes");

async function startTestServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => httpServer.close(() => resolve())),
  };
}

const STACK_SECTOR_KEYS = [
  "compute", "nuclear", "uranium", "powerHardware", "utilities",
  "dataCenters", "construction", "rawMaterialsMining", "rawMaterialsNatGas",
  "renewableGeneration", "transmissionGrid", "cryptoAIDC", "etfsBenchmarks",
];

interface Row {
  ticker: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
}

test("a quote with a price but no change fields serves null, not a fabricated 0", async () => {
  const { url, close } = await startTestServer();
  try {
    const res = await fetch(`${url}/api/stack`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    const rows: Row[] = STACK_SECTOR_KEYS.flatMap(
      (k) => (Array.isArray(body[k]) ? (body[k] as Row[]) : []),
    );
    assert.ok(rows.length > 0, "expected stack rows");

    // The price arrived, so these are live rows, not the static fallback.
    const priced = rows.filter((r) => r.price === 100);
    assert.ok(priced.length > 0, "expected the stubbed price to reach the response");

    const fabricated = priced.filter((r) => r.changePercent === 0 || r.change === 0);
    assert.equal(
      fabricated.length,
      0,
      `a missing change must serve null, never 0. Offenders: ${fabricated.map((r) => r.ticker).join(",")}`,
    );
    for (const r of priced) {
      assert.equal(r.changePercent, null, `${r.ticker} changePercent should be null`);
      assert.equal(r.change, null, `${r.ticker} change should be null`);
    }
  } finally {
    await close();
  }
});

test("sector averages ignore price-only quotes instead of averaging them as 0%", async () => {
  const { url, close } = await startTestServer();
  try {
    const res = await fetch(`${url}/api/sector-pulse`);
    assert.equal(res.status, 200);
    const pulse = (await res.json()) as Array<{ sector: string; avgChange: number }>;
    assert.ok(pulse.length > 0, "expected sector pulse rows");

    // Every ticker has a price and no change, so there are zero live
    // observations and the average must be the explicit no-data 0 rather than
    // an average over fabricated zeros. Both read 0 here, which is exactly why
    // the /api/stack assertion above is the load-bearing one; this test pins
    // that the route stays finite and does not produce NaN from an empty set.
    for (const row of pulse) {
      assert.equal(Number.isFinite(row.avgChange), true, `${row.sector} must be finite, got ${row.avgChange}`);
      assert.equal(row.avgChange, 0, `${row.sector} should report 0 with no live observations`);
    }
  } finally {
    await close();
  }
});

test("top-movers excludes price-only quotes: no number, not a mover", async () => {
  const { url, close } = await startTestServer();
  try {
    const res = await fetch(`${url}/api/top-movers`);
    assert.equal(res.status, 200);
    const movers = (await res.json()) as Row[];
    assert.ok(Array.isArray(movers));
    assert.equal(
      movers.length,
      0,
      `no ticker has a known change, so none can be a top mover; got ${movers.map((m) => m.ticker).join(",")}`,
    );
  } finally {
    await close();
  }
});
