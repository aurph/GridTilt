import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  composeOperators,
  getGridLive,
  gridLiveStamp,
  groupByRespondent,
  latestMix,
  resetGridLiveCache,
} from "../eia-grid";

describe("groupByRespondent", () => {
  it("groups demand rows by respondent, oldest first, keeping the first duplicate", () => {
    const grouped = groupByRespondent([
      { period: "2026-11-03T16", respondent: "US48", type: "D", value: 459058 },
      { period: "2026-11-03T15", respondent: "US48", type: "D", value: "455000" },
      { period: "2026-11-03T16", respondent: "US48", type: "D", value: 1 }, // duplicate hour
      { period: "2026-11-03T16", respondent: "PJM", type: "D", value: 95000 },
    ]);
    assert.deepEqual(Object.keys(grouped).sort(), ["PJM", "US48"]);
    assert.deepEqual(grouped.US48, [
      { t: "2026-11-03T15", mw: 455000 },
      { t: "2026-11-03T16", mw: 459058 },
    ]);
  });

  it("drops rows that are not a demand reading", () => {
    const grouped = groupByRespondent([
      { period: "2026-11-03T16", respondent: "US48", type: "DF", value: 1 }, // forecast, not demand
      { period: "2026-11-03", respondent: "US48", type: "D", value: 1 }, // daily, not hourly
      { period: "2026-11-03T16", respondent: "", type: "D", value: 1 },
      { period: "2026-11-03T16", respondent: "US48", type: "D", value: null }, // Number(null) is 0
      { period: "2026-11-03T16", respondent: "US48", type: "D", value: "n/a" },
      { period: "2026-11-03T16", respondent: "US48", type: "D", value: 9_000_000 }, // not a load
      { period: "2026-11-03T16", respondent: "US48", type: "D", value: 459058 },
    ]);
    assert.deepEqual(grouped, { US48: [{ t: "2026-11-03T16", mw: 459058 }] });
  });
});

describe("composeOperators", () => {
  it("passes a balancing authority through and sums regions for a composed operator", () => {
    const ops = composeOperators({
      PJM: [
        { t: "2026-11-03T15", mw: 90000 },
        { t: "2026-11-03T16", mw: 95000 },
      ],
      NE: [
        { t: "2026-11-03T15", mw: 12000 },
        { t: "2026-11-03T16", mw: 13000 },
      ],
      NY: [
        { t: "2026-11-03T15", mw: 15000 },
        { t: "2026-11-03T16", mw: 16000 },
      ],
    });
    assert.equal(ops.PJM.composed, false);
    assert.equal(ops.PJM.latestMw, 95000);
    assert.equal(ops.PJM.peakMw, 95000);
    assert.equal(ops.PJM.minMw, 90000);
    assert.equal(ops.NPCC.composed, true);
    assert.deepEqual(ops.NPCC.points, [
      { t: "2026-11-03T15", mw: 27000 },
      { t: "2026-11-03T16", mw: 29000 },
    ]);
    assert.equal(ops.NPCC.latestPeriodUtc, "2026-11-03T16");
  });

  it("only keeps a composed hour when every member reported it", () => {
    const ops = composeOperators({
      NE: [
        { t: "2026-11-03T15", mw: 12000 },
        { t: "2026-11-03T16", mw: 13000 },
      ],
      NY: [{ t: "2026-11-03T15", mw: 15000 }], // 16:00 not in yet
    });
    assert.deepEqual(ops.NPCC.points, [{ t: "2026-11-03T15", mw: 27000 }]);
    assert.equal(ops.NPCC.latestMw, 27000);
  });

  it("leaves out an operator with a missing member instead of serving a partial sum", () => {
    const ops = composeOperators({
      CAL: [{ t: "2026-11-03T16", mw: 30000 }],
      NW: [{ t: "2026-11-03T16", mw: 20000 }],
      // SW missing
      US48: [{ t: "2026-11-03T16", mw: 459058 }],
    });
    assert.equal(ops.WECC, undefined);
    assert.equal(ops.US48.latestMw, 459058);
  });
});

describe("latestMix", () => {
  it("uses the newest hour with enough fuels and computes shares", () => {
    const mix = latestMix([
      // 17:00 is still filling in: only two fuels so far
      { period: "2026-11-03T17", fueltype: "NG", value: 100 },
      { period: "2026-11-03T17", fueltype: "COL", value: 50 },
      { period: "2026-11-03T16", fueltype: "NG", value: 200000 },
      { period: "2026-11-03T16", fueltype: "NUC", value: 90000 },
      { period: "2026-11-03T16", fueltype: "COL", value: 60000 },
      { period: "2026-11-03T16", fueltype: "WND", value: 40000 },
      { period: "2026-11-03T16", fueltype: "SUN", value: 10000 },
    ]);
    assert.ok(mix);
    assert.equal(mix.periodUtc, "2026-11-03T16");
    assert.equal(mix.totalMw, 400000);
    assert.deepEqual(
      mix.fuels.map((f) => [f.code, f.label, f.sharePct]),
      [
        ["NG", "Natural gas", 50],
        ["NUC", "Nuclear", 22.5],
        ["COL", "Coal", 15],
        ["WND", "Wind", 10],
        ["SUN", "Solar", 2.5],
      ],
    );
  });

  it("returns null when no hour is complete enough", () => {
    assert.equal(latestMix([{ period: "2026-11-03T16", fueltype: "NG", value: 1 }]), null);
    assert.equal(latestMix([]), null);
  });
});

