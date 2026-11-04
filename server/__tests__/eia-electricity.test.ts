import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  annualFigures,
  electricityUseStamp,
  getElectricityUse,
  indexRows,
  resetElectricityUseCache,
  rollingFigures,
} from "../eia-electricity";

const U = "Million Kilowatthours";
const MSNS = ["ELTCPUS", "ESTCPUS", "ESRCPUS", "ESCCPUS", "ESICPUS", "ESACPUS"];

/** 24 months through `through`, every series reporting 100,000 million kWh (100 TWh) a month. */
function months(through = "2026-07", count = 24, skip: string[] = []) {
  const [y, m] = through.split("-").map(Number);
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (skip.includes(period)) continue;
    // The newer 12 months run 10% above the older 12.
    const value = i < 12 ? 110000 : 100000;
    for (const msn of MSNS) rows.push({ period, msn, value: String(value), unit: U });
  }
  return rows;
}

describe("indexRows", () => {
  it("converts million kWh to TWh and keeps the first duplicate", () => {
    const idx = indexRows([
      { period: "2025", msn: "ELTCPUS", value: "4195084.55", unit: U },
      { period: "2025", msn: "ELTCPUS", value: "1", unit: U },
    ]);
    assert.equal(idx.get("ELTCPUS")!.get("2025"), 4195.08455);
  });

  it("drops gaps, bad periods and other units instead of reading them as zero", () => {
    const idx = indexRows([
      { period: "2025", msn: "A", value: null, unit: U },
      { period: "2025", msn: "A", value: "", unit: U },
      { period: "2025", msn: "A", value: "Not Available", unit: U },
      { period: "2025-13", msn: "A", value: "5", unit: U },
      { period: "2025", msn: "A", value: "5", unit: "Trillion Btu" },
    ]);
    assert.equal(idx.size, 0);
  });
});

describe("annualFigures", () => {
  const year = (y: string, v: number) =>
    MSNS.map((msn) => ({ period: y, msn, value: String(v), unit: U }));

  it("uses the latest year where every sector has a prior year", () => {
    const a = annualFigures(indexRows([...year("2025", 1100000), ...year("2024", 1000000)]));
    assert.equal(a?.period, "2025");
    assert.equal(a?.retailTotalTwh, 1100);
    assert.deepEqual(a?.sectors[0], { sector: "Residential", twh: 1100, yoy: 10 });
    assert.equal(a?.sectors.length, 4);
  });

  it("falls back a year when the newest is missing a sector", () => {
    const rows = [
      ...year("2024", 1100000),
      ...year("2023", 1000000),
      { period: "2025", msn: "ESTCPUS", value: "1200000", unit: U },
    ];
    assert.equal(annualFigures(indexRows(rows))?.period, "2024");
  });
});

describe("rollingFigures", () => {
  it("sums 12 months and compares with the 12 before", () => {
    const r = rollingFigures(indexRows(months()));
    assert.equal(r?.through, "2026-07");
    assert.equal(r?.endUseTwh, 1320);
    assert.equal(r?.endUseYoy, 10);
    assert.equal(r?.retailYoy, 10);
    assert.equal(r?.sectors.length, 4);
    assert.equal(r?.period, "12 months through 2026-07");
  });

  it("steps back rather than letting a missing month read as a drop", () => {
    // Newest month reported for one series only: the window ending there is not usable.
    const rows = [...months("2026-06"), { period: "2026-07", msn: "ELTCPUS", value: "110000", unit: U }];
    assert.equal(rollingFigures(indexRows(rows))?.through, "2026-06");
  });

  it("returns null when a gap sits inside every candidate window", () => {
    assert.equal(rollingFigures(indexRows(months("2026-07", 24, ["2025-12"]))), null);
  });
});

describe("getElectricityUse", () => {
  beforeEach(() => resetElectricityUseCache());

  const annual = ["2021", "2022", "2023", "2024", "2025"].flatMap((period, i) =>
    MSNS.map((msn) => ({ period, msn, value: String(4000000 + i * 10000), unit: U })),
  );
  const okFetch = (url: URL) => {
    const data = url.searchParams.get("frequency") === "annual" ? annual : months();
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ response: { data } }) });
  };

  it("reports unconfigured without a key and never calls out", async () => {
    let calls = 0;
    const r = await getElectricityUse({ env: {} as NodeJS.ProcessEnv, fetchImpl: (u) => { calls++; return okFetch(u); } });
    assert.equal(r.configured, false);
    assert.equal(calls, 0);
  });

  it("serves end use, annual and rolling figures and caches for a day", async () => {
    let t = 1_800_000_000_000;
    let calls = 0;
    const opts = {
      env: { EIA_API_KEY: "k" } as NodeJS.ProcessEnv,
      now: () => t,
      fetchImpl: (u: URL) => { calls++; return okFetch(u); },
    };
    const r = await getElectricityUse(opts);
    assert.equal(r.configured, true);
    if (!r.configured) return;
    assert.equal(r.endUse.length, 5);
    assert.deepEqual(r.endUse[4], { year: "2025", twh: 4040 });
    assert.equal(r.annual?.period, "2025");
    assert.equal(r.rolling?.through, "2026-07");
    assert.equal(calls, 2);
    t += 60 * 60 * 1000;
    await getElectricityUse(opts);
    assert.equal(calls, 2);
    assert.equal(electricityUseStamp().lastRefreshed, "2026-07-01");
  });

  it("serves the last good fetch marked stale when a refresh fails", async () => {
    let t = 1_800_000_000_000;
    let fail = false;
    const opts = {
      env: { EIA_API_KEY: "k" } as NodeJS.ProcessEnv,
      now: () => t,
      fetchImpl: (u: URL) => (fail ? Promise.resolve({ ok: false, status: 500, json: async () => ({}) }) : okFetch(u)),
    };
    await getElectricityUse(opts);
    t += 25 * 60 * 60 * 1000;
    fail = true;
    const r = await getElectricityUse(opts);
    assert.equal(r.configured && r.stale, true);
    assert.equal(r.configured && r.endUse.length, 5);
    assert.equal(electricityUseStamp().lastFailureReason, "EIA responded 500");
  });

  it("treats an empty answer as a failure, not as no electricity", async () => {
    await assert.rejects(
      getElectricityUse({
        env: { EIA_API_KEY: "k" } as NodeJS.ProcessEnv,
        fetchImpl: () => Promise.resolve({ ok: true, status: 200, json: async () => ({ response: { data: [] } }) }),
      }),
      /no usable annual/,
    );
  });
});
