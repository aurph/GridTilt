import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FILTERS,
  applyFilters,
  compareSignificance,
  daysBefore,
  emptyMessage,
  formatMagnitude,
  groupByMonth,
  parseFilters,
  rangeWindow,
  serializeFilters,
  tickerOptions,
  weekSummary,
  type Filters,
  type TimelineEvent,
} from "../timeline-filters";

const TODAY = "2026-10-14";

function ev(id: string, date: string, over: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id,
    date,
    dateBasis: "announced",
    eventType: "power_deal",
    title: id,
    sourceTool: "/power-map",
    sourceUrl: "/power-map?tab=deals",
    sourceLinks: [],
    recordKey: `deal:${id}`,
    ...over,
  };
}

// Newest first, as the API serves them.
const EVENTS: TimelineEvent[] = [
  ev("nvda-earnings", "2026-11-17", { eventType: "earnings", relatedTickers: ["NVDA"], recordKey: "ticker:NVDA" }),
  ev("md-hearing", "2026-10-20", { eventType: "state_action", recordKey: "state:maryland" }),
  ev("today-deal", "2026-10-14", { relatedTickers: ["MSFT", "CEG"], magnitude: { unit: "MW", value: 835 } }),
  ev("week-cluster", "2026-10-10", { eventType: "cluster_announced", magnitude: { unit: "GPUs", value: 100000 }, relatedTickers: ["META"], recordKey: "cluster:c1" }),
  ev("week-model", "2026-10-09", { eventType: "model_release", relatedTickers: ["GOOGL"] }),
  ev("week-big-deal", "2026-10-08", { magnitude: { unit: "MW", value: 2000 } }),
  ev("old-deal", "2026-08-01", { relatedTickers: ["MSFT"] }),
  ev("older-post", "2026-03-10", { eventType: "research" }),
  ev("ancient-model", "2019-02-14", { eventType: "model_release" }),
];

const f = (over: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...over });

// ─── URL params ─────────────────────────────────────────────────────────────

test("parse: defaults for an empty or junk query", () => {
  assert.deepEqual(parseFilters(""), DEFAULT_FILTERS);
  assert.deepEqual(parseFilters("?type=nope&range=forever&ticker=<script>&record=%3Cx%3E"), DEFAULT_FILTERS);
});

test("parse: types in canonical order, range, ticker uppercased, record", () => {
  const p = parseFilters("?type=research,power_deal,bogus&range=90d&ticker=nvda&record=deal:tmi-crane");
  assert.deepEqual(p, { types: ["power_deal", "research"], range: "90d", from: null, to: null, ticker: "NVDA", record: "deal:tmi-crane" });
});

test("parse: custom range keeps valid bounds, swaps reversed ones, falls back to all when empty", () => {
  assert.deepEqual(parseFilters("?range=custom&from=2026-01-01&to=2026-03-31"), f({ range: "custom", from: "2026-01-01", to: "2026-03-31" }));
  assert.deepEqual(parseFilters("?range=custom&from=2026-03-31&to=2026-01-01"), f({ range: "custom", from: "2026-01-01", to: "2026-03-31" }));
  assert.deepEqual(parseFilters("?range=custom&from=2026-1-1"), DEFAULT_FILTERS);
  assert.deepEqual(parseFilters("?range=30d&from=2026-01-01"), f({ range: "30d" }));
});

test("serialize: omits defaults and round-trips through parse", () => {
  assert.equal(serializeFilters(DEFAULT_FILTERS), "");
  const cases: Filters[] = [
    f({ types: ["power_deal", "cluster_announced"] }),
    f({ range: "1y", ticker: "MSFT" }),
    f({ range: "custom", from: "2025-01-01", to: "2025-12-31" }),
    f({ range: "custom", from: "2025-01-01" }),
    f({ record: "cluster:nscale-cedarvale" }),
    f({ types: ["earnings"], range: "30d", ticker: "NVDA", record: "ticker:NVDA" }),
  ];
  for (const c of cases) assert.deepEqual(parseFilters(serializeFilters(c)), c, serializeFilters(c));
  assert.equal(serializeFilters(f({ types: ["research", "power_deal"], range: "90d" })), "?type=power_deal,research&range=90d");
});

// ─── Filtering ──────────────────────────────────────────────────────────────

test("no filters: upcoming soonest first, past newest first, today counts as past", () => {
  const { upcoming, past } = applyFilters(EVENTS, DEFAULT_FILTERS, TODAY);
  assert.deepEqual(upcoming.map((e) => e.id), ["md-hearing", "nvda-earnings"]);
  assert.equal(past[0].id, "today-deal");
  assert.equal(past.length, 7);
});

test("type filter", () => {
  const { upcoming, past } = applyFilters(EVENTS, f({ types: ["model_release"] }), TODAY);
  assert.deepEqual(upcoming, []);
  assert.deepEqual(past.map((e) => e.id), ["week-model", "ancient-model"]);
});

