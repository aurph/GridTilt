// The dry-run endpoint answers with a post or the reason it would skip, and
// /api/og renders share cards only for things that exist. Offline: Yahoo is
// stubbed, and nothing here calls the cron route (it writes the social log).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

process.env.UNSUB_TOKEN_SECRET ||= "test-secret-for-social-test";
process.env.ADMIN_API_KEY ||= "test-admin-key";
process.env.NODE_ENV = "test";
const ADMIN_KEY = process.env.ADMIN_API_KEY;

interface YahooLike {
  quote: (...args: unknown[]) => Promise<unknown>;
  chart: (...args: unknown[]) => Promise<unknown>;
  quoteSummary: (...args: unknown[]) => Promise<unknown>;
}
const yahooModule = await import("yahoo-finance2");
const YahooFinanceClass = (yahooModule as unknown as { default: new () => YahooLike }).default;
const proto = YahooFinanceClass.prototype as YahooLike;
const originalQuote = proto.quote;
const originalChart = proto.chart;
const originalSummary = proto.quoteSummary;
// quoteSummary feeds the earnings calendar and fundamentals; without this
// stub registerRoutes reaches Yahoo on startup.
proto.quote = () => Promise.reject(new Error("offline"));
proto.chart = () => Promise.reject(new Error("offline"));
proto.quoteSummary = () => Promise.reject(new Error("offline"));

const { registerRoutes } = await import("../routes");

const app = express();
app.use(express.json());
const httpServer = createServer(app);
await registerRoutes(httpServer, app);
await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
after(async () => {
  proto.quote = originalQuote;
  proto.chart = originalChart;
  proto.quoteSummary = originalSummary;
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

const generate = (template: string) =>
  fetch(`${base}/api/social/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-key": ADMIN_KEY as string },
    body: JSON.stringify({ template }),
  });

test("each template answers with a post that fits, or a reason it skips", async () => {
  for (const template of ["buildout", "gpu_rental", "cluster_spotlight", "grid_backlog", "documented_change", "top_movers", "catalyst_preview"]) {
    const res = await generate(template);
    assert.equal(res.status, 200, template);
    const body = (await res.json()) as { template: string; text?: string; length?: number; skipped?: boolean; reason?: string };
    assert.equal(body.template, template);
    if (body.skipped) {
      assert.ok(typeof body.reason === "string" && body.reason.length > 10, `${template}: a skip says why`);
      assert.equal(body.text, undefined, `${template}: a skip carries no stand-in text`);
    } else {
      assert.ok(typeof body.text === "string" && body.text.length > 0 && body.text.length <= 280, template);
      assert.equal(body.length, body.text!.length);
      assert.match(body.text!, /https:\/\/gridtilt\.com\//, `${template}: links the page it describes`);
    }
  }
});

test("with Yahoo offline, top movers skips instead of posting stale prices", async () => {
  const body = (await (await generate("top_movers")).json()) as { skipped?: boolean; reason?: string };
  assert.equal(body.skipped, true);
  assert.match(body.reason ?? "", /no live quote/);
});

test("with earnings dates unavailable, the catalyst preview skips rather than claim a quiet week", async () => {
  const body = (await (await generate("catalyst_preview")).json()) as { skipped?: boolean; reason?: string };
  assert.equal(body.skipped, true);
  assert.match(body.reason ?? "", /earnings dates did not load/);
});

test("retired templates and unknown names are refused", async () => {
  for (const template of ["power_mix", "tilt_status", "npi_update", "nope"]) {
    const res = await generate(template);
    assert.equal(res.status, 400, template);
    const body = (await res.json()) as { available: string[] };
    assert.ok(body.available.includes("documented_change"));
    assert.ok(!body.available.includes("power_mix"));
  }
});

test("share cards render for real states, projects and corrections, and 404 otherwise", async () => {
  const ok = [
    "/api/og?template=state_fact&state=MD",
    "/api/og?template=state_fact&state=md",
    "/api/og?template=project_status&id=stargate-abilene",
    "/api/og?template=correction&id=2026-09-29-nerc-reserve-margins",
    "/api/og?template=grid_backlog",
    "/api/og?page=home",
    "/api/og?page=my-grid",
    "/api/og?page=neocloud-intel",
    "/api/og?ticker=NVDA",
    "/api/og?page=compute-frontier&name=Stargate%20Abilene%20(OpenAI%2FOracle)",
  ];
  for (const path of ok) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    assert.equal(res.headers.get("content-type"), "image/png", path);
    const png = Buffer.from(await res.arrayBuffer());
    assert.equal(png.subarray(1, 4).toString(), "PNG", path);
  }
  const missing = [
    "/api/og?template=state_fact&state=ZZ",
    "/api/og?template=state_fact",
    "/api/og?template=project_status&id=no-such-cluster",
    "/api/og?template=project_status&id=../../etc",
    "/api/og?template=correction&id=2026-01-01-not-a-change",
    "/api/og?template=tilt_status",
    "/api/og?template=npi_update",
    "/api/og?template=project_status",
    "/api/og?template=correction",
    // Names and tickers GridTilt has no page for never get a branded card.
    "/api/og?page=blog&name=GridTilt%20finds%20PJM%20margin%20below%20zero",
    "/api/og?page=sector&name=Fake",
    "/api/og?page=region&name=Fake",
    "/api/og?page=operator&name=Fake",
    "/api/og?page=compute-frontier&name=Fake%20Campus",
    "/api/og?ticker=NOTATICKER",
  ];
  for (const path of missing) {
    const res = await fetch(base + path);
    assert.equal(res.status, 404, path);
  }
});
