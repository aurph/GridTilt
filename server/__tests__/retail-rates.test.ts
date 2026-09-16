import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getRetailRatesByState, groupRetailRows } from "../retail-rates";

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
