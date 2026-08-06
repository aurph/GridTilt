import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

// Must be set before importing routes: registerRoutes throws at call time if
// UNSUB_TOKEN_SECRET is unset, and requireAdmin returns 503 (not 401) when
// ADMIN_API_KEY is unset.
process.env.UNSUB_TOKEN_SECRET ||= "test-secret-for-auth-test";
process.env.ADMIN_API_KEY ||= "test-admin-key";
process.env.NODE_ENV = "test";
const ADMIN_KEY = process.env.ADMIN_API_KEY;

// Keep every test offline: stub Yahoo so no route reaches the network.
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
proto.quote = () => Promise.reject(new Error("offline"));
proto.chart = () => Promise.reject(new Error("offline"));
after(() => {
  proto.quote = originalQuote;
  proto.chart = originalChart;
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

// Every admin/mutating route plus the two that used to leak. requireAdmin runs
// before any body handling, so empty bodies are fine for the no-key case.
const PROTECTED_ROUTES: Array<[string, string]> = [
  ["GET", "/api/admin/subscribers"],
  ["GET", "/api/admin/gpu-history"],
  ["GET", "/api/admin/freshness"],
  ["GET", "/api/admin/freshness/check"],
  ["GET", "/api/newsletter/preview"], // SEC-1: was public, leaked subscriber count
  ["POST", "/api/social/generate"], // SEC-2: was public, burned Yahoo quota
  ["DELETE", "/api/admin/subscribers/x@y.com"],
  ["POST", "/api/newsletter/send"],
  ["POST", "/api/admin/post-now"],
  ["POST", "/api/admin/cron/daily-tweet"],
  ["GET", "/api/admin/social-log"],
  ["DELETE", "/api/admin/tweet/123"],
  ["POST", "/api/admin/datacenters"],
  ["DELETE", "/api/admin/datacenters/1"],
  ["GET", "/api/admin/datacenters/pending"],
  ["POST", "/api/admin/datacenters/ingest"],
  ["POST", "/api/admin/datacenters/pending/1/approve"],
  ["DELETE", "/api/admin/datacenters/pending/1"],
  ["GET", "/api/export/daily"],
  ["POST", "/api/admin/add-backlog-project"],
  ["DELETE", "/api/admin/backlog-project/x"],
  ["GET", "/api/admin/backlog-auto-updates"],
  ["POST", "/api/admin/scan-news-now"],
  ["POST", "/api/admin/update-backlog-headlines"],
];

test("admin auth boundary: the correct key is accepted, a missing key never authorizes", async () => {
  const { url, close } = await startTestServer();
  try {
    // 1. Happy path FIRST. Successful (2xx) requests are skipped by the
    //    admin failure limiter, so they don't consume its budget.
    const okSubs = await fetch(`${url}/api/admin/subscribers`, {
      headers: { "x-admin-key": ADMIN_KEY },
    });
    assert.equal(okSubs.status, 200, "valid key should reach GET /api/admin/subscribers");
    await okSubs.text();

    const okLog = await fetch(`${url}/api/admin/social-log`, {
      headers: { "x-admin-key": ADMIN_KEY },
    });
    assert.equal(okLog.status, 200, "valid key should reach GET /api/admin/social-log");
    await okLog.text();

    // 2. The three most important no-key cases come first, while the failure
    //    limiter (5/min) still lets them through to the handler → exact 401.
    for (const path of ["/api/admin/subscribers", "/api/newsletter/preview"]) {
      const res = await fetch(`${url}${path}`);
      assert.equal(res.status, 401, `${path} without a key must be 401, got ${res.status}`);
      const body = (await res.json()) as { error?: string };
      assert.equal(body.error, "Unauthorized", `${path} should report Unauthorized`);
    }
    const gen = await fetch(`${url}/api/social/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(gen.status, 401, `POST /api/social/generate without a key must be 401, got ${gen.status}`);
    await gen.text();

    // 3. Every protected route: a missing key must NEVER return a 2xx. Past the
    //    limiter budget the denial may be 429 instead of 401 — both are fine,
    //    the invariant is "unauthenticated requests never succeed".
    for (const [method, path] of PROTECTED_ROUTES) {
      const res = await fetch(`${url}${path}`, {
        method,
        headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
        body: method === "POST" ? "{}" : undefined,
      });
      await res.text();
      assert.ok(
        res.status === 401 || res.status === 429,
        `${method} ${path} without a key returned ${res.status}; expected 401 or 429 (never a success)`,
      );
      assert.ok(res.status < 200 || res.status >= 300, `${method} ${path} must not succeed without a key`);
    }
  } finally {
    await close();
  }
});

test("SEC-3: an unrecognized stack timeframe is handled gracefully, not errored", async () => {
  const { url, close } = await startTestServer();
  try {
    const res = await fetch(`${url}/api/stack?timeframe=__junk__`);
    assert.equal(res.status, 200, "junk timeframe should be coerced and return 200, not error");
    const body = (await res.json()) as Record<string, unknown>;
    assert.ok(Array.isArray(body.compute), "stack response should still carry layer arrays");
  } finally {
    await close();
  }
});
