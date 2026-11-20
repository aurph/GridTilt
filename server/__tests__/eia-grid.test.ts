import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  FUEL_RESPONDENTS_PER_CALL,
  OPERATOR_RESPONDENTS,
  composeOperators,
  getGridLive,
  gridLiveStamp,
  groupByRespondent,
  latestMix,
  operatorMixes,
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

describe("the nine grid regions", () => {
  it("each have a live key: operators as their own balancing authority, the rest as named sums", () => {
    const spec = (k: string) => ({ respondents: OPERATOR_RESPONDENTS[k]?.respondents, composed: OPERATOR_RESPONDENTS[k]?.composed });
    assert.deepEqual(spec("CAISO"), { respondents: ["CISO"], composed: false });
    assert.deepEqual(spec("NYISO"), { respondents: ["NYIS"], composed: false });
    assert.deepEqual(spec("ISO-NE"), { respondents: ["ISNE"], composed: false });
    assert.deepEqual(spec("SOUTHEAST"), { respondents: ["SE", "CAR", "FLA", "TEN", "LGEE", "AECI"], composed: true });
    assert.deepEqual(spec("WEST"), { respondents: ["NW", "SW", "BANC", "LDWP", "IID", "TIDC"], composed: true });
    for (const k of ["PJM", "MISO", "ERCOT", "SPP"]) assert.equal(OPERATOR_RESPONDENTS[k].composed, false, k);
    // The note is shown beside a summed figure, so it has to name what was summed.
    assert.match(OPERATOR_RESPONDENTS.SOUTHEAST.note, /Southeast, Carolinas, Florida and Tennessee/);
    assert.match(OPERATOR_RESPONDENTS.WEST.note, /Northwest and Southwest/);
    assert.match(OPERATOR_RESPONDENTS.WEST.note, /outside CAISO/);
  });

  it("stay under EIA's 5,000-row cap for a week of hourly demand", () => {
    const respondents = new Set(Object.values(OPERATOR_RESPONDENTS).flatMap((s) => s.respondents));
    assert.ok(respondents.size * 168 <= 5000, `${respondents.size} respondents need ${respondents.size * 168} rows`);
  });

  it("sum the West only when every part of it reported the hour", () => {
    const at = (mw: number) => [{ t: "2026-11-03T16", mw }];
    const parts = { NW: at(40000), SW: at(20000), BANC: at(2000), LDWP: at(3000), IID: at(500), TIDC: at(300), CISO: at(25000) };
    const ops = composeOperators(parts);
    assert.equal(ops.WEST.latestMw, 65800);
    assert.equal(ops.WEST.composed, true);
    assert.equal(ops.CAISO.latestMw, 25000);
    assert.equal(ops.CAISO.composed, false);
    const { TIDC: _missing, ...partial } = parts;
    assert.equal(composeOperators(partial).WEST, undefined, "a missing utility never reads as lower demand");
  });
});

