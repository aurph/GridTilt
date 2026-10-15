import { after, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

process.env.UNSUB_TOKEN_SECRET ||= "test-secret-for-timeline-routes";
process.env.ADMIN_API_KEY ||= "test-admin-key";
process.env.NODE_ENV = "test";

interface YahooLike {
  quote: (...args: unknown[]) => Promise<unknown>;
  quoteSummary: (...args: unknown[]) => Promise<unknown>;
  chart: (...args: unknown[]) => Promise<unknown>;
}
const yahooModule = await import("yahoo-finance2");
const YahooFinanceClass = (yahooModule as unknown as { default: new () => YahooLike }).default;
const yahooProto = YahooFinanceClass.prototype as YahooLike;
const original = { quote: yahooProto.quote, quoteSummary: yahooProto.quoteSummary, chart: yahooProto.chart };
yahooProto.quote = () => Promise.reject(new Error("offline"));
yahooProto.quoteSummary = () => Promise.reject(new Error("offline"));
yahooProto.chart = () => Promise.reject(new Error("offline"));

// Count every request that leaves for a GPU provider; answer the rest offline.
const nativeFetch = globalThis.fetch;
let providerCalls = 0;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("http://127.0.0.1:")) return nativeFetch(input, init);
  if (url.includes("runpod") || url.includes("vast.ai")) providerCalls += 1;
  return new Response("offline", { status: 503 });
}) as typeof fetch;

after(() => {
  Object.assign(yahooProto, original);
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

interface TimelinePayload {
  today: string;
  events: Array<{ id: string; date: string; eventType: string; sourceUrl: string }>;
  estimatedEarnings: unknown[];
}

for (const flag of [undefined, "true"]) {
  test(`timeline reads stored data only and never calls a GPU provider (GPU_LIVE_SWEEP_ENABLED=${flag ?? "unset"})`, async () => {
    if (flag) process.env.GPU_LIVE_SWEEP_ENABLED = flag;
    else delete process.env.GPU_LIVE_SWEEP_ENABLED;
    providerCalls = 0;
    const { url, close } = await startTestServer();
    try {
      const response = await fetch(`${url}/api/timeline`);
      assert.equal(response.status, 200);
      const body = (await response.json()) as TimelinePayload;
      assert.match(body.today, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(body.events.length > 0);
      assert.ok(Array.isArray(body.estimatedEarnings));
      assert.ok(body.events.some((e) => e.eventType === "power_deal"));
      assert.ok(body.events.some((e) => e.eventType === "cluster_announced"));
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(providerCalls, 0);
    } finally {
      delete process.env.GPU_LIVE_SWEEP_ENABLED;
      await close();
    }
  });
}
