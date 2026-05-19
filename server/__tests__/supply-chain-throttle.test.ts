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
  stale: boolean;
}
interface Stage {
  key: string;
  name: string;
  avgChange: number;
  stocks: StaleStock[];
}
interface SupplyChainResponse {
  stages: Stage[];
  tightestBottleneck: string;
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

test("GET /api/supply-chain returns stale tickers with null changePercent when Yahoo is throttled", async () => {
  const { url, close } = await startTestServer();
  try {
    const res = await fetch(`${url}/api/supply-chain`);
    assert.equal(res.status, 200, "expected 200 OK");
    const body = (await res.json()) as SupplyChainResponse;
    assert.ok(Array.isArray(body.stages) && body.stages.length > 0, "expected stages array");

    const allStocks: StaleStock[] = body.stages.flatMap((s) => s.stocks);
    assert.ok(allStocks.length > 0, "expected at least one stock across stages");

    const staleStocks = allStocks.filter((s) => s.stale === true);
    assert.ok(
      staleStocks.length > 0,
      `expected at least one stale ticker under throttle, got ${staleStocks.length}`,
    );

    for (const s of staleStocks) {
      assert.equal(s.changePercent, null, `stale ticker ${s.ticker} must have changePercent: null, got ${s.changePercent}`);
      assert.equal(s.change, null, `stale ticker ${s.ticker} must have change: null, got ${s.change}`);
    }

    const zeroFallbacks = allStocks.filter(
      (s) => s.stale && (s.changePercent === 0 || s.change === 0),
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

test("Stage avgChange does not get pulled toward 0 by stale tickers", async () => {
  const { url, close } = await startTestServer();
  try {
    const res = await fetch(`${url}/api/supply-chain`);
    const body = (await res.json()) as SupplyChainResponse;
    for (const stage of body.stages) {
      const liveStocks = stage.stocks.filter((s) => !s.stale);
      if (liveStocks.length === 0) {
        assert.equal(
          stage.avgChange,
          0,
          `${stage.name} has no live stocks; avgChange should be 0 (no fabricated number)`,
        );
      }
    }
  } finally {
    await close();
  }
});
