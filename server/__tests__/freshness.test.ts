// The freshness monitor exists to catch a stopped pipeline and facts nobody has
// re-checked. These tests pin the behaviours that make it trustworthy: it never
// reports data as fresher than it can prove, an unreadable stamp or a run that
// never happened needs attention instead of passing as healthy, a dataset with a
// review schedule alarms when the review is due, and data nobody promised to
// refresh or review is reported without alarming.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  computeFreshness,
  gpuCoverageGaps,
  parseStamp,
  readStamp,
  renderFreshnessAlert,
  type FileContents,
  type ReviewRecord,
} from "../freshness.js";
import { DATASET_REGISTRY, type DatasetSpec } from "../freshness-registry.js";

const NOW = Date.parse("2026-08-05T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const spec = (over: Partial<DatasetSpec> = {}): DatasetSpec => ({
  id: "t",
  label: "Test",
  file: "t.json",
  read: { kind: "envelope", fields: ["lastRefreshed"] },
  expectedMaxAgeHours: 48,
  mechanism: "test mechanism",
  writes: "repo",
  ...over,
});

const dayBefore = (days: number) => new Date(NOW - days * DAY_MS).toISOString().slice(0, 10);

// ─── parseStamp ────────────────────────────────────────────────────────────

test("a bare date parses as the start of that UTC day, never the end", () => {
  // Conservative on purpose: a file stamped today must not read as 0h old.
  assert.equal(parseStamp("2026-08-05"), Date.parse("2026-08-05T00:00:00Z"));
});

