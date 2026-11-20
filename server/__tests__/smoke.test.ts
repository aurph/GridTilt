import { after, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { CHECKS, daysBetween, formatResults, runSmoke } from "../smoke";

process.env.UNSUB_TOKEN_SECRET ||= "test-secret-for-smoke";
process.env.ADMIN_API_KEY ||= "test-admin-key";
process.env.NODE_ENV = "test";

// Offline: Yahoo and every outside host fail, so the app serves its fallbacks.
interface YahooLike { quote: (...a: unknown[]) => Promise<unknown>; quoteSummary: (...a: unknown[]) => Promise<unknown>; chart: (...a: unknown[]) => Promise<unknown> }
const yahooProto = ((await import("yahoo-finance2")) as unknown as { default: { prototype: YahooLike } }).default.prototype;
const original = { quote: yahooProto.quote, quoteSummary: yahooProto.quoteSummary, chart: yahooProto.chart };
yahooProto.quote = () => Promise.reject(new Error("offline"));
yahooProto.quoteSummary = () => Promise.reject(new Error("offline"));
yahooProto.chart = () => Promise.reject(new Error("offline"));
const nativeFetch = globalThis.fetch;
let outside = 0;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("http://127.0.0.1:")) return nativeFetch(input, init);
  outside += 1;
  return new Response("offline", { status: 503 });
}) as typeof fetch;
after(() => {
  Object.assign(yahooProto, original);
  globalThis.fetch = nativeFetch;
});

const { registerRoutes } = await import("../routes");

async function start(): Promise<{ base: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  const server = createServer(app);
  await registerRoutes(server, app);
  // Same fallthrough the production static server has: unknown paths get the app shell.
  app.use((_req, res) => res.status(200).type("html").send('<!doctype html><div id="root"></div>'));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, close: () => new Promise<void>((r) => server.close(() => r())) };
}

test("daysBetween counts calendar days and rejects junk", () => {
  assert.equal(daysBetween("2026-09-01", "2026-10-15"), 44);
  assert.equal(daysBetween("2026-10-15T23:59:00Z", "2026-10-15"), 0);
  assert.equal(daysBetween("soon", "2026-10-15"), null);
});

test("API checks pass on this build: deals, clusters, GPU switch, robots, sitemap, JSON 404", async () => {
  const { base, close } = await start();
  try {
    // Only checks served from local data. /api/news would fetch RSS through
    // rss-parser, which bypasses the fetch stub and holds the test process
    // open on a CI runner until its sockets time out.
    const LOCAL = ["power deals", "clusters", "GPU price sweep stays off without permission", "Maryland state data", "mapped data center sites", "power plants", "robots.txt", "sitemap.xml", "unknown API path is a JSON 404", "frontier models", "retail electricity rates (EIA)", "admin freshness report", "timeline", "data status"];
    const apiChecks = CHECKS.filter((c) => LOCAL.includes(c.name));
    const results = await runSmoke({ base, today: "2026-10-15" }, apiChecks);
    const byName = new Map(results.map((r) => [r.name, r]));
    for (const name of ["power deals", "clusters", "GPU price sweep stays off without permission", "Maryland state data", "robots.txt", "sitemap.xml", "unknown API path is a JSON 404", "frontier models", "timeline", "data status"]) {
      assert.notEqual(byName.get(name)?.level, "fail", `${name}: ${byName.get(name)?.detail}`);
    }
    // The map layers must pass outright: both are files in the repository.
    assert.equal(byName.get("mapped data center sites")?.level, "pass", byName.get("mapped data center sites")?.detail);
    assert.match(byName.get("mapped data center sites")?.detail ?? "", /^\d[\d,]* sites, atlas v\d{4}\.\d{2}\.\d{2}$/);
    assert.equal(byName.get("power plants")?.level, "pass", byName.get("power plants")?.detail);
    // Keyless EIA feeds warn, not fail.
    assert.equal(byName.get("retail electricity rates (EIA)")?.level, "warn");
    // The admin check is skipped without a key.
    assert.equal(byName.has("admin freshness report"), false);
    assert.match(formatResults(results), /\d+ pass, \d+ warn, \d+ fail$/);
  } finally {
    await close();
  }
});

