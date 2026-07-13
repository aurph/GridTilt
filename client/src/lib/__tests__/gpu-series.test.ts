/**
 * Lake 8: exhaustive unit coverage for the Neocloud chart transform module.
 * These functions decide what renders as sourced vs synthetic on an
 * investment chart - a silent bug here misleads real money decisions.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_OBSERVED_GAP_DAYS,
  buildDispersionRuns,
  buildPoints,
  buildSeries,
  buildSpans,
  clipSeries,
  fmtDate,
  logDomain,
  logTicks125,
  nearestPoint,
  parsePointDate,
  rangeAvailability,
  rangeCoverage,
  rangeStart,
  coverageCaption,
  isSparseSeries,
  solveLabelCollisions,
  sparklineDomain,
  valueAt,
  type ChartPoint,
} from "../gpu-series";

const DAY = 86_400_000;
const p = (t: number, price: number, kind: "anchor" | "recorded" = "recorded"): ChartPoint => ({
  t,
  price,
  kind,
  date: new Date(t).toISOString().slice(0, kind === "anchor" ? 7 : 10),
});

describe("parsePointDate", () => {
  it("parses YYYY-MM as a month anchor at UTC month start", () => {
    const r = parsePointDate("2025-07");
    assert.ok(r);
    assert.equal(r.kind, "anchor");
    assert.equal(r.t, Date.UTC(2025, 6, 1));
  });
  it("parses YYYY-MM-DD as a recorded day", () => {
    const r = parsePointDate("2026-07-02");
    assert.ok(r);
    assert.equal(r.kind, "recorded");
    assert.equal(r.t, Date.UTC(2026, 6, 2));
  });
  it("rejects garbage, empty, and partial dates", () => {
    for (const bad of ["", "2025", "07-2025", "2025/07/02", "2025-7", "2025-07-2", "yesterday"]) {
      assert.equal(parsePointDate(bad), null, bad);
    }
  });
});

describe("buildPoints", () => {
  it("orders points by time regardless of input order", () => {
    const pts = buildPoints([
      { date: "2026-01-05", price: 3 },
      { date: "2025-07", price: 5 },
      { date: "2026-01-04", price: 2 },
    ]);
    assert.deepEqual(pts.map((x) => x.price), [5, 2, 3]);
    assert.ok(pts[0].t < pts[1].t && pts[1].t < pts[2].t);
  });
  it("flags anchors vs recorded points correctly", () => {
    const pts = buildPoints([
      { date: "2025-07", price: 12 },
      { date: "2026-07-02", price: 13 },
    ]);
    assert.deepEqual(pts.map((x) => x.kind), ["anchor", "recorded"]);
  });
  it("dedupes identical timestamps, last write wins", () => {
    const pts = buildPoints([
      { date: "2026-07-02", price: 1 },
      { date: "2026-07-02", price: 9 },
    ]);
    assert.equal(pts.length, 1);
    assert.equal(pts[0].price, 9);
  });
  it("drops unparseable dates and non-positive/non-finite prices (log-scale safety)", () => {
    const pts = buildPoints([
      { date: "garbage", price: 5 },
      { date: "2026-07-02", price: 0 },
      { date: "2026-07-03", price: -2 },
      { date: "2026-07-04", price: NaN },
      { date: "2026-07-05", price: Infinity },
      { date: "2026-07-06", price: 4 },
    ]);
    assert.equal(pts.length, 1);
    assert.equal(pts[0].price, 4);
  });
  it("handles empty and null-ish input", () => {
    assert.deepEqual(buildPoints([]), []);
    assert.deepEqual(buildPoints(undefined as never), []);
  });
  it("preserves valid dispersion only on recorded daily points", () => {
    const pts = buildPoints([
      { date: "2026-07", price: 3, low: 2, high: 4, sources: ["curated"], n: 1 },
      { date: "2026-07-02", price: 2.7, low: 2.1, high: 2.9, sources: ["runpod-secure", "vast"], n: 2 },
    ]);
    assert.deepEqual(pts[0], {
      t: Date.UTC(2026, 6, 1),
      price: 3,
      kind: "anchor",
      date: "2026-07",
    });
    assert.deepEqual(pts[1], {
      t: Date.UTC(2026, 6, 2),
      price: 2.7,
      kind: "recorded",
      date: "2026-07-02",
      low: 2.1,
      high: 2.9,
      sources: ["runpod-secure", "vast"],
      n: 2,
    });
  });
  it("drops malformed recorded dispersion rather than inventing a band", () => {
    const [point] = buildPoints([
      { date: "2026-07-02", price: 2.7, low: 3, high: 2, sources: [], n: 0 },
    ]);
    assert.equal(point.low, undefined);
    assert.equal(point.high, undefined);
    assert.equal(point.sources, undefined);
    assert.equal(point.n, undefined);
  });
});

describe("buildSpans", () => {
  it("returns no spans for 0 or 1 point", () => {
    assert.deepEqual(buildSpans([]), []);
    assert.deepEqual(buildSpans([p(0, 1)]), []);
  });
  it("marks consecutive recorded days within the gap as observed", () => {
    const spans = buildSpans([p(0, 1), p(DAY, 2), p(2 * DAY, 3)]);
    assert.equal(spans.length, 1);
    assert.equal(spans[0].quality, "observed");
    assert.equal(spans[0].points.length, 3);
  });
  it("marks anchor-involved segments as interpolated even when close", () => {
    const spans = buildSpans([p(0, 1, "anchor"), p(DAY, 2)]);
    assert.equal(spans.length, 1);
    assert.equal(spans[0].quality, "interpolated");
  });
  it("marks recorded points beyond the max gap as interpolated", () => {
    const spans = buildSpans([p(0, 1), p((MAX_OBSERVED_GAP_DAYS + 1) * DAY, 2)]);
    assert.equal(spans[0].quality, "interpolated");
  });
  it("boundary: exactly the max gap still counts as observed", () => {
    const spans = buildSpans([p(0, 1), p(MAX_OBSERVED_GAP_DAYS * DAY, 2)]);
    assert.equal(spans[0].quality, "observed");
  });
  it("splits alternating qualities into spans sharing endpoints", () => {
    const a = p(0, 1, "anchor");
    const b = p(30 * DAY, 2);
    const c = p(31 * DAY, 3);
    const d = p(90 * DAY, 4, "anchor");
    const spans = buildSpans([a, b, c, d]);
    assert.deepEqual(spans.map((s) => s.quality), ["interpolated", "observed", "interpolated"]);
    // adjacent spans share an endpoint
    assert.equal(spans[0].points[spans[0].points.length - 1], spans[1].points[0]);
    assert.equal(spans[1].points[spans[1].points.length - 1], spans[2].points[0]);
  });
  it("never classifies a synthetic clipped boundary as observed", () => {
    const points = clipSeries([p(0, 1), p(2 * DAY, 2)], DAY, 2 * DAY);
    assert.equal(points[0].edge, true);
    assert.equal(buildSpans(points)[0].quality, "interpolated");
  });
});

describe("buildDispersionRuns", () => {
  const observed = (day: number, low: number, high: number): ChartPoint => ({
    ...p(day * DAY, (low + high) / 2),
    low,
    high,
  });

  it("groups consecutive recorded spreads and breaks at anchors or missing metadata", () => {
    const first = observed(0, 1, 2);
    const second = observed(1, 1.1, 2.1);
    const anchor = p(2 * DAY, 2, "anchor");
    const fourth = observed(3, 1.2, 2.2);
    const fifth = observed(4, 1.3, 2.3);
    const runs = buildDispersionRuns([first, second, anchor, fourth, fifth]);
    assert.deepEqual(runs, [[first, second], [fourth, fifth]]);
  });

  it("does not bridge recorded gaps or render a one-point band", () => {
    const first = observed(0, 1, 2);
    const distant = observed(MAX_OBSERVED_GAP_DAYS + 1, 1, 2);
    assert.deepEqual(buildDispersionRuns([first, distant]), []);
  });

  it("excludes synthetic edge points even if they inherit recorded metadata", () => {
    const first = observed(0, 1, 2);
    const second = observed(2, 1.2, 2.2);
    const clipped = clipSeries([first, second], DAY, 2 * DAY);
    assert.equal(clipped[0].edge, true);
    assert.deepEqual(buildDispersionRuns(clipped), []);
  });
});

describe("buildSeries", () => {
  it("assembles points, spans, launch, latest, and color per model", () => {
    const out = buildSeries(
      [{ model: "H100", vendor: "NVIDIA", series: [{ date: "2025-07", price: 3 }, { date: "2026-07-01", price: 2.79 }] }],
      () => "#123456",
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].color, "#123456");
    assert.equal(out[0].launch?.price, 3);
    assert.equal(out[0].latest?.price, 2.79);
    assert.equal(out[0].spans.length, 1);
  });
  it("empty series produce null launch/latest and no spans", () => {
    const out = buildSeries([{ model: "X", vendor: "V", series: [] }], () => "#000");
    assert.equal(out[0].launch, null);
    assert.equal(out[0].latest, null);
    assert.deepEqual(out[0].spans, []);
  });
});

describe("rangeStart", () => {
  const now = Date.UTC(2026, 6, 2);
  it("computes 1M/3M/6M/1Y starts and null for ALL", () => {
    assert.equal(rangeStart("1M", now), Date.UTC(2026, 5, 2));
    assert.equal(rangeStart("3M", now), Date.UTC(2026, 3, 2));
    assert.equal(rangeStart("6M", now), Date.UTC(2026, 0, 2));
    assert.equal(rangeStart("1Y", now), Date.UTC(2025, 6, 2));
    assert.equal(rangeStart("ALL", now), null);
  });
  it("clamps month-end and leap-day windows instead of overflowing forward", () => {
    assert.equal(rangeStart("1M", Date.UTC(2026, 2, 31)), Date.UTC(2026, 1, 28));
    assert.equal(rangeStart("1Y", Date.UTC(2024, 1, 29)), Date.UTC(2023, 1, 28));
  });
});

describe("range coverage", () => {
  const now = Date.UTC(2026, 6, 13);
  const rows = [
    {
      model: "H100",
      vendor: "NVIDIA",
      series: [
        { date: "2025-06", price: 4 },
        { date: "2026-05", price: 3.2 },
        { date: "2026-07-03", price: 2.7 },
        { date: "2026-07-13", price: 2.6 },
      ],
    },
    {
      model: "A100",
      vendor: "NVIDIA",
      series: [{ date: "2025-10", price: 1.8 }],
    },
  ];
  const series = buildSeries(rows, () => "#fff");

  it("counts real points in the selected window across visible models", () => {
    assert.equal(rangeCoverage(series, rangeStart("1M", now), now), 2);
    assert.equal(rangeCoverage(series, rangeStart("6M", now), now), 3);
    assert.equal(rangeCoverage(series.slice(1), rangeStart("6M", now), now), 0);
  });

  it("enables finite windows only at two real points and always enables ALL", () => {
    const availability = rangeAvailability(series, now);
    assert.deepEqual(availability["1M"], { pointCount: 2, enabled: true });
    assert.deepEqual(availability["3M"], { pointCount: 3, enabled: true });
    assert.deepEqual(availability["6M"], { pointCount: 3, enabled: true });
    assert.deepEqual(availability["1Y"], { pointCount: 4, enabled: true });
    assert.deepEqual(availability.ALL, { pointCount: 5, enabled: true });

    const sparseVisibility = rangeAvailability(series.slice(1), now);
    assert.deepEqual(sparseVisibility["1Y"], { pointCount: 1, enabled: false });
    assert.deepEqual(sparseVisibility.ALL, { pointCount: 1, enabled: true });
  });

  it("does not count a synthetic clipped boundary as a real point", () => {
    const clipped = clipSeries(series[0].points, Date.UTC(2026, 5, 1), now);
    assert.equal(clipped[0].edge, true);
    assert.equal(rangeCoverage(series, Date.UTC(2026, 5, 1), now), 2);
  });
});

describe("sparse coverage copy", () => {
  it("describes anchors-only reset state without calling estimates observations", () => {
    const points = buildPoints([
      { date: "2025-06", price: 4 },
      { date: "2026-01", price: 3.5 },
    ]);
    assert.equal(isSparseSeries(points), true);
    assert.equal(
      coverageCaption(points),
      "2 estimated anchors since 2025-06. Daily history accrues automatically.",
    );
  });

  it("distinguishes recorded days from estimated anchors in mixed sparse data", () => {
    const points = buildPoints([
      { date: "2025-06", price: 4 },
      { date: "2026-01", price: 3.5 },
      { date: "2026-07-03", price: 2.7 },
      { date: "2026-07-04", price: 2.6 },
    ]);
    assert.equal(
      coverageCaption(points),
      "4 points since 2025-06: 2 recorded days, 2 estimated anchors. Daily history accrues automatically.",
    );
  });

  it("marks six-point dense fixtures as non-sparse and handles empty windows", () => {
    const dense = buildPoints(Array.from({ length: 6 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      price: 2 + i / 10,
    })));
    assert.equal(isSparseSeries(dense), false);
    assert.equal(coverageCaption([]), "No points in this window. Daily history accrues automatically.");
  });
});

describe("clipSeries", () => {
  const pts = [p(0, 10), p(10 * DAY, 20), p(20 * DAY, 30)];
  it("passes everything through for ALL (null start)", () => {
    assert.deepEqual(clipSeries(pts, null, 20 * DAY), pts);
  });
  it("interpolates a synthetic edge point at the window start", () => {
    const out = clipSeries(pts, 5 * DAY, 20 * DAY);
    assert.equal(out.length, 3);
    assert.equal(out[0].edge, true);
    assert.equal(out[0].t, 5 * DAY);
    assert.equal(out[0].price, 15); // halfway between 10 and 20
  });
  it("no edge point when the window starts before the first point", () => {
    const out = clipSeries(pts, -5 * DAY, 20 * DAY);
    assert.equal(out[0].edge, undefined);
    assert.equal(out.length, 3);
  });
  it("window past the data yields empty", () => {
    assert.deepEqual(clipSeries(pts, 25 * DAY, 30 * DAY), []);
  });
  it("empty input yields empty output", () => {
    assert.deepEqual(clipSeries([], 0, DAY), []);
  });
});

describe("logTicks125", () => {
  it("emits the 1-2-5 progression across decades", () => {
    assert.deepEqual(logTicks125(1, 20), [1, 2, 5, 10, 20]);
  });
  it("respects fractional decades", () => {
    assert.deepEqual(logTicks125(0.5, 5), [0.5, 1, 2, 5]);
  });
  it("clips to the domain", () => {
    assert.deepEqual(logTicks125(3, 40), [5, 10, 20]);
  });
  it("degenerate domains return empty", () => {
    assert.deepEqual(logTicks125(0, 10), []);
    assert.deepEqual(logTicks125(-1, 10), []);
    assert.deepEqual(logTicks125(10, 1), []);
  });
});

describe("logDomain", () => {
  it("pads in log space", () => {
    const [lo, hi] = logDomain([1, 10]);
    assert.ok(lo < 1 && lo > 0.5);
    assert.ok(hi > 10 && hi < 20);
  });
  it("single value gets symmetric padding", () => {
    const [lo, hi] = logDomain([5]);
    assert.ok(lo < 5 && hi > 5);
  });
  it("ignores non-positive values and falls back on empty", () => {
    assert.deepEqual(logDomain([]), [1, 10]);
    assert.deepEqual(logDomain([-3, 0]), [1, 10]);
  });
});

describe("solveLabelCollisions", () => {
  it("keeps non-colliding labels in place", () => {
    const out = solveLabelCollisions([{ id: "a", y: 10 }, { id: "b", y: 60 }], 0, 100, 15);
    assert.deepEqual(out.map((l) => l.labelY), [10, 60]);
  });
  it("pushes overlapping labels apart to the gap", () => {
    const out = solveLabelCollisions([{ id: "a", y: 50 }, { id: "b", y: 52 }], 0, 200, 15);
    assert.equal(out[1].labelY - out[0].labelY, 15);
  });
  it("keeps order by target y", () => {
    const out = solveLabelCollisions([{ id: "hi", y: 90 }, { id: "lo", y: 10 }], 0, 100, 15);
    assert.equal(out[0].id, "lo");
    assert.equal(out[1].id, "hi");
  });
  it("shifts the stack up when it runs past the bottom", () => {
    const out = solveLabelCollisions(
      [{ id: "a", y: 95 }, { id: "b", y: 97 }, { id: "c", y: 99 }],
      0,
      100,
      15,
    );
    assert.equal(out[2].labelY, 100);
    assert.equal(out[1].labelY, 85);
    assert.equal(out[0].labelY, 70);
  });
  it("clamps at top when the stack cannot fit", () => {
    const out = solveLabelCollisions(
      Array.from({ length: 10 }, (_, i) => ({ id: String(i), y: 50 })),
      0,
      50,
      15,
    );
    for (const l of out) {
      assert.ok(l.labelY >= 0 && l.labelY <= 50);
    }
  });
  it("empty input returns empty", () => {
    assert.deepEqual(solveLabelCollisions([], 0, 100, 15), []);
  });
});

describe("valueAt", () => {
  const pts = [p(0, 10), p(10 * DAY, 20)];
  it("returns the exact point when t lands on one", () => {
    const v = valueAt(pts, 0);
    assert.ok(v);
    assert.equal(v.price, 10);
    assert.equal(v.interpolated, false);
    assert.equal(v.exact, pts[0]);
  });
  it("linearly interpolates inside a span and flags it", () => {
    const v = valueAt(pts, 5 * DAY);
    assert.ok(v);
    assert.equal(v.price, 15);
    assert.equal(v.interpolated, true);
    assert.equal(v.exact, null);
  });
  it("returns null outside the series range and for empty series", () => {
    assert.equal(valueAt(pts, -DAY), null);
    assert.equal(valueAt(pts, 11 * DAY), null);
    assert.equal(valueAt([], 0), null);
  });
});

describe("nearestPoint", () => {
  const pts = [p(0, 1), p(10 * DAY, 2)];
  it("snaps to the closest point", () => {
    assert.equal(nearestPoint(pts, 4 * DAY), pts[0]);
    assert.equal(nearestPoint(pts, 6 * DAY), pts[1]);
  });
  it("empty input returns null", () => {
    assert.equal(nearestPoint([], 0), null);
  });
});

describe("sparklineDomain", () => {
  it("pads the window's own min/max, never zero-based", () => {
    const g = sparklineDomain([100, 110]);
    assert.ok(g);
    assert.equal(g.flat, false);
    assert.ok(g.domain[0] > 90 && g.domain[0] < 100);
    assert.ok(g.domain[1] > 110 && g.domain[1] < 120);
  });
  it("flat window is flagged and padded around the value", () => {
    const g = sparklineDomain([50, 50, 50]);
    assert.ok(g);
    assert.equal(g.flat, true);
    assert.ok(g.domain[0] < 50 && g.domain[1] > 50);
  });
  it("single point yields a flat, padded domain", () => {
    const g = sparklineDomain([42]);
    assert.ok(g);
    assert.equal(g.flat, true);
  });
  it("flat at zero still produces a non-degenerate domain", () => {
    const g = sparklineDomain([0, 0]);
    assert.ok(g);
    assert.ok(g.domain[1] > g.domain[0]);
  });
  it("missing data returns null; non-finite values are ignored", () => {
    assert.equal(sparklineDomain([]), null);
    assert.equal(sparklineDomain([NaN, Infinity]), null);
    const g = sparklineDomain([NaN, 5, 6]);
    assert.ok(g);
    assert.equal(g.flat, false);
  });
});

describe("fmtDate", () => {
  it("formats month and day precision in UTC", () => {
    const t = Date.UTC(2026, 6, 2);
    assert.equal(fmtDate(t, false), "Jul '26");
    assert.equal(fmtDate(t, true), "Jul 2 '26");
  });
});
