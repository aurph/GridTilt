// T20 over real HTTP: aliases are one 301 to the final address (keeping a
// campaign tag), an unknown API entity is a JSON 404, and the sitemap and the
// ticker list name only pages that exist. Offline: Yahoo is stubbed.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

process.env.UNSUB_TOKEN_SECRET ||= "test-secret-for-redirect-test";
process.env.ADMIN_API_KEY ||= "test-admin-key";
process.env.NODE_ENV = "test";

interface YahooLike {
  quote: (...args: unknown[]) => Promise<unknown>;
  chart: (...args: unknown[]) => Promise<unknown>;
}
const yahooModule = await import("yahoo-finance2");
const proto = (yahooModule as unknown as { default: { prototype: YahooLike } }).default.prototype;
const originalQuote = proto.quote;
const originalChart = proto.chart;
proto.quote = () => Promise.reject(new Error("offline"));
proto.chart = () => Promise.reject(new Error("offline"));
after(() => {
  proto.quote = originalQuote;
  proto.chart = originalChart;
});

const { registerRoutes } = await import("../routes");

async function start() {
  const app = express();
  app.use(express.json());
  const server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, close: () => new Promise<void>((r) => server.close(() => r())) };
}

test("aliases, API 404s, the ticker list and the sitemap", async () => {
  const { url, close } = await start();
  try {
    let r = await fetch(`${url}/trade?utm_source=newsletter`, { redirect: "manual" });
    assert.equal(r.status, 301);
    assert.equal(r.headers.get("location"), "/analyze?tab=scenario&utm_source=newsletter");
    r = await fetch(`${url}/queue`, { redirect: "manual" });
    assert.equal(r.status, 301);
    assert.equal(r.headers.get("location"), "/power-map?tab=queue");
    r = await fetch(`${url}/supply-chain?view=table`, { redirect: "manual" });
    assert.equal(r.headers.get("location"), "/stack?view=flow", "the alias's own parameter wins");

    r = await fetch(`${url}/api/stock/NOPE`);
    assert.equal(r.status, 404);
    assert.match(r.headers.get("content-type") ?? "", /application\/json/);
    await r.json();

    r = await fetch(`${url}/api/no-such-endpoint`);
    assert.equal(r.status, 404);
    assert.match(r.headers.get("content-type") ?? "", /application\/json/, "an unknown API address is JSON, not the HTML shell");
    await r.json();

    r = await fetch(`${url}/api/stock-tickers`);
    const { tickers } = (await r.json()) as { tickers: string[] };
    assert.ok(tickers.includes("CEG") && !tickers.includes("NLR") && !tickers.includes("USAR"));

    r = await fetch(`${url}/sitemap.xml`);
    assert.equal(r.status, 200);
    const xml = await r.text();
    assert.ok(xml.includes("<loc>https://gridtilt.com/sector/natural-gas</loc>"));
    assert.ok(!xml.includes("/stock/NLR<"));
  } finally {
    await close();
  }
});
