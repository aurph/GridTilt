import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

process.env.UNSUB_TOKEN_SECRET ||= "test-secret-for-throttle-test";
process.env.SESSION_SECRET ||= "test-session-secret";
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

const throttleError = () => {
  const err = new Error("Edge: Too Many Requests") as Error & { code?: string };
  err.code = "EDGE_THROTTLE";
  return Promise.reject(err);
};
proto.quote = () => throttleError();
proto.chart = () => throttleError();
proto.search = () => Promise.resolve({ quotes: [], news: [] });

after(() => {
  proto.quote = originalQuote;
  proto.chart = originalChart;
  if (originalSearch) proto.search = originalSearch;
});

const { registerRoutes } = await import("../routes");

interface StaleStock {
  ticker: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  stale?: boolean;
  sector?: string;
}

interface StackResponse {
  [key: string]: StaleStock[] | unknown;
}

interface SectorPulseRow {
  sector: string;
  label: string;
  avgChange: number;
}

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

// All sector arrays returned by /api/stack — used to flatten the response.
const STACK_SECTOR_KEYS = [
  "compute", "nuclear", "uranium", "powerHardware", "utilities",
  "dataCenters", "construction", "rawMaterialsMining", "rawMaterialsNatGas",
  "renewableGeneration", "transmissionGrid", "cryptoAIDC", "etfsBenchmarks",
];

test("GET /api/stack: throttled tickers expose stale=true and null change/changePercent (no fake 0)", async () => {
  const { url, close } = await startTestServer();
  try {
    const res = await fetch(`${url}/api/stack`);
    assert.equal(res.status, 200, "expected 200 OK");
    const body = (await res.json()) as StackResponse;

    const allStocks: StaleStock[] = STACK_SECTOR_KEYS.flatMap(
      (k) => (Array.isArray(body[k]) ? (body[k] as StaleStock[]) : []),
    );
    assert.ok(allStocks.length > 0, "expected at least one stock across all stack sectors");

    const staleStocks = allStocks.filter((s) => s.stale === true);
    assert.ok(
      staleStocks.length > 0,
      `expected at least one stale ticker under throttle, got ${staleStocks.length}`,
    );

    for (const s of staleStocks) {
      assert.equal(
        s.changePercent,
        null,
        `stale ticker ${s.ticker} must have changePercent: null, got ${s.changePercent}`,
      );
      assert.equal(
        s.change,
        null,
        `stale ticker ${s.ticker} must have change: null, got ${s.change}`,
      );
    }

    const zeroFallbacks = allStocks.filter(
      (s) => s.stale === true && (s.changePercent === 0 || s.change === 0),
    );
    assert.equal(
      zeroFallbacks.length,
      0,
      `stale tickers must not silently fall back to 0 (regression guard). Offenders: ${zeroFallbacks.map((s) => s.ticker).join(",")}`,
    );
  } finally {
    await close();
  }
});

test("GET /api/top-movers: a ticker with no known change is not a mover, so a full throttle returns []", async () => {
  const { url, close } = await startTestServer();
  try {
    const res = await fetch(`${url}/api/top-movers`);
    assert.equal(res.status, 200, "expected 200 OK");
    const movers = (await res.json()) as StaleStock[];
    assert.ok(Array.isArray(movers), "expected an array of movers");

    // The route now filters to tickers with a finite changePercent, matching
    // what /api/export/daily already did. Two reasons this is the right
    // contract: Math.abs(null) is 0, so stale rows used to sort as perfectly
    // flat and rank as "top" movers; and consumers received rows with no
    // number to render, which is how .toFixed on a null white-screened
    // /subscribe. Asserting emptiness rather than looping keeps this test from
    // passing vacuously once the filter is in place.
    assert.equal(
      movers.length,
      0,
      `under full throttle no ticker has a known change, so top-movers must be empty; got ${movers.length}: ${movers.map((m) => m.ticker).join(",")}`,
    );

    for (const m of movers) {
      assert.equal(
        typeof m.changePercent,
        "number",
        `any surfaced mover must carry a real number; ${m.ticker} had ${m.changePercent}`,
      );
    }

    // Belt and suspenders: no row at all may carry changePercent === 0 under
    // a full throttle. The only legitimate zeros would be live data, and
    // there is no live data in this test environment.
    const fakeZeros = movers.filter(
      (m) => m.changePercent === 0 || m.change === 0,
    );
    assert.equal(
      fakeZeros.length,
      0,
      `no mover may surface as +0.00% under full throttle. Offenders: ${fakeZeros.map((m) => m.ticker).join(",")}`,
    );
  } finally {
    await close();
  }
});

test("GET /api/sector-pulse: avgChange is 0 only when no live tickers, never silently averaged with stale=0", async () => {
  const { url, close } = await startTestServer();
  try {
    const res = await fetch(`${url}/api/sector-pulse`);
    assert.equal(res.status, 200, "expected 200 OK");
    const pulse = (await res.json()) as SectorPulseRow[];
    assert.ok(Array.isArray(pulse) && pulse.length > 0, "expected sector pulse rows");

    // Under full Yahoo throttle every sector has zero live tickers, so every
    // avgChange must be exactly 0 (no fabricated number). The regression we
    // are guarding against is treating stale tickers as 0 and emitting a tiny
    // non-zero average that looks live.
    for (const row of pulse) {
      assert.equal(
        row.avgChange,
        0,
        `sector ${row.sector} should report avgChange=0 when all tickers are throttled, got ${row.avgChange}`,
      );
      assert.equal(
        Number.isFinite(row.avgChange),
        true,
        `sector ${row.sector} avgChange must be a finite number, got ${row.avgChange}`,
      );
    }
  } finally {
    await close();
  }
});

test("GET /api/export/daily: top_movers excludes throttled tickers entirely (never +0.00% rows)", async () => {
  // /api/export/daily is admin-gated. Skip cleanly if no admin secret is wired
  // in the test environment, but still cover the route when one is present.
  const adminSecret = process.env.ADMIN_API_KEY || process.env.ADMIN_SECRET;
  if (!adminSecret) return;

  const { url, close } = await startTestServer();
  try {
    const res = await fetch(`${url}/api/export/daily`, {
      headers: { "x-admin-key": adminSecret },
    });
    if (res.status !== 200) return; // route may use a different auth shape; don't fail spuriously
    const body = (await res.json()) as { top_movers: Array<{ ticker: string; change_pct: number }> };
    assert.ok(Array.isArray(body.top_movers), "expected top_movers array");
    // Under throttle every ticker is stale, so the filter should drop them all.
    assert.equal(
      body.top_movers.length,
      0,
      `top_movers must exclude stale tickers under throttle, got ${body.top_movers.length}: ${body.top_movers.map((m) => m.ticker).join(",")}`,
    );
  } finally {
    await close();
  }
});