test("preset ranges look back from today and leave upcoming alone", () => {
  assert.deepEqual(rangeWindow(f({ range: "30d" }), TODAY), { from: "2026-09-15", to: TODAY });
  const { upcoming, past } = applyFilters(EVENTS, f({ range: "30d" }), TODAY);
  assert.deepEqual(past.map((e) => e.id), ["today-deal", "week-cluster", "week-model", "week-big-deal"]);
  assert.equal(upcoming.length, 2);
  assert.equal(applyFilters(EVENTS, f({ range: "1y" }), TODAY).past.length, 6);
});

test("custom range bounds both lists, inclusive", () => {
  const { upcoming, past } = applyFilters(EVENTS, f({ range: "custom", from: "2026-08-01", to: "2026-10-20" }), TODAY);
  assert.deepEqual(upcoming.map((e) => e.id), ["md-hearing"]);
  assert.deepEqual(past.map((e) => e.id), ["today-deal", "week-cluster", "week-model", "week-big-deal", "old-deal"]);
});

test("ticker filter and record filter", () => {
  assert.deepEqual(applyFilters(EVENTS, f({ ticker: "MSFT" }), TODAY).past.map((e) => e.id), ["today-deal", "old-deal"]);
  const rec = applyFilters(EVENTS, f({ record: "cluster:c1" }), TODAY);
  assert.deepEqual(rec.past.map((e) => e.id), ["week-cluster"]);
  assert.deepEqual(rec.upcoming, []);
});

test("filters combine with AND", () => {
  const { past } = applyFilters(EVENTS, f({ types: ["power_deal"], ticker: "MSFT", range: "30d" }), TODAY);
  assert.deepEqual(past.map((e) => e.id), ["today-deal"]);
  assert.deepEqual(applyFilters(EVENTS, f({ types: ["research"], ticker: "MSFT" }), TODAY).past, []);
});

// ─── Grouping and summary ───────────────────────────────────────────────────

test("groupByMonth keeps order and labels months", () => {
  const groups = groupByMonth(applyFilters(EVENTS, DEFAULT_FILTERS, TODAY).past);
  assert.deepEqual(groups.map((g) => [g.month, g.label, g.events.length]), [
    ["2026-10", "October 2026", 4],
    ["2026-08", "August 2026", 1],
    ["2026-03", "March 2026", 1],
    ["2019-02", "February 2019", 1],
  ]);
});

test("week summary: last 7 days through today, counts by type, top 3 by significance", () => {
  const w = weekSummary(EVENTS, TODAY);
  assert.equal(w.from, "2026-10-08");
  assert.equal(w.total, 4);
  assert.deepEqual(w.counts, [
    { type: "power_deal", count: 2 },
    { type: "cluster_announced", count: 1 },
    { type: "model_release", count: 1 },
  ]);
  assert.deepEqual(w.top.map((e) => e.id), ["week-big-deal", "today-deal", "week-cluster"]);
});

test("week summary is empty, not padded, when nothing is dated in the window", () => {
  const w = weekSummary(EVENTS, "2026-09-01");
  assert.equal(w.total, 0);
  assert.deepEqual(w.top, []);
});

test("significance: sized events before unsized, then type order, then size, then recency", () => {
  const sorted = [
    ev("a", "2026-10-01", { eventType: "research" }),
    ev("b", "2026-10-01", { magnitude: { unit: "MW", value: 100 } }),
    ev("c", "2026-10-02", { magnitude: { unit: "MW", value: 100 } }),
    ev("d", "2026-09-01", { magnitude: { unit: "MW", value: 900 } }),
  ].sort(compareSignificance);
  assert.deepEqual(sorted.map((e) => e.id), ["d", "c", "b", "a"]);
});

test("no today yet (data still loading): empty results, no throw", () => {
  assert.deepEqual(weekSummary(EVENTS, ""), { from: "", total: 0, counts: [], top: [] });
  assert.deepEqual(applyFilters(EVENTS, DEFAULT_FILTERS, ""), { upcoming: [], past: [] });
});

test("ticker options, empty messages, magnitude text, day arithmetic", () => {
  assert.deepEqual(tickerOptions(EVENTS), ["CEG", "GOOGL", "META", "MSFT", "NVDA"]);
  assert.equal(emptyMessage(f({ types: ["power_deal"], range: "30d" })), "No power deals in this range.");
  assert.equal(emptyMessage(f({ ticker: "NVDA" })), "No events tagged NVDA.");
  assert.equal(emptyMessage(f({ record: "deal:x" })), "No events for this record.");
  assert.equal(formatMagnitude({ unit: "MW", value: 12000, qualifier: "up to" }), "up to 12,000 MW");
  assert.equal(formatMagnitude({ unit: "MW", value: 618, qualifier: "rated" }), "618 MW rated");
  assert.equal(formatMagnitude({ unit: "GPUs", value: 104000 }), "104,000 GPUs");
  assert.equal(formatMagnitude({ unit: "USD/GPU-hr", value: 3, direction: "below" }), "$3.00/GPU-hr");
  assert.equal(formatMagnitude({ unit: "USD/M tokens", value: 0.2 }), "$0.2 per M tokens");
  assert.equal(daysBefore("2026-03-01", 1), "2026-02-28");
});
