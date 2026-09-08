// Timeline semantics: live = operational at its online year (rated MW),
// target = everything else at its announced year (planned MW, still a
// promise after the year passes), unknown-dated clusters excluded but
// counted. The map animation is only as honest as these rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseOnlineYear,
  buildTimeline,
  totalsAt,
  type TimelineClusterInput,
} from "../buildout-timeline";

test("parseOnlineYear handles the registry's free-form date styles", () => {
  assert.equal(parseOnlineYear("2025"), 2025);
  assert.equal(parseOnlineYear("2026-06-30"), 2026);
  assert.equal(parseOnlineYear("2027-2030"), 2027); // first year: when it starts arriving
  assert.equal(parseOnlineYear("Phased to 2030"), 2030);
  assert.equal(parseOnlineYear("Full buildout ~Q4 2026"), 2026);
  assert.equal(parseOnlineYear("Late 2020s"), null); // no fabricated precision
  assert.equal(parseOnlineYear(""), null);
  assert.equal(parseOnlineYear(undefined), null);
  assert.equal(parseOnlineYear("est. 1999"), null); // outside the plausible window
});

const input = (over: Partial<TimelineClusterInput>): TimelineClusterInput => ({
  id: "x",
  name: "X",
  operator: "Op",
  status: "operational",
  location: { lat: 30, lng: -97 },
  ratedPowerMW: 100,
  plannedPowerMW: 500,
  onlineDate: "2024",
  ...over,
});

test("live entries use rated MW at their online year; targets use planned MW", () => {
  const t = buildTimeline([
    input({ id: "a", status: "operational", ratedPowerMW: 100, plannedPowerMW: 500, onlineDate: "2024" }),
    input({ id: "b", status: "construction", plannedPowerMW: 900, onlineDate: "2027" }),
  ]);
  assert.equal(t.entries.length, 2);
  assert.deepEqual(
    t.entries.map((e) => [e.id, e.kind, e.mw, e.year]),
    [["a", "live", 100, 2024], ["b", "target", 900, 2027]],
  );
  assert.equal(t.minYear, 2024);
  assert.equal(t.maxYear, 2027);
});

test("unparseable years and zero-MW clusters are excluded and counted", () => {
  const t = buildTimeline([
    input({ id: "a" }),
    input({ id: "nodate", onlineDate: "TBD" }),
    input({ id: "nomw", status: "announced", plannedPowerMW: 0 }),
  ]);
  assert.equal(t.entries.length, 1);
  assert.equal(t.unknownCount, 2);
});

test("totalsAt is cumulative and keeps targets as targets after their year passes", () => {
  const { entries } = buildTimeline([
    input({ id: "a", status: "operational", ratedPowerMW: 100, onlineDate: "2024" }),
    input({ id: "b", status: "operational", ratedPowerMW: 50, onlineDate: "2026" }),
    input({ id: "c", status: "construction", plannedPowerMW: 900, onlineDate: "2025" }),
  ]);
  assert.deepEqual(totalsAt(entries, 2024), { liveMW: 100, liveCount: 1, targetMW: 0, targetCount: 0 });
  // 2026: the 2025-target has NOT become live just because the year passed
  assert.deepEqual(totalsAt(entries, 2026), { liveMW: 150, liveCount: 2, targetMW: 900, targetCount: 1 });
});

test("the shipped registry animates: most clusters dated, sane year span", () => {
  const root = JSON.parse(
    readFileSync(join(process.cwd(), "server", "data", "clusters.json"), "utf-8"),
  );
  const t = buildTimeline(root.clusters);
  assert.ok(t.entries.length >= root.clusters.length * 0.6, `only ${t.entries.length}/${root.clusters.length} datable`);
  assert.ok(t.minYear >= 2020 && t.maxYear <= 2040, `implausible span ${t.minYear}..${t.maxYear}`);
  const now = totalsAt(t.entries, t.maxYear);
  assert.ok(now.liveMW > 0 && now.targetMW > 0);
});
