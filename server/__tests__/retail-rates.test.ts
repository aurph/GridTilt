import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getRetailRatesByState, groupRetailRows, newestMonth, resetRetailRatesCache } from "../retail-rates";

describe("groupRetailRows", () => {
  it("groups by state and sorts oldest first", () => {
    const grouped = groupRetailRows([
      { period: "2026-05", stateid: "MD", price: 18.2 },
      { period: "2026-04", stateid: "MD", price: "17.9" },
      { period: "2026-05", stateid: "TX", price: 15.1 },
    ]);
    assert.deepEqual(Object.keys(grouped).sort(), ["MD", "TX"]);
    assert.deepEqual(grouped.MD, [
      { month: "2026-04", centsPerKwh: 17.9 },
      { month: "2026-05", centsPerKwh: 18.2 },
    ]);
  });

  it("drops rows with missing state, period, or non-numeric price", () => {
    const grouped = groupRetailRows([
      { period: "2026-05", stateid: "", price: 10 },
      { period: "", stateid: "MD", price: 10 },
      { period: "2026-05", stateid: "MD", price: null },
      { period: "2026-05", stateid: "MD", price: "n/a" },
      { period: "2026-05", stateid: "MD", price: 18.2 },
    ]);
    assert.deepEqual(grouped, { MD: [{ month: "2026-05", centsPerKwh: 18.2 }] });
  });
});

describe("getRetailRatesByState", () => {
  it("self-reports unconfigured without an EIA key instead of fabricating", async () => {
    const saved = process.env.EIA_API_KEY;
    delete process.env.EIA_API_KEY;
    try {
      const result = await getRetailRatesByState();
      assert.equal(result.configured, false);
      assert.ok(!result.configured && result.howTo.includes("EIA_API_KEY"));
    } finally {
      if (saved !== undefined) process.env.EIA_API_KEY = saved;
    }
  });
});

describe("groupRetailRows: what counts as a residential rate", () => {
  it("keeps one row per state and month", () => {
    const grouped = groupRetailRows([
      { period: "2026-05", stateid: "MD", price: 18.2 },
      { period: "2026-05", stateid: "MD", price: 18.2 },
      { period: "2026-05", stateid: "MD", price: 99 },
    ]);
    assert.deepEqual(grouped.MD, [{ month: "2026-05", centsPerKwh: 18.2 }]);
  });

  it("rejects another sector, another unit, a region code, a bad month and implausible prices", () => {
    const grouped = groupRetailRows([
      { period: "2026-05", stateid: "MD", sectorid: "COM", price: 14.1 },
      { period: "2026-05", stateid: "MD", price: 18.2, "price-units": "dollars per megawatthour" },
      { period: "2026-05", stateid: "NEW", price: 25.0 },
      { period: "2026-13", stateid: "MD", price: 18.2 },
      { period: "2026-04", stateid: "MD", price: 0 },
      { period: "2026-03", stateid: "MD", price: -3 },
      { period: "2026-02", stateid: "MD", price: 450 },
      { period: "2026-01", stateid: "MD", sectorid: "RES", price: "17.5", "price-units": "cents per kilowatt-hour" },
    ]);
    assert.deepEqual(grouped, { MD: [{ month: "2026-01", centsPerKwh: 17.5 }] });
  });

  it("names the newest month anywhere, which a state may lag", () => {
    const grouped = groupRetailRows([
      { period: "2026-05", stateid: "MD", price: 18.2 },
      { period: "2026-03", stateid: "TX", price: 15.1 },
    ]);
    assert.equal(newestMonth(grouped), "2026-05");
    assert.equal(grouped.TX[grouped.TX.length - 1].month, "2026-03");
    assert.equal(newestMonth({}), null);
  });
});

describe("getRetailRatesByState: freshness and failures", () => {
  const env = { EIA_API_KEY: "test-key" } as NodeJS.ProcessEnv;
  const ok = (rows: unknown[]) => async () => ({ ok: true, status: 200, json: async () => ({ response: { data: rows } }) });
  const rows = [{ period: "2026-05", stateid: "MD", sectorid: "RES", price: 18.2 }];

  it("dates the fetch separately from the data's newest month", async () => {
    resetRetailRatesCache();
    const r = await getRetailRatesByState({ env, fetchImpl: ok(rows), now: () => Date.UTC(2026, 8, 29) });
    assert.ok(r.configured);
    assert.equal(r.configured && r.retrievedAt, "2026-09-29T00:00:00.000Z");
    assert.equal(r.configured && r.newestMonth, "2026-05");
    assert.equal(r.configured && r.stale, false);
  });

  it("a failed refresh keeps the last good data, labeled stale with its original retrieval time", async () => {
    resetRetailRatesCache();
    let t = Date.UTC(2026, 8, 1);
    await getRetailRatesByState({ env, fetchImpl: ok(rows), now: () => t });
    t += 25 * 60 * 60 * 1000; // past the 24 h cache
    const failed = await getRetailRatesByState({
      env,
      fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
      now: () => t,
    });
    assert.ok(failed.configured && failed.stale);
    assert.equal(failed.configured && failed.retrievedAt, "2026-09-01T00:00:00.000Z");
    assert.deepEqual(failed.configured && failed.byState.MD, [{ month: "2026-05", centsPerKwh: 18.2 }]);
  });

  it("an empty or malformed answer is a failure, never a cached 'no rates'", async () => {
    resetRetailRatesCache();
    await assert.rejects(getRetailRatesByState({ env, fetchImpl: ok([]), now: () => 1 }));
    await assert.rejects(
      getRetailRatesByState({ env, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ nope: 1 }) }), now: () => 2 }),
    );
  });

  it("a timeout with no earlier data is an error for the route to report, not an empty success", async () => {
    resetRetailRatesCache();
    await assert.rejects(
      getRetailRatesByState({ env, fetchImpl: async () => { throw new Error("AbortError"); }, now: () => 1 }),
    );
  });
});
