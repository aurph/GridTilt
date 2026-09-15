import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveUsage, getRetailRatesByState, groupRetailRows } from "../retail-rates";

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

const USAGE_UNITS = {
  "sales-units": "million kilowatthours",
  "customers-units": "number of customers",
};

describe("deriveUsage", () => {
  it("derives plausible usage and bill from sales, customers, and price", () => {
    // Roughly Maryland: 2.3M residential customers, 2,300 GWh in a summer
    // month, 18.2 cents -> about 1,000 kWh and a $182 bill.
    const usage = deriveUsage([
      { period: "2026-05", stateid: "MD", price: 18.2, sales: 2300, customers: 2_300_000, ...USAGE_UNITS },
      { period: "2026-04", stateid: "MD", price: "17.9", sales: "2100", customers: "2300000", ...USAGE_UNITS },
    ]);
    assert.equal(usage.MD.length, 2);
    assert.equal(usage.MD[0].month, "2026-04"); // oldest first
    assert.ok(Math.abs(usage.MD[1].avgMonthlyKwh - 1000) < 1);
    assert.ok(Math.abs(usage.MD[1].typicalBillUsd - 182) < 0.5);
  });

  it("refuses to derive when the rows' own units disagree with the arithmetic", () => {
    const usage = deriveUsage([
      { period: "2026-05", stateid: "MD", price: 18.2, sales: 2300, customers: 2_300_000, "sales-units": "megawatthours", "customers-units": "number of customers" },
      { period: "2026-05", stateid: "TX", price: 15.1, sales: 4000, customers: 10_000_000 }, // no units fields at all
    ]);
    assert.deepEqual(usage, {});
  });

  it("never divides by zero or fabricates from missing values", () => {
    const usage = deriveUsage([
      { period: "2026-05", stateid: "MD", price: 18.2, sales: 2300, customers: 0, ...USAGE_UNITS },
      { period: "2026-05", stateid: "TX", price: 15.1, sales: null, customers: 10_000_000, ...USAGE_UNITS },
      { period: "2026-05", stateid: "VA", price: null, sales: 3000, customers: 3_000_000, ...USAGE_UNITS },
    ]);
    assert.deepEqual(usage, {});
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
