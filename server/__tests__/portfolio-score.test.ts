// Regression guard: an unrecognised ticker such as NOTAREALTICKER scored 8/100
// with a made-up sector split and the sentence "No direct AI power
// infrastructure exposure identified", which is a claim about a company the
// registry knows nothing about. It was then averaged into the basket. A null or
// object in the list threw inside .trim() and returned 500, and "NVDA, nvda"
// counted NVIDIA twice.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_TICKERS,
  normalizeTickerInput,
  scoreTicker,
  scoreBasket,
  type CompanyEntry,
} from "../portfolio-score";

const DB: Record<string, CompanyEntry> = {
  NVDA: {
    name: "NVIDIA Corporation",
    primarySegment: "Compute",
    sectors: { Compute: 98, Infrastructure: 40, Power: 15, Cooling: 20, Grid: 5 },
    explanation: "GPUs.",
  },
  CEG: {
    name: "Constellation Energy",
    primarySegment: "Power",
    sectors: { Compute: 5, Infrastructure: 15, Power: 90, Cooling: 5, Grid: 35 },
    explanation: "Nuclear.",
  },
};

test("a known ticker keeps the score the old formula gave it", () => {
  // 98*.3 + 40*.25 + 15*.25 + 20*.1 + 5*.1 = 45.65 -> 46
  const r = scoreTicker("NVDA", DB);
  assert.equal(r.covered, true);
  assert.equal(r.covered && r.score, 46);
});

test("an unrecognised symbol is uncovered: no score, no sectors, no claim about it", () => {
  const r = scoreTicker("NOTAREALTICKER", DB);
  assert.deepEqual(r, { ticker: "NOTAREALTICKER", covered: false });
});

test("adding an unknown ticker leaves the covered mean unchanged", () => {
  const known = scoreBasket(["NVDA", "CEG"], DB);
  const mixed = scoreBasket(["NVDA", "CEG", "ZZZZ"], DB);
  assert.equal(mixed.summary.meanScore, known.summary.meanScore);
  assert.equal(mixed.summary.requested, 3);
  assert.equal(mixed.summary.covered, 2);
});

test("an all-unknown basket has no score rather than zero exposure", () => {
  const b = scoreBasket(["AAAA", "BBBB"], DB);
  assert.equal(b.summary.meanScore, null);
  assert.equal(b.summary.covered, 0);
  assert.ok(b.results.every((r) => !r.covered));
});

test("case and whitespace variants are one ticker, not double weight", () => {
  const n = normalizeTickerInput(["NVDA", " nvda ", "Nvda", "CEG"]);
  assert.deepEqual(n, { ok: true, tickers: ["NVDA", "CEG"] });
  const b = scoreBasket(n.ok ? n.tickers : [], DB);
  assert.equal(b.summary.requested, 2);
});

test("null, objects, numbers and blanks are validation errors, not crashes", () => {
  for (const bad of [[null], [{}], [42], [""], ["   "], "NVDA", null, undefined, [], {}]) {
    const n = normalizeTickerInput(bad);
    assert.equal(n.ok, false, `accepted ${JSON.stringify(bad)}`);
  }
});

test("a string that is not a symbol is rejected", () => {
  for (const bad of ["NV DA", "<script>", "AAPL;DROP", "ABCDEFGHIJKLMNOPQ"]) {
    assert.equal(normalizeTickerInput([bad]).ok, false, bad);
  }
  assert.deepEqual(normalizeTickerInput(["BRK.B", "rds-a"]), { ok: true, tickers: ["BRK.B", "RDS-A"] });
  // The audit's synthetic symbol is well-formed, so it is a normal uncovered result.
  assert.deepEqual(normalizeTickerInput(["notarealticker"]), { ok: true, tickers: ["NOTAREALTICKER"] });
});

test("the 15-ticker cap is enforced on distinct tickers, and said out loud", () => {
  const fifteen = Array.from({ length: MAX_TICKERS }, (_, i) => `T${i}`);
  assert.equal(normalizeTickerInput(fifteen).ok, true);
  assert.equal(normalizeTickerInput([...fifteen, "T0"]).ok, true, "a duplicate does not count toward the cap");
  const over = normalizeTickerInput([...fifteen, "EXTRA"]);
  assert.equal(over.ok, false);
  assert.ok(!over.ok && /15/.test(over.error));
});
