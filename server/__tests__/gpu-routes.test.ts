import { after, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readGpuHistory, summarizeGpuHistory } from "../gpu-history";

process.env.UNSUB_TOKEN_SECRET ||= "test-secret-for-gpu-routes";
process.env.ADMIN_API_KEY ||= "test-admin-key";
process.env.NODE_ENV = "test";
const ADMIN_KEY = process.env.ADMIN_API_KEY;

interface YahooLike {
  quote: (...args: unknown[]) => Promise<unknown>;
  chart: (...args: unknown[]) => Promise<unknown>;
}
const yahooModule = await import("yahoo-finance2");
const YahooFinanceClass = (yahooModule as unknown as { default: new () => YahooLike }).default;
const yahooProto = YahooFinanceClass.prototype as YahooLike;
const originalQuote = yahooProto.quote;
const originalChart = yahooProto.chart;
yahooProto.quote = () => Promise.reject(new Error("offline"));
yahooProto.chart = () => Promise.reject(new Error("offline"));

// Keep a metrics request offline while still allowing this test to call its
// local Express server through the platform fetch implementation.
const nativeFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("http://127.0.0.1:")) return nativeFetch(input, init);
  if (url.includes("runpod")) {
    return new Response(JSON.stringify({ data: { gpuTypes: [] } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (url.includes("vast.ai")) {
    return new Response(JSON.stringify({ offers: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return nativeFetch(input, init);
}) as typeof fetch;

after(() => {
  yahooProto.quote = originalQuote;
  yahooProto.chart = originalChart;
  globalThis.fetch = nativeFetch;
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

test("GPU metrics expose persisted history health", async () => {
  const { url, close } = await startTestServer();
  try {
    const response = await fetch(`${url}/api/gpu-prices/metrics`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      lastRefreshed: string | null;
      health?: {
        recordedDays: number;
        lastRecordedDate: string | null;
        lastSweep: unknown;
        curatedLastRefreshed: string | null;
      };
    };
    assert.ok(body.health);
    const expected = summarizeGpuHistory(readGpuHistory());
    assert.equal(body.health.recordedDays, expected.recordedDays);
    assert.equal(body.health.lastRecordedDate, expected.lastRecordedDate);
    assert.ok("lastSweep" in body.health);
    assert.equal(body.health.curatedLastRefreshed, body.lastRefreshed);
  } finally {
    await close();
  }
});

test("admin GPU history returns the raw snapshots and rejects a missing key", async () => {
  const { url, close } = await startTestServer();
  try {
    const authorized = await fetch(`${url}/api/admin/gpu-history`, {
      headers: { "x-admin-key": ADMIN_KEY },
    });
    assert.equal(authorized.status, 200);
    assert.deepEqual(await authorized.json(), readGpuHistory());

    const unauthorized = await fetch(`${url}/api/admin/gpu-history`);
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { error: "Unauthorized" });
  } finally {
    await close();
  }
});