test("the retired States index must answer one 301 to /grid, and a page there is a failure", async () => {
  const check = CHECKS.filter((c) => c.name === "retired /states forwards to /grid");
  assert.equal(check.length, 1, "the smoke list carries the redirect check");
  assert.equal(CHECKS.some((c) => c.name === "page /states"), false, "/states is no longer checked as a page");
  const { base, close } = await start();
  try {
    const [live] = await runSmoke({ base, today: "2026-11-18" }, check);
    assert.equal(live.level, "pass", live.detail);
  } finally {
    await close();
  }
  const answer = (status: number, location?: string) =>
    (async () => new Response("<div id=\"root\"></div>", { status, headers: { "content-type": "text/html", ...(location ? { location } : {}) } })) as unknown as typeof fetch;
  const [page] = await runSmoke({ base: "http://x", today: "2026-11-18", fetchFn: answer(200) }, check);
  assert.equal(page.level, "fail", "a 200 at /states means the old page is back");
  const [elsewhere] = await runSmoke({ base: "http://x", today: "2026-11-18", fetchFn: answer(301, "/markets") }, check);
  assert.equal(elsewhere.level, "fail", "a redirect to the wrong place fails");
  const [temporary] = await runSmoke({ base: "http://x", today: "2026-11-18", fetchFn: answer(302, "/grid") }, check);
  assert.equal(temporary.level, "fail", "a temporary redirect fails: crawlers keep the old address");
});

test("region pages: a region is a page, and a renamed region answers one 301 to its new address", async () => {
  const names = ["page /region/southeast", "renamed region /region/wecc forwards to /region/west"];
  const checks = CHECKS.filter((c) => names.includes(c.name));
  assert.equal(checks.length, 2, "the smoke list carries both region checks");
  const { base, close } = await start();
  try {
    for (const r of await runSmoke({ base, today: "2026-11-18" }, checks)) assert.equal(r.level, "pass", `${r.name}: ${r.detail}`);
  } finally {
    await close();
  }
  const stale = (async () => new Response('<div id="root"></div>', { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
  const [, moved] = await runSmoke({ base: "http://x", today: "2026-11-18", fetchFn: stale }, checks);
  assert.equal(moved.level, "fail", "a 200 at the old address means an old build");
});

test("the GPU check fails when the sweep is on without permission, passes when permitted", async () => {
  process.env.GPU_LIVE_SWEEP_ENABLED = "true";
  const { base, close } = await start();
  try {
    const gpu = CHECKS.filter((c) => c.name.startsWith("GPU price sweep"));
    const [denied] = await runSmoke({ base, today: "2026-10-15" }, gpu);
    assert.equal(denied.level, "fail");
    const [allowed] = await runSmoke({ base, today: "2026-10-15", gpuDataPermitted: true }, gpu);
    assert.equal(allowed.level, "pass");
  } finally {
    delete process.env.GPU_LIVE_SWEEP_ENABLED;
    await close();
  }
});

test("stale curated data warns; a soft 404 and an old build fail", async () => {
  const fake = async (url: string | URL | Request) => {
    const u = String(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (u.endsWith("/api/clusters/metrics")) return json({ clusterCount: 237, lastRefreshed: "2026-06-26" });
    if (u.endsWith("/api/gpu-prices/metrics")) return json({ health: { recordedDays: 15 } });
    if (u.endsWith("/stock/NOPE")) return new Response('<div id="root"></div>', { status: 200, headers: { "content-type": "text/html" } });
    return new Response("x", { status: 500 });
  };
  const pick = CHECKS.filter((c) => ["clusters", "GPU price sweep stays off without permission", "unknown ticker is a real 404"].includes(c.name));
  const r = await runSmoke({ base: "https://example.test", today: "2026-10-15", fetchFn: fake as typeof fetch }, pick);
  const level = (n: string) => r.find((x) => x.name === n)?.level;
  assert.equal(level("clusters"), "warn");
  assert.equal(level("GPU price sweep stays off without permission"), "fail");
  assert.equal(level("unknown ticker is a real 404"), "fail");
});
