// Regression guard: the calendar listed "LBNL Queued Up 2026 Edition expected"
// for December 15 after LBNL had published that edition in May. Stock pages
// titled "Upcoming Catalysts" listed events months in the past, because only the
// calendar filtered dates. The calendar compared against the UTC date, so after
// 8 pm Eastern a same-day event dropped off early, and a non-date string such as
// "TBD" sorted after every ISO date and passed as upcoming.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  easternDate,
  catalystPhase,
  upcomingCatalysts,
  catalystSortDate,
  catalystDateLabel,
  catalystShortLabel,
  type CatalystRecord,
} from "../catalyst-lifecycle";

const TODAY = "2026-09-28";

function c(p: Partial<CatalystRecord> & { id: number; date: string }): CatalystRecord {
  return { title: `event ${p.id}`, category: "Regulatory", thesisImpact: "", tickers: [], ...p };
}

test("the calendar day is Eastern, not UTC", () => {
  // 9:30 pm Eastern on Sept 28 is already Sept 29 in UTC.
  assert.equal(easternDate(new Date("2026-09-29T01:30:00Z")), "2026-09-28");
  assert.equal(easternDate(new Date("2026-09-28T04:30:00Z")), "2026-09-28");
});

test("yesterday is past, today is still upcoming, tomorrow is upcoming", () => {
  assert.equal(catalystPhase(c({ id: 1, date: "2026-09-27" }), TODAY), "past");
  assert.equal(catalystPhase(c({ id: 2, date: "2026-09-28" }), TODAY), "upcoming");
  assert.equal(catalystPhase(c({ id: 3, date: "2026-12-15" }), TODAY), "upcoming");
});

test("a completed event is past even if its date is ahead", () => {
  assert.equal(catalystPhase(c({ id: 4, date: "2026-12-15", status: "completed" }), TODAY), "past");
});

test("an unknown or malformed date is undated, never today", () => {
  for (const date of ["TBD", "", "2026-13-01", "2026-02-30", "Dec 2026"]) {
    assert.equal(catalystPhase(c({ id: 5, date }), TODAY), "undated", date);
  }
  assert.deepEqual(upcomingCatalysts([c({ id: 6, date: "TBD" })], TODAY), []);
});

test("a month-level window stays upcoming until the month ends", () => {
  assert.equal(catalystPhase(c({ id: 7, date: "2026-09", dateKind: "estimated" }), TODAY), "upcoming");
  assert.equal(catalystPhase(c({ id: 8, date: "2026-08", dateKind: "estimated" }), TODAY), "past");
});

test("upcoming is sorted by date and filtered by ticker", () => {
  const list = [
    c({ id: 1, date: "2026-11-01", tickers: ["GEV"] }),
    c({ id: 2, date: "2026-10-01", tickers: ["GEV", "ETN"] }),
    c({ id: 3, date: "2026-09-01", tickers: ["GEV"] }),
    c({ id: 4, date: "2026-10-15", tickers: ["ETN"] }),
  ];
  assert.deepEqual(upcomingCatalysts(list, TODAY).map((x) => x.id), [2, 4, 1]);
  assert.deepEqual(upcomingCatalysts(list, TODAY, { ticker: "GEV" }).map((x) => x.id), [2, 1]);
});

test("the stock page and the calendar draw the same upcoming set", () => {
  const list = [
    c({ id: 1, date: "2026-06-01", tickers: ["GEV"] }),
    c({ id: 2, date: "2026-10-01", tickers: ["GEV"] }),
  ];
  const calendar = upcomingCatalysts(list, TODAY).filter((x) => x.tickers.includes("GEV"));
  const stock = upcomingCatalysts(list, TODAY, { ticker: "GEV" });
  assert.deepEqual(stock, calendar);
});

test("a window ending before a horizon is inside it", () => {
  const list = [c({ id: 1, date: "2026-10-02" }), c({ id: 2, date: "2026-10-09" })];
  assert.deepEqual(upcomingCatalysts(list, TODAY, { through: "2026-10-05" }).map((x) => x.id), [1]);
});

test("a month-level date sorts at the start of its month and reads as a month", () => {
  assert.equal(catalystSortDate(c({ id: 1, date: "2026-12" })), "2026-12-01");
  assert.equal(catalystSortDate(c({ id: 2, date: "2026-10-05" })), "2026-10-05");
  assert.equal(catalystDateLabel(c({ id: 3, date: "2026-12" })), "Dec 2026");
  assert.equal(catalystDateLabel(c({ id: 4, date: "2026-10-05" })), "Oct 5, 2026");
  assert.equal(catalystDateLabel(c({ id: 5, date: "2026-10-05", dateKind: "estimated" })), "around Oct 5, 2026");
  assert.equal(catalystDateLabel(c({ id: 6, date: "TBD" })), "date not set");
});

test("the shipped calendar lists no LBNL edition as expected after it was published", () => {
  const list = JSON.parse(readFileSync(join(process.cwd(), "server", "data", "catalysts.json"), "utf-8")) as CatalystRecord[];
  const lbnl = list.filter((x) => /queued up 2026/i.test(x.title));
  for (const x of lbnl) {
    assert.equal(catalystPhase(x, TODAY), "past", "LBNL published the 2026 edition in May 2026");
    assert.ok(!/expected/i.test(x.title), "a published report is not an expected one");
  }
  for (const x of list) {
    assert.notEqual(catalystPhase(x, TODAY), "undated", `catalyst ${x.id} has an unusable date`);
  }
});

test("only an exact, confirmed day is left to the caller to format", () => {
  assert.equal(catalystShortLabel(c({ id: 1, date: "2026-10-05" })), null);
  assert.equal(catalystShortLabel(c({ id: 2, date: "2026-10" })), "Oct 2026");
  assert.equal(catalystShortLabel(c({ id: 3, date: "2026-10", dateKind: "estimated" })), "around Oct 2026");
  assert.equal(catalystShortLabel(c({ id: 4, date: "2026-10-15", dateKind: "estimated" })), "around Oct 15");
  assert.equal(catalystShortLabel(c({ id: 5, date: "soon" })), "date not set");
});
