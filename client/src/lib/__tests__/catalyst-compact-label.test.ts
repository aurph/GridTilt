import { test } from "node:test";
import assert from "node:assert/strict";
import { compactCatalystLabel } from "../catalyst-compact-label";

const NOW = new Date("2026-11-07T12:00:00");

test("an estimated month in the current year becomes 'Mon est.'", () => {
  assert.equal(compactCatalystLabel("around Nov 2026", NOW), "Nov est.");
});

test("an estimated day keeps the day", () => {
  assert.equal(compactCatalystLabel("around Nov 15, 2026", NOW), "Nov 15 est.");
});

test("another year is kept, short", () => {
  assert.equal(compactCatalystLabel("around Mar 2027", NOW), "Mar '27 est.");
});

test("labels that are not estimates pass through unchanged", () => {
  assert.equal(compactCatalystLabel("Dec 2026", NOW), "Dec 2026");
  assert.equal(compactCatalystLabel("date not set", NOW), "date not set");
});
