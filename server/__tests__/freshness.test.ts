// The freshness monitor exists to catch a stopped pipeline. These tests pin the
// behaviours that make it trustworthy: it never reports data as fresher than it
// can prove, it never alarms on data nobody promised to refresh, and a dataset
// that cannot report its age says so instead of guessing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  computeFreshness,
  parseStamp,
  readStamp,
  type FileContents,
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

test("a dataset with no readable timestamp is unknown, not fresh and not stale", () => {
  const r = computeFreshness({ t: [{ name: "x" }] }, NOW, [spec({ read: { kind: "none" } })]);
  assert.equal(r.datasets[0].status, "unknown");
  assert.equal(r.datasets[0].asOf, null);
  assert.equal(r.datasets[0].ageHours, null);
  // Unknown must not alarm: it is a gap in instrumentation, not evidence of failure.
  assert.equal(r.healthy, true);
});

test("a missing file is unknown rather than a crash", () => {
  const r = computeFreshness({} as FileContents, NOW, [spec()]);
  assert.equal(r.datasets[0].status, "unknown");
  assert.equal(r.healthy, true);
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
