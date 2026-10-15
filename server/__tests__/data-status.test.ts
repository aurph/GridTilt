import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { publicDataStatus } from "../data-status";
import type { DatasetFreshness } from "../freshness";

process.env.UNSUB_TOKEN_SECRET ||= "test-secret-for-data-status";
process.env.ADMIN_API_KEY ||= "test-admin-key";
process.env.NODE_ENV = "test";

function ds(over: Partial<DatasetFreshness>): DatasetFreshness {
  return {
    id: "x",
    label: "X",
    file: "x.json",
    asOf: "2026-10-01",
    jobLastSuccess: "2026-10-01",
    dataLastObserved: null,
    claimLastReviewed: null,
    reviewDue: null,
    ageHours: 10,
    expectedMaxAgeHours: 48,
    status: "ok",
    issues: ["ok"],
    writes: "repo",
    mechanism: "secret pipeline detail",
    detail: "internal detail",
    ...over,
  };
}

test("maps every internal status to one plain public status", () => {
  const statuses = ["ok", "reviewed_no_change", "aging", "stale", "no_run_observed", "fetch_failed", "partial_coverage", "unknown", "review_overdue", "manual"] as const;
  const out = publicDataStatus({ generatedAt: "2026-10-15T12:00:00Z", datasets: statuses.map((s, i) => ds({ id: `d${i}`, status: s })) }, { gpuSweepEnabled: false });
  assert.deepEqual(out.datasets.map((d) => d.status), ["current", "current", "due", "behind", "behind", "behind", "behind", "behind", "review_due", "curated"]);
  assert.deepEqual(out.counts, { current: 2, due: 1, behind: 5, review_due: 1, curated: 1, paused: 0 });
});

test("dates: newest of data observed and run stamp; review day; cadence in days", () => {
  const [d] = publicDataStatus(
    { generatedAt: "t", datasets: [ds({ asOf: "2026-08-25", dataLastObserved: "2026-09-28T10:00:00Z", claimLastReviewed: "2026-09-28", reviewDue: "2026-12-27", expectedMaxAgeHours: 168 })] },
    { gpuSweepEnabled: false },
  ).datasets;
  assert.equal(d.lastUpdated, "2026-09-28");
  assert.equal(d.lastReviewed, "2026-09-28");
  assert.equal(d.reviewDue, "2026-12-27");
  assert.equal(d.cadenceDays, 7);
  const [none] = publicDataStatus({ generatedAt: "t", datasets: [ds({ asOf: null, dataLastObserved: null, expectedMaxAgeHours: null })] }, { gpuSweepEnabled: false }).datasets;
  assert.equal(none.lastUpdated, null);
  assert.equal(none.cadenceDays, null);
});

test("GPU price history reads Paused while the sweep is off, its real status when on", () => {
  const report = { generatedAt: "t", datasets: [ds({ id: "gpu-price-history", status: "stale" })] };
  const off = publicDataStatus(report, { gpuSweepEnabled: false }).datasets[0];
  assert.equal(off.status, "paused");
  assert.match(off.note ?? "", /written permission/);
  assert.equal(publicDataStatus(report, { gpuSweepEnabled: true }).datasets[0].status, "behind");
});

test("/api/data-status is public and carries no internal fields", async () => {
  const { registerRoutes } = await import("../routes");
  const app = express();
  const server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/data-status`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { datasets: Array<Record<string, unknown>> };
    assert.ok(body.datasets.length >= 5);
    for (const d of body.datasets) {
      for (const k of ["file", "mechanism", "detail", "writes", "issues"]) assert.equal(k in d, false, `${d.id} leaks ${k}`);
    }
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
