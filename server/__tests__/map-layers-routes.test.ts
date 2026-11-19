// The two map layer endpoints over real HTTP: mapped data center sites
// (minus tracked campuses) and power plants. Offline: Yahoo is stubbed and
// both layers are read from server/data.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { haversineKm, namesCompany, TRACKED_NAMED_RADIUS_KM } from "../dc-sites";

process.env.UNSUB_TOKEN_SECRET ||= "test-secret-for-map-layers";
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

const data = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "server", "data", name), "utf-8"));

test("mapped sites and power plants are served with their sources, and no tracked campus twice", async () => {
  const { url, close } = await start();
  try {
    let r = await fetch(`${url}/api/map/sites`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type") ?? "", /application\/json/);
    assert.match(r.headers.get("cache-control") ?? "", /max-age=\d+/);
    const sites = (await r.json()) as {
      attribution: string;
      license: { name: string };
      source: { version: string };
      counts: { sites: number; leftOutAsTracked: number; trackedCampuses: number };
      sites: Array<{ id: string; lat: number; lng: number; operator?: string; name?: string } & Record<string, unknown>>;
    };
    assert.match(sites.attribution, /OpenStreetMap contributors/);
    assert.match(sites.license.name, /ODbL/);
    assert.match(sites.source.version, /^v\d{4}\.\d{2}\.\d{2}$/);
    assert.equal(sites.counts.sites, sites.sites.length);
    assert.ok(sites.sites.length > 1000, `${sites.sites.length} sites`);

    const file = data("datacenter-sites.json");
    const tracked = data("datacenters.json") as Array<{ id: number; name: string; company: string; lat: number; lng: number }>;
    assert.equal(sites.counts.trackedCampuses, tracked.length);
    assert.equal(sites.counts.sites + sites.counts.leftOutAsTracked, file.sites.length, "every site is either sent or counted as left out");
    assert.ok(sites.counts.leftOutAsTracked > 0, "some sites are tracked campuses");
    // No site that names a tracked campus's company sits within the rule's radius of it.
    for (const s of sites.sites) {
      for (const t of tracked) {
        if (haversineKm(s, t) <= TRACKED_NAMED_RADIUS_KM) {
          assert.ok(!namesCompany(t.company, s.operator, s.name, t.name), `${s.id} (${s.operator ?? s.name}) is ${t.name}`);
        }
      }
      // A mapped site is a location only.
      for (const k of ["mw", "powerMW", "status", "capacity"]) assert.equal(k in s, false, `${s.id} carries ${k}`);
    }

    r = await fetch(`${url}/api/map/plants`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("cache-control") ?? "", /max-age=\d+/);
    const plants = (await r.json()) as {
      source: { publisher: string; released: string };
      dataMonth: string;
      floorMw: number;
      counts: { plants: number; mw: number; byFuel: Record<string, number> };
      plants: Array<{ id: number; fuel: string; mw: number }>;
    };
    assert.equal(plants.source.publisher, "U.S. Energy Information Administration");
    assert.match(plants.dataMonth, /^\d{4}-\d{2}$/);
    assert.equal(plants.counts.plants, plants.plants.length);
    assert.ok(plants.plants.length >= 800 && plants.plants.length <= 1500);
    assert.equal(Object.values(plants.counts.byFuel).reduce((a, b) => a + b, 0), plants.plants.length);
    assert.ok(plants.plants.every((p) => p.mw >= plants.floorMw || p.fuel === "NUC"));
  } finally {
    await close();
  }
});

test("both layers travel gzipped when the client accepts it, and plain when it does not", async () => {
  const { url, close } = await start();
  try {
    for (const path of ["/api/map/sites", "/api/map/plants"]) {
      const gz = await fetch(`${url}${path}`, { headers: { "Accept-Encoding": "gzip" } });
      assert.equal(gz.headers.get("content-encoding"), "gzip", path);
      assert.match(gz.headers.get("vary") ?? "", /Accept-Encoding/i, path);
      const wire = Number(gz.headers.get("content-length"));
      assert.ok(wire > 1000 && wire < 60_000, `${path}: ${wire} bytes on the wire`);
      const plain = await fetch(`${url}${path}`, { headers: { "Accept-Encoding": "identity" } });
      assert.equal(plain.headers.get("content-encoding"), null, path);
      assert.match(plain.headers.get("content-type") ?? "", /application\/json/);
      assert.deepEqual(await gz.json(), await plain.json(), `${path}: the same payload either way`);
    }
  } finally {
    await close();
  }
});

test("the cluster list, which the map now loads by default, travels gzipped too", async () => {
  const { url, close } = await start();
  try {
    const gz = await fetch(`${url}/api/clusters`, { headers: { "Accept-Encoding": "gzip" } });
    assert.equal(gz.status, 200);
    assert.equal(gz.headers.get("content-encoding"), "gzip");
    assert.match(gz.headers.get("vary") ?? "", /Accept-Encoding/i);
    const plain = await fetch(`${url}/api/clusters`, { headers: { "Accept-Encoding": "identity" } });
    assert.equal(plain.headers.get("content-encoding"), null);
    const wire = Number(gz.headers.get("content-length"));
    const full = Number(plain.headers.get("content-length"));
    assert.ok(wire > 1000 && wire < full / 3, `${wire} bytes on the wire against ${full} plain`);
    const rows = (await gz.json()) as Array<{ id: string }>;
    assert.deepEqual(rows, await plain.json(), "the same rows either way");
    assert.ok(rows.length > 200 && rows.every((r) => typeof r.id === "string"));
  } finally {
    await close();
  }
});

test("both layers are on Data status with a date", async () => {
  const { url, close } = await start();
  try {
    const r = await fetch(`${url}/api/data-status`);
    const body = (await r.json()) as { datasets: Array<{ id: string; label: string; lastUpdated: string | null; status: string }> };
    for (const id of ["datacenter-sites", "power-plants"]) {
      const d = body.datasets.find((x) => x.id === id);
      assert.ok(d, `${id} is listed`);
      assert.match(d.lastUpdated ?? "", /^\d{4}-\d{2}-\d{2}$/, `${id} has a date`);
      assert.equal(d.status, "current", `${id}: ${d.status}`);
    }
  } finally {
    await close();
  }
});
