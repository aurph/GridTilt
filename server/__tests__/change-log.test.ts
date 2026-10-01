// The public change log: the shipped file is valid, and the validator holds
// every record to before/after, a dated https source, a review date, a scope
// and a reason. A "checked, no change" record is its own kind.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sortChanges, validateChangeLog, type ChangeRecord } from "../change-log";

const shipped = JSON.parse(readFileSync(join(process.cwd(), "server", "data", "change-log.json"), "utf-8"));

const GOOD: ChangeRecord = {
  id: "2026-10-01-example-fix",
  kind: "correction",
  entity: "clusters/example",
  field: "Rated power",
  before: "100 MW",
  after: "120 MW",
  source: "Operator filing",
  sourceUrl: "https://example.com/filing",
  sourceDate: "2026-09",
  reviewed: "2026-10-01",
  scope: "Compute Frontier",
  rationale: "The filing gives the delivered figure.",
};

describe("change log", () => {
  it("the shipped log is valid", () => {
    assert.deepEqual(validateChangeLog(shipped.changes), []);
    assert.ok(shipped.changes.length > 0);
  });

  it("requires the value before and after, and that they differ", () => {
    assert.match(validateChangeLog([{ ...GOOD, before: undefined }]).join(), /before and after/);
    assert.match(validateChangeLog([{ ...GOOD, after: "100 MW" }]).join(), /the same/);
  });

  it("requires a dated https source, a review date that starts the id, a scope and a reason", () => {
    assert.match(validateChangeLog([{ ...GOOD, sourceUrl: "http://example.com" }]).join(), /https/);
    assert.match(validateChangeLog([{ ...GOOD, sourceDate: "September 2026" }]).join(), /sourceDate/);
    assert.match(validateChangeLog([{ ...GOOD, reviewed: "2026-10-02" }]).join(), /starts with the reviewed date/);
    assert.match(validateChangeLog([{ ...GOOD, scope: " " }]).join(), /scope is required/);
    assert.match(validateChangeLog([{ ...GOOD, rationale: "" }]).join(), /rationale is required/);
    assert.match(validateChangeLog([GOOD, GOOD]).join(), /duplicate id/);
  });

  it("keeps 'checked, no material change' distinct from a change", () => {
    const checked = { ...GOOD, kind: "checked-no-change", before: undefined, after: undefined, checked: "Rated power against the Q3 filing" };
    assert.deepEqual(validateChangeLog([checked]), []);
    assert.match(validateChangeLog([{ ...checked, before: "100 MW" }]).join(), /no before or after/);
    assert.match(validateChangeLog([{ ...checked, checked: undefined }]).join(), /says what was checked/);
  });

  it("holds a short form to short values and a gridtilt.com page", () => {
    const short = { label: "Example rated power", before: "100 MW", after: "120 MW", source: "Operator filing", url: "https://gridtilt.com/compute-frontier/example" };
    assert.deepEqual(validateChangeLog([{ ...GOOD, short }]), []);
    assert.match(validateChangeLog([{ ...GOOD, short: { ...short, source: "" } }]).join(), /short\.source/);
    assert.match(validateChangeLog([{ ...GOOD, short: { ...short, after: "x".repeat(81) } }]).join(), /short\.after/);
    assert.match(validateChangeLog([{ ...GOOD, short: { ...short, url: "https://example.com/page" } }]).join(), /gridtilt\.com page/);
    // The id check still runs when a short form is present.
    assert.match(validateChangeLog([{ ...GOOD, reviewed: "2026-10-02", short }]).join(), /starts with the reviewed date/);
  });

  it("lists the newest review first", () => {
    const older = { ...GOOD, id: "2026-09-01-older", reviewed: "2026-09-01" };
    assert.deepEqual(sortChanges([older, GOOD]).map((c) => c.id), ["2026-10-01-example-fix", "2026-09-01-older"]);
  });
});
