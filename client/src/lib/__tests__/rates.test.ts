// "A year earlier" means the same month last year, found by month: a series
// that skips a month must not compare against the 13th point back.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { monthsBefore, yearAgoPoint, yearOnYearChange } from "../rates";

const series = (months: string[]) => months.map((month, i) => ({ month, centsPerKwh: 10 + i }));

describe("rates: year-on-year by month", () => {
  it("steps back across year boundaries", () => {
    assert.equal(monthsBefore("2026-07", 12), "2025-07");
    assert.equal(monthsBefore("2026-01", 1), "2025-12");
    assert.equal(monthsBefore("2026-12", 12), "2025-12");
  });

  it("finds the same month last year, and nothing when it is missing", () => {
    const full = series(["2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]);
    assert.equal(yearAgoPoint(full)?.month, "2025-07");
    // One month dropped: the 13th point back is now June 2025, which is not a year earlier.
    const gap = series(["2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-05", "2026-06", "2026-07"]);
    assert.equal(yearAgoPoint(gap)?.month, "2025-07");
    const missing = series(["2025-06", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]);
    assert.equal(yearAgoPoint(missing), null);
    assert.equal(yearOnYearChange(missing), null);
    assert.equal(yearAgoPoint([]), null);
  });

  it("computes the change from the matched month", () => {
    const pts = [
      { month: "2025-07", centsPerKwh: 18.83 },
      { month: "2026-07", centsPerKwh: 21.41 },
    ];
    assert.equal(yearOnYearChange(pts)?.toFixed(1), "13.7");
  });
});