describe("getGridLive", () => {
  beforeEach(() => resetGridLiveCache());

  const demandBody = {
    response: {
      data: [
        { period: "2026-11-03T16", respondent: "US48", type: "D", value: 459058 },
        { period: "2026-11-03T15", respondent: "US48", type: "D", value: 455000 },
        { period: "2026-11-03T16", respondent: "PJM", type: "D", value: 95000 },
      ],
    },
  };
  const fuelBody = {
    response: {
      data: [
        { period: "2026-11-03T16", respondent: "US48", fueltype: "NG", value: 200000 },
        { period: "2026-11-03T16", respondent: "US48", fueltype: "NUC", value: 90000 },
        { period: "2026-11-03T16", respondent: "US48", fueltype: "COL", value: 60000 },
        { period: "2026-11-03T16", respondent: "US48", fueltype: "WND", value: 40000 },
      ],
    },
  };
  const okFetch = (url: URL) => {
    const body = url.pathname.includes("fuel-type-data") ? fuelBody : demandBody;
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  };

  it("reports unconfigured without a key and never calls out", async () => {
    let calls = 0;
    const r = await getGridLive({ env: {} as NodeJS.ProcessEnv, fetchImpl: () => { calls++; return okFetch(new URL("https://x")); } });
    assert.equal(r.configured, false);
    assert.equal(calls, 0);
  });

  it("fetches demand and mix with the key, only asks for demand rows, and caches", async () => {
    const urls: URL[] = [];
    let t = 1_000_000;
    const opts = {
      env: { EIA_API_KEY: "k" } as NodeJS.ProcessEnv,
      now: () => t,
      fetchImpl: (url: URL) => { urls.push(url); return okFetch(url); },
    };
    const r = await getGridLive(opts);
    assert.equal(r.configured, true);
    if (!r.configured) return;
    assert.equal(r.demand.US48.latestMw, 459058);
    assert.equal(r.demand.PJM.latestMw, 95000);
    assert.equal(r.latestPeriodUtc, "2026-11-03T16");
    assert.equal(r.mix?.fuels[0].code, "NG");
    assert.equal(r.stale, false);
    assert.equal(urls.length, 2);
    const demandReq = urls.find((u) => u.pathname.includes("region-data"))!;
    assert.deepEqual(demandReq.searchParams.getAll("facets[type][]"), ["D"]);
    assert.ok(demandReq.searchParams.getAll("facets[respondent][]").includes("US48"));
    assert.ok(demandReq.searchParams.getAll("facets[respondent][]").includes("ERCO"));

    t += 5 * 60 * 1000;
    await getGridLive(opts);
    assert.equal(urls.length, 2, "second call inside the cache window must not hit EIA");

    const stamp = gridLiveStamp();
    assert.equal(stamp.lastRefreshed, "2026-11-03T16:00:00Z");
    assert.equal(stamp.lastFailureAt, null);
  });

  it("serves the last good fetch marked stale when a refresh fails", async () => {
    let t = 1_000_000;
    let fail = false;
    const opts = {
      env: { EIA_API_KEY: "k" } as NodeJS.ProcessEnv,
      now: () => t,
      fetchImpl: (url: URL) => (fail ? Promise.resolve({ ok: false, status: 500, json: async () => ({}) }) : okFetch(url)),
    };
    const first = await getGridLive(opts);
    assert.equal(first.configured && first.stale, false);

    t += 31 * 60 * 1000;
    fail = true;
    const second = await getGridLive(opts);
    assert.equal(second.configured && second.stale, true);
    assert.equal(second.configured && second.demand.US48.latestMw, 459058);
    assert.equal(gridLiveStamp().lastFailureReason, "EIA responded 500");
  });

  it("keeps demand when only the fuel call fails", async () => {
    const opts = {
      env: { EIA_API_KEY: "k" } as NodeJS.ProcessEnv,
      fetchImpl: (url: URL) =>
        url.pathname.includes("fuel-type-data")
          ? Promise.resolve({ ok: false, status: 503, json: async () => ({}) })
          : okFetch(url),
    };
    const r = await getGridLive(opts);
    assert.equal(r.configured, true);
    if (!r.configured) return;
    assert.equal(r.mix, null);
    assert.equal(r.demand.US48.latestMw, 459058);
  });

  it("throws with nothing cached when the demand call fails", async () => {
    await assert.rejects(
      getGridLive({
        env: { EIA_API_KEY: "k" } as NodeJS.ProcessEnv,
        fetchImpl: () => Promise.resolve({ ok: false, status: 500, json: async () => ({}) }),
      }),
      /EIA responded 500/,
    );
  });
});
