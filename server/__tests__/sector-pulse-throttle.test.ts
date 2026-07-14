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

interface SectorPulseEntry {
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

test("GET /api/sector-pulse excludes stale tickers from averages under full throttle", async () => {
  const { url, close } = await startTestServer();
  try {
    const res = await fetch(`${url}/api/sector-pulse`);
    assert.equal(res.status, 200, "expected 200 OK");
    const body = (await res.json()) as SectorPulseEntry[];
    assert.ok(Array.isArray(body) && body.length > 0, "expected non-empty pulse array");

    for (const entry of body) {
      assert.equal(typeof entry.sector, "string");
      assert.equal(typeof entry.label, "string");
      assert.ok(
        Number.isFinite(entry.avgChange),
        `${entry.sector} avgChange must be a finite number, got ${entry.avgChange}`,
      );
      assert.equal(
        entry.avgChange,
        0,
        `${entry.sector}: with every ticker stale there are no live observations; avgChange must be 0, not a diluted "?? 0" average. Got ${entry.avgChange}`,
      );
    }
  } finally {
    await close();
  }
});