test("parseStamp rejects junk rather than coercing it to a date", () => {
  for (const bad of ["", "   ", "not-a-date", null, undefined, 42, {}, []]) {
    assert.equal(parseStamp(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

// ─── readStamp ─────────────────────────────────────────────────────────────

test("envelope strategy reads its declared field", () => {
  assert.equal(
    readStamp({ lastRefreshed: "2026-06-26", other: "x" }, { kind: "envelope", fields: ["lastRefreshed"] }),
    "2026-06-26",
  );
});

test("envelope prefers the earlier field: 'did we look' beats 'did it change'", () => {
  // The scanner stamps lastChecked every run and lastRefreshed only on a real
  // change. Staleness must follow lastChecked, or a dataset checked daily and
  // correctly unchanged reads as abandoned.
  const strategy = { kind: "envelope" as const, fields: ["lastChecked", "lastRefreshed"] };
  assert.equal(
    readStamp({ lastChecked: "2026-08-05", lastRefreshed: "2026-05-20" }, strategy),
    "2026-08-05",
  );
});

test("envelope falls back when the preferred field is absent", () => {
  // Before the scanner has ever run, only lastRefreshed exists.
  const strategy = { kind: "envelope" as const, fields: ["lastChecked", "lastRefreshed"] };
  assert.equal(readStamp({ lastRefreshed: "2026-05-20" }, strategy), "2026-05-20");
});

test("envelope strategy does not accept an array", () => {
  assert.equal(readStamp([{ lastRefreshed: "2026-06-26" }], { kind: "envelope", fields: ["lastRefreshed"] }), null);
});

test("series-max takes the newest row, not the last row", () => {
  const rows = [{ date: "2026-08-03" }, { date: "2026-07-01" }, { date: "2026-08-01" }];
  assert.equal(readStamp(rows, { kind: "series-max", field: "date" }), "2026-08-03");
});

test("series-max ignores malformed rows instead of treating them as epoch", () => {
  // One bad row must not make a live series look dead.
  const rows = [{ date: "2026-08-03" }, { date: "garbage" }, { nope: 1 }, null, "x"];
  assert.equal(readStamp(rows as unknown[], { kind: "series-max", field: "date" }), "2026-08-03");
});

test("the none strategy never invents a stamp", () => {
  assert.equal(readStamp({ lastRefreshed: "2026-08-05" }, { kind: "none" }), null);
});

// ─── classification ────────────────────────────────────────────────────────

test("within cadence is ok", () => {
  const r = computeFreshness({ t: { lastRefreshed: dayBefore(1) } }, NOW, [spec()]);
  assert.equal(r.datasets[0].status, "ok");
  assert.equal(r.healthy, true);
});

test("one missed run reads as aging, not stale", () => {
  // 3d old against a 2d cadence: overdue but under 2x.
  const r = computeFreshness({ t: { lastRefreshed: dayBefore(3) } }, NOW, [spec()]);
  assert.equal(r.datasets[0].status, "aging");
  assert.deepEqual(r.aging, ["t"]);
  // Aging alone must not trip the deadman, or it cries wolf on every hiccup.
  assert.equal(r.healthy, true);
  assert.deepEqual(r.stale, []);
});

test("past double the cadence reads as stale and trips the deadman", () => {
  const r = computeFreshness({ t: { lastRefreshed: dayBefore(9) } }, NOW, [spec()]);
  assert.equal(r.datasets[0].status, "stale");
  assert.deepEqual(r.stale, ["t"]);
  assert.equal(r.healthy, false);
  assert.match(r.datasets[0].detail, /test mechanism has probably stopped/);
});

test("hand-curated data is reported but can never alarm", () => {
  // A curated file going quiet is a decision, not a failure.
  const r = computeFreshness(
    { t: { lastRefreshed: dayBefore(400) } },
    NOW,
    [spec({ expectedMaxAgeHours: null })],
  );
  assert.equal(r.datasets[0].status, "manual");
  assert.equal(r.healthy, true);
});

test("a cadence with no readable timestamp is unknown, and unknown needs attention", () => {
  // It used to pass as healthy. A dataset that promises a cadence but cannot
  // show its age is a gap someone has to close, not a clean bill of health.
  const r = computeFreshness({ t: [{ name: "x" }] }, NOW, [spec({ read: { kind: "none" } })]);
  assert.equal(r.datasets[0].status, "unknown");
  assert.equal(r.datasets[0].asOf, null);
  assert.equal(r.datasets[0].ageHours, null);
  assert.equal(r.healthy, false);
  assert.deepEqual(r.attention.map((a) => a.id), ["t"]);
});

test("a missing file is unknown rather than a crash, and needs attention", () => {
  const r = computeFreshness({} as FileContents, NOW, [spec()]);
  assert.equal(r.datasets[0].status, "unknown");
  assert.equal(r.healthy, false);
});

test("a future timestamp clamps to zero age instead of going negative", () => {
  const r = computeFreshness({ t: { lastRefreshed: "2027-01-01" } }, NOW, [spec()]);
  assert.equal(r.datasets[0].ageHours, 0);
  assert.equal(r.datasets[0].status, "ok");
});

test("one stale dataset makes the whole report unhealthy", () => {
  const r = computeFreshness(
    { a: { lastRefreshed: dayBefore(1) }, b: { lastRefreshed: dayBefore(30) } },
    NOW,
    [spec({ id: "a" }), spec({ id: "b" })],
  );
  assert.equal(r.healthy, false);
  assert.deepEqual(r.stale, ["b"]);
});

// ─── the registry itself ───────────────────────────────────────────────────

test("every registered dataset points at a file that exists", () => {
  // A typo in the registry would otherwise show up as a permanent "unknown",
  // which reads as an instrumentation gap rather than the mistake it is.
  const missing = DATASET_REGISTRY.filter(
    (d) => !existsSync(join(process.cwd(), "server", "data", d.file)),
  ).map((d) => `${d.id} -> server/data/${d.file}`);
  assert.deepEqual(missing, [], `registry points at files that do not exist:\n${missing.join("\n")}`);
});

test("registry ids are unique", () => {
  const ids = DATASET_REGISTRY.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every declared read strategy actually resolves against the real file", () => {
  // Guards the case that matters most: a dataset whose shape changed under the
  // registry would silently report "unknown" forever and never alarm again.
  const broken: string[] = [];
  for (const d of DATASET_REGISTRY) {
    if (d.read.kind === "none") continue;
    const path = join(process.cwd(), "server", "data", d.file);
    if (!existsSync(path)) continue;
    const contents = JSON.parse(readFileSync(path, "utf-8"));
    if (readStamp(contents, d.read) == null) {
      broken.push(`${d.id}: ${d.read.kind} strategy found nothing in ${d.file}`);
    }
  }
  assert.deepEqual(broken, [], `registry read strategies no longer match the data:\n${broken.join("\n")}`);
});

// ─── T22: run, failure, coverage and review states ─────────────────────────

test("a cadence with no recorded run is 'no run observed'", () => {
  const r = computeFreshness({ t: { somethingElse: "x" } }, NOW, [spec()]);
  assert.equal(r.datasets[0].status, "no_run_observed");
  assert.equal(r.healthy, false);
});

test("a failure recorded after the last success is 'fetch failed'; an older one is history", () => {
  const failedAfter = computeFreshness(
    { t: { lastRefreshed: `${dayBefore(1)}T08:00:00Z`, lastFailureAt: `${dayBefore(0)}T09:00:00Z`, lastFailureReason: "all 4 feeds failed" } },
    NOW,
    [spec()],
  );
  assert.equal(failedAfter.datasets[0].status, "fetch_failed");
  assert.match(failedAfter.datasets[0].detail, /all 4 feeds failed/);
  const recovered = computeFreshness(
    { t: { lastRefreshed: `${dayBefore(0)}T09:00:00Z`, lastFailureAt: `${dayBefore(1)}T08:00:00Z` } },
    NOW,
    [spec()],
  );
  assert.equal(recovered.datasets[0].status, "ok");
});

test("one fresh model does not cover for a missing one", () => {
  const history = [
    { date: dayBefore(12), prices: { H100: 2.7, H200: 4.0 } },
    { date: dayBefore(1), prices: { H100: 2.8 } },
  ];
  const gaps = gpuCoverageGaps(history, 72);
  assert.deepEqual(gaps, { observed: ["H100", "H200"], missing: ["H200"], newest: dayBefore(1) });
  const r = computeFreshness({ t: history }, NOW, [
    spec({ read: { kind: "series-max", field: "date" }, expectedMaxAgeHours: 72, coverage: "gpu-observed-models" }),
  ]);
  assert.equal(r.datasets[0].status, "partial_coverage");
  assert.match(r.datasets[0].detail, /1 of 2 observed models have no recent row: H200/);
  const full = computeFreshness({ t: [{ date: dayBefore(1), prices: { H100: 2.8, H200: 4.1 } }] }, NOW, [
    spec({ read: { kind: "series-max", field: "date" }, expectedMaxAgeHours: 72, coverage: "gpu-observed-models" }),
  ]);
  assert.equal(full.datasets[0].status, "ok");
});

test("a review schedule: never reviewed and past due need attention; reviewed in time does not", () => {
  const curated = spec({ expectedMaxAgeHours: null, review: { owner: "Jack", everyDays: 30, scope: "every row" } });
  const never = computeFreshness({ t: { lastRefreshed: dayBefore(5) } }, NOW, [curated]);
  assert.equal(never.datasets[0].status, "review_overdue");
  assert.match(never.datasets[0].detail, /never reviewed: every row \(owner: Jack\)/);

  const review = (reviewed: string, outcome: ReviewRecord["outcome"]): ReviewRecord[] => [
    { dataset: "t", reviewed, outcome, scope: "every row" },
  ];
  const old = computeFreshness({ t: { lastRefreshed: dayBefore(5) } }, NOW, [curated], review(dayBefore(45), "changed"));
  assert.equal(old.datasets[0].status, "review_overdue");
  assert.equal(old.datasets[0].claimLastReviewed, dayBefore(45));

  const fresh = computeFreshness({ t: { lastRefreshed: dayBefore(5) } }, NOW, [curated], review(dayBefore(3), "no-change"));
  assert.equal(fresh.datasets[0].status, "reviewed_no_change");
  assert.equal(fresh.datasets[0].reviewDue, dayBefore(-27));
  assert.equal(fresh.healthy, true);
});

test("job, data and review dates are reported apart, and the worst issue wins", () => {
  const r = computeFreshness(
    { t: { lastChecked: dayBefore(1), lastRefreshed: dayBefore(20) } },
    NOW,
    [
      spec({
        read: { kind: "envelope", fields: ["lastChecked"] },
        dataRead: { kind: "envelope", fields: ["lastRefreshed"] },
        review: { owner: "Jack", everyDays: 90, scope: "firmness" },
      }),
    ],
  );
  const d = r.datasets[0];
  assert.equal(d.jobLastSuccess, dayBefore(1));
  assert.equal(d.dataLastObserved, dayBefore(20));
  assert.equal(d.status, "review_overdue");
  assert.deepEqual(d.issues, ["review_overdue", "ok"]);
});

test("the alert preview says what to do, and notes writes a redeploy would lose", () => {
  const r = computeFreshness(
    { a: { lastRefreshed: dayBefore(30) }, b: { lastRefreshed: dayBefore(1) } },
    NOW,
    [spec({ id: "a", label: "Alpha", writes: "instance" }), spec({ id: "b", label: "Beta" })],
  );
  const alert = renderFreshnessAlert(r);
  assert.equal(alert.subject, "GridTilt data freshness: 1 need attention");
  assert.match(alert.text, /- Alpha \(stale\)/);
  assert.match(alert.text, /What to do: Check that the mechanism named above is running/);
  assert.match(alert.text, /a redeploy reverts it to the committed copy/);
  assert.ok(!alert.text.includes("Beta"));
  const ok = renderFreshnessAlert(computeFreshness({ b: { lastRefreshed: dayBefore(1) } }, NOW, [spec({ id: "b" })]));
  assert.match(ok.subject, /nothing needs attention/);
});

test("the shipped reviews name registered datasets with real dates", () => {
  const root = JSON.parse(readFileSync(join(process.cwd(), "server", "data", "dataset-reviews.json"), "utf-8"));
  const ids = new Set(DATASET_REGISTRY.map((d) => d.id));
  for (const r of root.reviews as ReviewRecord[]) {
    assert.ok(ids.has(r.dataset), `${r.dataset} is not a registered dataset`);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(r.reviewed), `${r.dataset}: reviewed must be YYYY-MM-DD`);
    assert.ok(r.outcome === "changed" || r.outcome === "no-change");
    assert.ok(r.scope && r.scope.length > 10, "a review says what it covered");
  }
});
