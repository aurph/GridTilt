// The map data files are written with a readable header and one row per line,
// so a quarterly refresh shows up in a diff as the rows that changed.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stringifyRows } from "../json-rows";

describe("stringifyRows", () => {
  const file = {
    dataset: "x",
    source: { name: "A source", url: "https://example.org" },
    counts: { kept: 2 },
    rows: [
      { id: 1, name: "One \"quoted\"", lat: 1.5 },
      { id: 2, name: "Two", lat: -2 },
    ],
  };
  const text = stringifyRows(file, "rows");

  it("round-trips to the same value", () => {
    assert.deepEqual(JSON.parse(text), file);
  });

  it("puts each row on its own line, after an indented header, and ends with a newline", () => {
    const lines = text.split("\n");
    assert.equal(lines[0], "{");
    assert.equal(lines[1], '  "dataset": "x",');
    assert.ok(lines.includes('    {"id":1,"name":"One \\"quoted\\"","lat":1.5},'));
    assert.ok(lines.includes('    {"id":2,"name":"Two","lat":-2}'));
    assert.equal(text.at(-1), "\n");
    assert.equal(text.at(-2), "}");
  });

  it("writes an empty list as an empty list, and refuses a key that is not a list", () => {
    assert.deepEqual(JSON.parse(stringifyRows({ a: 1, rows: [] }, "rows")), { a: 1, rows: [] });
    assert.throws(() => stringifyRows({ a: 1, rows: "nope" }, "rows"), /not an array/);
  });
});
