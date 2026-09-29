// A reader should be able to trace one project claim to the document behind
// it and share the same record. These cases pin what a citation carries.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCitation, materialEvidence, permalink, type CitableRecord } from "../citation";

const RECORD: CitableRecord = {
  id: "stargate-abilene",
  name: "Stargate Abilene (OpenAI/Oracle)",
  location: { city: "Abilene", state: "TX" },
  reviewed: "2026-09-28",
  evidence: [
    { field: "status", value: "6 of 8 buildings delivered", source: "Oracle Q1 FY2027 earnings call", url: "https://example.com/call", published: "2026-09-11" },
    { field: "ratedPowerMW", value: "618 MW delivered, 75% of total capacity", basis: "not stated", source: "Oracle Q1 FY2027 earnings call", url: "https://example.com/call", published: "2026-09-11", primary: true },
    { field: "plannedPowerMW", value: "1.2 GW grid interconnection", source: "Crusoe", url: "https://example.com/crusoe", published: "2025-03-18" },
  ],
};

test("a citation names the record, the claim and its scope, the source with its date and URL, the review date and the permalink", () => {
  const c = buildCitation(RECORD)!;
  assert.ok(c.startsWith("Stargate Abilene (OpenAI/Oracle), Abilene, TX: 618 MW delivered"));
  assert.ok(c.includes("(rated power; basis: not stated)"));
  assert.ok(c.includes("Source: Oracle Q1 FY2027 earnings call, 2026-09-11, https://example.com/call."));
  assert.ok(c.includes("reviewed 2026-09-28: https://gridtilt.com/compute-frontier/stargate-abilene"));
});

test("the lead claim is delivered power, then planned power, then the first entry", () => {
  assert.equal(materialEvidence(RECORD.evidence)?.field, "ratedPowerMW");
  assert.equal(materialEvidence(RECORD.evidence!.filter((e) => e.field !== "ratedPowerMW"))?.field, "plannedPowerMW");
  assert.equal(materialEvidence([])?.field, undefined);
});

test("a record not reviewed field by field has no citation to copy", () => {
  assert.equal(buildCitation({ ...RECORD, evidence: undefined }), null);
  assert.equal(buildCitation({ ...RECORD, reviewed: undefined }), null);
});

test("the permalink is the record's own page", () => {
  assert.equal(permalink("stargate-abilene"), "https://gridtilt.com/compute-frontier/stargate-abilene");
  assert.equal(permalink("a b"), "https://gridtilt.com/compute-frontier/a%20b");
});
