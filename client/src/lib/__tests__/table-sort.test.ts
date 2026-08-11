import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nextSort, compare, sortBy, ariaSort } from "../table-sort";

describe("nextSort", () => {
  it("flips direction when the active column is clicked again", () => {
    assert.deepEqual(nextSort({ key: "mw", dir: "desc" }, "mw"), { key: "mw", dir: "asc" });
    assert.deepEqual(nextSort({ key: "mw", dir: "asc" }, "mw"), { key: "mw", dir: "desc" });
  });

  it("opens a numeric column largest-first", () => {
    assert.deepEqual(nextSort({ key: "name", dir: "asc" }, "mw", ["name"]), { key: "mw", dir: "desc" });
  });

  it("opens a declared text column A to Z", () => {
    assert.deepEqual(nextSort({ key: "mw", dir: "desc" }, "name", ["name"]), { key: "name", dir: "asc" });
  });
});

describe("compare", () => {
  it("orders numbers by direction", () => {
    assert.ok(compare(1, 2, "asc") < 0);
    assert.ok(compare(1, 2, "desc") > 0);
  });

  it("orders strings by locale", () => {
    assert.ok(compare("apple", "banana", "asc") < 0);
    assert.ok(compare("apple", "banana", "desc") > 0);
  });

  it("sinks blanks to the bottom in BOTH directions", () => {
    // The bug this prevents: flipping the sort floats every "no data" row to
    // the top, which reads as if those rows scored highest.
    for (const dir of ["asc", "desc"] as const) {
      assert.ok(compare(null, 5, dir) > 0, `null after number (${dir})`);
      assert.ok(compare(5, null, dir) < 0, `number before null (${dir})`);
      assert.ok(compare(undefined, 5, dir) > 0, `undefined after number (${dir})`);
      assert.ok(compare(NaN, 5, dir) > 0, `NaN after number (${dir})`);
    }
  });

  it("treats two blanks as equal", () => {
    assert.equal(compare(null, undefined, "asc"), 0);
  });
});

describe("sortBy", () => {
  const rows = [
    { name: "Delta", mw: 100 },
    { name: "Alpha", mw: null as number | null },
    { name: "Charlie", mw: 300 },
    { name: "Bravo", mw: 100 },
  ];

  it("sorts descending with blanks last", () => {
    assert.deepEqual(
      sortBy(rows, (r) => r.mw, "desc").map((r) => r.name),
      ["Charlie", "Delta", "Bravo", "Alpha"],
    );
  });

  it("sorts ascending with blanks still last", () => {
    assert.deepEqual(
      sortBy(rows, (r) => r.mw, "asc").map((r) => r.name),
      ["Delta", "Bravo", "Charlie", "Alpha"],
    );
  });

  it("breaks ties by the tiebreak key instead of input order", () => {
    assert.deepEqual(
      sortBy(rows, (r) => r.mw, "desc", (r) => r.name).map((r) => r.name),
      ["Charlie", "Bravo", "Delta", "Alpha"],
    );
  });

  it("does not mutate the input", () => {
    const before = rows.map((r) => r.name);
    sortBy(rows, (r) => r.mw, "asc");
    assert.deepEqual(rows.map((r) => r.name), before);
  });
});

describe("ariaSort", () => {
  it("reports the active column's direction and none elsewhere", () => {
    assert.equal(ariaSort(true, "asc"), "ascending");
    assert.equal(ariaSort(true, "desc"), "descending");
    assert.equal(ariaSort(false, "desc"), "none");
  });
});