describe("operatorMixes", () => {
  const hour = (period: string, respondent: string, fuels: Record<string, number>) =>
    Object.entries(fuels).map(([fueltype, value]) => ({ period, respondent, fueltype, value }));

  it("sums member regions at the newest hour they all have complete", () => {
    const mixes = operatorMixes([
      ...hour("2026-11-03T04", "NE", { NG: 100, NUC: 100, WAT: 100 }),
      ...hour("2026-11-03T04", "NY", { NG: 100, NUC: 100 }), // NY's newest is partial
      ...hour("2026-11-03T03", "NE", { NG: 100, NUC: 100, WAT: 100 }),
      ...hour("2026-11-03T03", "NY", { NG: 300, NUC: 100, WAT: 100 }),
    ]);
    assert.equal(mixes.NPCC.periodUtc, "2026-11-03T03");
    assert.equal(mixes.NPCC.totalMw, 800);
    assert.deepEqual(mixes.NPCC.fuels[0], { code: "NG", label: "Natural gas", mw: 400, sharePct: 50 });
  });

  it("counts a small utility that only ever reports two fuels as complete when both are in", () => {
    // Without this the West's mix could never be built: one member (a small
    // irrigation district) reports fewer fuels than the three-fuel floor.
    const west = (period: string, tidc: Record<string, number>) => [
      ...hour(period, "NW", { WAT: 500, NG: 200, WND: 100 }),
      ...hour(period, "SW", { NG: 300, SUN: 200, NUC: 100 }),
      ...hour(period, "BANC", { NG: 30, WAT: 20, SUN: 10 }),
      ...hour(period, "LDWP", { NG: 40, SUN: 30, WAT: 10 }),
      ...hour(period, "IID", { NG: 5, SUN: 5, GEO: 5 }),
      ...hour(period, "TIDC", tidc),
    ];
    const mixes = operatorMixes([...west("2026-11-03T05", { NG: 4 }), ...west("2026-11-03T04", { NG: 4, WAT: 6 })]);
    assert.equal(mixes.WEST.periodUtc, "2026-11-03T04", "the newer hour is missing one of that utility's two fuels");
    assert.equal(mixes.WEST.totalMw, 1565);
  });

  it("leaves negative charging out of generation and omits an operator with no rows", () => {
    const mixes = operatorMixes(hour("2026-11-03T04", "PJM", { NG: 300, NUC: 100, COL: 100, BAT: -50 }));
    assert.equal(mixes.PJM.totalMw, 500);
    assert.ok(!mixes.PJM.fuels.some((f) => f.code === "BAT"));
    assert.equal(mixes.MISO, undefined);
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
        { period: "2026-11-03T16", respondent: "PJM", fueltype: "NG", value: 40000 },
        { period: "2026-11-03T16", respondent: "PJM", fueltype: "NUC", value: 30000 },
        { period: "2026-11-03T16", respondent: "PJM", fueltype: "COL", value: 20000 },
      ],
    },
  };
  const okFetch = (url: URL) => {
    const body = url.pathname.includes("fuel-type-data") ? fuelBody : demandBody;
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  };

  it("keeps each fuel request to about a day and a half of rows, however many regions are served", async () => {
    // EIA caps a request at 5,000 rows and a respondent-hour is about eight fuel rows. One call for all 23
    // respondents would reach back about 27 hours, too short to find a complete hour when a member posts late.
    const urls: URL[] = [];
    await getGridLive({
      env: { EIA_API_KEY: "k" } as NodeJS.ProcessEnv,
      now: () => 1_000_000,
      fetchImpl: (url: URL) => {
        urls.push(url);
        return okFetch(url);
      },
    });
    const fuel = urls.filter((u) => u.pathname.includes("fuel-type-data"));
    const all = new Set(Object.values(OPERATOR_RESPONDENTS).flatMap((s) => s.respondents));
    assert.equal(FUEL_RESPONDENTS_PER_CALL, 14, "the number one call carried when a day and a half was measured");
    assert.equal(fuel.length, Math.ceil(all.size / FUEL_RESPONDENTS_PER_CALL));
    const asked = fuel.flatMap((u) => u.searchParams.getAll("facets[respondent][]"));
    assert.equal(asked.length, all.size, "each respondent is asked for once");
    assert.deepEqual(new Set(asked), all);
    for (const u of fuel) {
      assert.ok(u.searchParams.getAll("facets[respondent][]").length <= FUEL_RESPONDENTS_PER_CALL);
      assert.equal(u.searchParams.get("length"), "5000");
    }
  });

  it("puts the fuel rows of every call together", async () => {
    const caiso = [
      { period: "2026-11-03T16", respondent: "CISO", fueltype: "NG", value: 10000 },
      { period: "2026-11-03T16", respondent: "CISO", fueltype: "SUN", value: 15000 },
      { period: "2026-11-03T16", respondent: "CISO", fueltype: "WND", value: 5000 },
    ];
    const r = await getGridLive({
      env: { EIA_API_KEY: "k" } as NodeJS.ProcessEnv,
      now: () => 1_000_000,
      fetchImpl: (url: URL) => {
        if (!url.pathname.includes("fuel-type-data")) return okFetch(url);
        // Each call answers only for the respondents it asked about, as EIA does.
        const asked = url.searchParams.getAll("facets[respondent][]");
        const data = [...fuelBody.response.data, ...caiso].filter((row) => asked.includes(row.respondent));
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ response: { data } }) });
      },
    });
    assert.equal(r.configured, true);
    if (!r.configured) return;
    assert.equal(r.mixByOperator.PJM.totalMw, 90000);
    assert.equal(r.mixByOperator.CAISO.totalMw, 30000);
    assert.equal(r.mix?.fuels[0].code, "NG");
  });

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
    assert.equal(r.mixByOperator.PJM.totalMw, 90000);
    assert.equal(r.stale, false);
    assert.equal(urls.length, 3, "one demand call and two fuel calls");
    const demandReq = urls.find((u) => u.pathname.includes("region-data"))!;
    assert.deepEqual(demandReq.searchParams.getAll("facets[type][]"), ["D"]);
    assert.ok(demandReq.searchParams.getAll("facets[respondent][]").includes("US48"));
    assert.ok(demandReq.searchParams.getAll("facets[respondent][]").includes("ERCO"));
    const asked = demandReq.searchParams.getAll("facets[respondent][]");
    for (const r of ["CISO", "NYIS", "ISNE", "BANC", "LDWP", "IID", "TIDC", "LGEE", "AECI"]) assert.ok(asked.includes(r), `${r} is requested`);
    assert.equal(new Set(asked).size, asked.length, "each respondent is asked for once");
    assert.equal(demandReq.searchParams.get("length"), String(asked.length * 168));

    t += 5 * 60 * 1000;
    await getGridLive(opts);
    assert.equal(urls.length, 3, "second call inside the cache window must not hit EIA");

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
    assert.deepEqual(r.mixByOperator, {});
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
