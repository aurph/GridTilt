// The dependency gate fails on any unrecorded high or critical advisory and on
// a recorded exception past its review date.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error plain .mjs script, no type declarations
import { gate } from "../../scripts/audit-gate.mjs";

const report = (severity: string, id: string) => ({
  vulnerabilities: {
    braces: { via: [{ url: `https://github.com/advisories/${id}`, severity, title: "t" }] },
    chokidar: { via: ["braces"] },
  },
});
const exc = { advisory: "GHSA-aaaa", package: "braces", reviewBy: "2026-12-31" };

describe("audit gate", () => {
  it("passes a recorded high advisory before its review date", () => {
    assert.deepEqual(gate(report("high", "GHSA-aaaa"), [exc], "2026-10-08"), []);
  });

  it("fails an unrecorded high or critical advisory, ignores moderate", () => {
    assert.equal(gate(report("critical", "GHSA-bbbb"), [], "2026-10-08").length, 1);
    assert.equal(gate(report("high", "GHSA-bbbb"), [exc], "2026-10-08").length, 1);
    assert.deepEqual(gate(report("moderate", "GHSA-bbbb"), [], "2026-10-08"), []);
  });

  it("fails an exception past its review date", () => {
    assert.match(gate(report("high", "GHSA-aaaa"), [exc], "2027-01-01")[0], /reviewBy/);
  });
});
