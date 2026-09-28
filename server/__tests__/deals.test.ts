// Locks the AI power-agreement math. The page used to sum every row with a buyer
// into one "contracted" figure: letters of intent, "up to" frameworks, a
// company-wide 34.7 GW portfolio next to the deals inside it, and a 500 MW
// fleet framework filed as one 50 MW plant. The totals below are defined per
// agreement status and never added across statuses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeDealMetrics,
  normalizeOfftaker,
  mergeBacklogProjectUpdate,
  parseBacklogProjectRequest,
  FIRMNESS_VALUES,
  ASSET_VALUES,
  type DealProject,
} from "../deals";

const REVIEW = { firmnessSource: "https://example.com/release", reviewed: "2026-09-28" };

function deal(p: Partial<DealProject> & { id: string }): DealProject {
  return {
    projectName: p.id,
    sponsor: "Seller",
    capacityMW: 100,
    type: "nuclear",
    status: "active",
    category: "ppa",
    offtaker: "Microsoft",
    sources: ["https://example.com/release"],
    ...p,
  } as DealProject;
}

test("normalizeOfftaker folds buyer name variants", () => {
  assert.equal(normalizeOfftaker("Amazon Web Services (17-year, $18B)"), "Amazon (AWS)");
  assert.equal(normalizeOfftaker("Microsoft (20-year PPA)"), "Microsoft");
  assert.equal(normalizeOfftaker("Google + TVA"), "Google");
  assert.equal(normalizeOfftaker("Meta (VPPA)"), "Meta");
  assert.equal(normalizeOfftaker("Constellation + AES"), "Constellation");
  assert.equal(normalizeOfftaker("Undisclosed hyperscaler (terms agreed)"), "Undisclosed buyers");
  assert.equal(normalizeOfftaker("Unnamed PA datacenter"), "Undisclosed buyers");
  assert.equal(normalizeOfftaker("Two undisclosed data center operators (LOIs)"), "Undisclosed buyers");
  assert.equal(normalizeOfftaker("Multiple offtakers + state agreements"), "Multiple buyers");
  assert.equal(normalizeOfftaker("Hyperscale data centers (multiple)"), "Multiple buyers");
});

test("there is no single contracted total to misread", () => {
  const m = computeDealMetrics([deal({ id: "a", firmness: "signed", ...REVIEW })]);
  assert.ok(!("totalContractedMW" in m), "the old all-rows sum must not come back under its old name");
});

test("a letter of intent never enters the signed subtotal", () => {
  const m = computeDealMetrics([
    deal({ id: "ppa", capacityMW: 835, firmness: "signed", ...REVIEW }),
    deal({ id: "loi", capacityMW: 750, firmness: "preliminary", ...REVIEW }),
  ]);
  assert.equal(m.signed.mw, 835);
  assert.equal(m.signed.count, 1);
  assert.equal(m.byFirmness.find((b) => b.key === "preliminary")?.mw, 750);
});

test("a 50 MW plant is not its 500 MW framework, and neither absorbs the other", () => {
  const m = computeDealMetrics([
    deal({ id: "plant", capacityMW: 50, firmness: "signed", ...REVIEW }),
    deal({ id: "fleet", capacityMW: 500, firmness: "framework", includes: ["plant"], upTo: true, ...REVIEW }),
  ]);
  assert.equal(m.signed.mw, 50);
  assert.equal(m.byFirmness.find((b) => b.key === "framework")?.mw, 500);
  const fleet = m.rows.find((r) => r.id === "fleet");
  assert.deepEqual(fleet?.includes, ["plant"]);
});

test("a row inside another row in the same subtotal is not counted twice", () => {
  // e.g. a 300 MW tranche that is part of a 1,920 MW contract listed separately.
  const m = computeDealMetrics([
    deal({ id: "parent", capacityMW: 1920, firmness: "signed", includes: ["child"], ...REVIEW }),
    deal({ id: "child", capacityMW: 300, firmness: "signed", ...REVIEW }),
  ]);
  assert.equal(m.signed.mw, 1920);
  assert.equal(m.signed.count, 1);
});

test("frameworks and options are one ceiling figure, each MW counted once", () => {
  const m = computeDealMetrics([
    deal({ id: "master", capacityMW: 500, firmness: "framework", includes: ["opt"], upTo: true, ...REVIEW }),
    deal({ id: "opt", capacityMW: 300, firmness: "option", ...REVIEW }),
    deal({ id: "other-opt", capacityMW: 100, firmness: "option", ...REVIEW }),
  ]);
  assert.equal(m.frameworksAndOptions.mw, 600);
  assert.equal(m.frameworksAndOptions.count, 2);
});

test("a company-wide portfolio is listed but never added to the deals inside it", () => {
  const m = computeDealMetrics([
    deal({ id: "fleet", capacityMW: 40000, category: "aggregate", firmness: "portfolio", ...REVIEW }),
    deal({ id: "brookfield", capacityMW: 10500, firmness: "framework", ...REVIEW }),
    deal({ id: "crane", capacityMW: 835, firmness: "signed", ...REVIEW }),
  ]);
  assert.equal(m.signed.mw, 835);
  assert.equal(m.signedByBuyer.find((b) => b.key === "Microsoft")?.mw, 835);
  assert.equal(m.byFirmness.find((b) => b.key === "portfolio")?.mw, 40000);
  assert.ok(m.rows.find((r) => r.id === "fleet")?.aggregate);
});

test("an undisclosed capacity is not a measured zero", () => {
  const m = computeDealMetrics([
    deal({ id: "known", capacityMW: 400, firmness: "signed", ...REVIEW }),
    deal({ id: "secret", capacityMW: null, firmness: "signed", ...REVIEW }),
  ]);
  assert.equal(m.signed.mw, 400);
  assert.equal(m.signed.count, 2);
  assert.equal(m.signed.undisclosed, 1);
  assert.equal(m.rows.find((r) => r.id === "secret")?.capacityMW, null);
});

test("an unreviewed row stays unreviewed and out of every status subtotal", () => {
  const m = computeDealMetrics([
    deal({ id: "reviewed", capacityMW: 100, firmness: "signed", ...REVIEW }),
    deal({ id: "fresh", capacityMW: 900 }),
  ]);
  assert.equal(m.signed.mw, 100);
  assert.equal(m.rows.find((r) => r.id === "fresh")?.firmness, "unreviewed");
  assert.equal(m.byFirmness.find((b) => b.key === "unreviewed")?.count, 1);
});

test("a status without its source and review date is not trusted", () => {
  const m = computeDealMetrics([deal({ id: "claimed", capacityMW: 700, firmness: "signed" })]);
  assert.equal(m.signed.mw, 0);
  assert.equal(m.rows[0].firmness, "unreviewed");
});

test("contract capacity is not new generation", () => {
  const m = computeDealMetrics([
    deal({ id: "existing-plant", capacityMW: 1121, firmness: "signed", asset: "existing", ...REVIEW }),
    deal({ id: "new-plant", capacityMW: 200, firmness: "signed", asset: "new-build", ...REVIEW }),
    deal({ id: "not-stated", capacityMW: 50, firmness: "signed", ...REVIEW }),
  ]);
  const byAsset = Object.fromEntries(m.signedByAsset.map((b) => [b.key, b.mw]));
  assert.equal(byAsset["existing"], 1121);
  assert.equal(byAsset["new-build"], 200);
  assert.equal(byAsset["not stated"], 50);
});

test("power sold to the grid at large is not an AI power agreement", () => {
  const m = computeDealMetrics([
    deal({ id: "grid", capacityMW: 2200, offtaker: "California grid", firmness: "not-ai-offtake", ...REVIEW }),
    deal({ id: "ppa", capacityMW: 100, firmness: "signed", ...REVIEW }),
  ]);
  assert.deepEqual(m.rows.map((r) => r.id), ["ppa"]);
});

test("data-center load projects are not power agreements", () => {
  const m = computeDealMetrics([
    deal({ id: "site", capacityMW: 1200, type: "load", category: "load", offtaker: null }),
    deal({ id: "site2", capacityMW: 500, type: "load", category: "load", offtaker: "Meta" }),
    deal({ id: "ppa", capacityMW: 100, firmness: "signed", ...REVIEW }),
  ]);
  assert.deepEqual(m.rows.map((r) => r.id), ["ppa"]);
});

test("an admin edit keeps a review only while the reviewed facts are unchanged", () => {
  const existing = deal({ id: "x", capacityMW: 835, firmness: "signed", asset: "restart", ...REVIEW });
  const same = mergeBacklogProjectUpdate(existing, { ...existing, notes: "new note" });
  assert.equal(same.firmness, "signed");
  assert.equal(same.reviewed, "2026-09-28");
  assert.equal(same.asset, "restart");
  const moved = mergeBacklogProjectUpdate(existing, { ...existing, capacityMW: 900 });
  assert.equal(moved.firmness, undefined, "a reviewed status cannot outlive the capacity it was checked against");
  assert.equal(moved.reviewed, undefined);
  const fresh = mergeBacklogProjectUpdate(undefined, deal({ id: "y" }));
  assert.equal(fresh.firmness, undefined);
});

test("an admin edit that omits a field keeps the stored value", () => {
  const existing = deal({ id: "x", notes: "curated note", sources: ["https://a.example/1"] });
  const merged = mergeBacklogProjectUpdate(existing, { ...existing, notes: undefined, sources: undefined });
  assert.equal(merged.notes, "curated note");
  assert.deepEqual(merged.sources, ["https://a.example/1"]);
  const reviewed = deal({ id: "z", firmness: "signed", ...REVIEW });
  const omitsBuyer = mergeBacklogProjectUpdate(reviewed, { ...reviewed, offtaker: undefined });
  assert.equal(omitsBuyer.offtaker, "Microsoft");
  assert.equal(omitsBuyer.firmness, "signed", "an omitted fact is not a changed fact");
});

// ─── The shipped registry ───────────────────────────────────────────────

const root = JSON.parse(readFileSync(join(process.cwd(), "server", "data", "interconnection-queue.json"), "utf-8"));
const projects = (root.projects ?? []) as DealProject[];
const byId = new Map(projects.map((p) => [p.id, p]));

test("every recorded status uses the vocabulary and names its evidence", () => {
  for (const p of projects) {
    if (p.firmness === undefined) continue;
    assert.ok((FIRMNESS_VALUES as readonly string[]).includes(p.firmness), `${p.id}: ${p.firmness}`);
    assert.ok(p.firmnessSource?.startsWith("https://"), `${p.id} needs the document that establishes its status`);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(p.reviewed ?? ""), `${p.id} needs a review date`);
    if (p.asset !== undefined) assert.ok((ASSET_VALUES as readonly string[]).includes(p.asset), `${p.id}: ${p.asset}`);
    for (const child of p.includes ?? []) assert.ok(byId.has(child), `${p.id} includes unknown ${child}`);
  }
});

test("the Oklo letters of intent are not a signed Amazon contract", () => {
  const oklo = projects.find((p) => /oklo/i.test(p.id) && p.capacityMW === 750);
  assert.ok(oklo, "the 750 MW Oklo row exists");
  assert.notEqual(oklo.firmness, "signed");
  assert.ok(!/amazon|aws/i.test(oklo.offtaker ?? ""), "Oklo's release names no buyer");
});

test("Hermes 2 is a 50 MW plant, separate from the 500 MW Kairos framework", () => {
  const hermes = byId.get("google-kairos-hermes2");
  assert.equal(hermes?.capacityMW, 50);
  const fleet = projects.find((p) => (p.includes ?? []).includes("google-kairos-hermes2"));
  assert.ok(fleet, "a framework row carries the 500 MW and includes the plant");
  assert.equal(fleet.capacityMW, 500);
  assert.notEqual(fleet.firmness, "signed");
});

test("the Microsoft-Brookfield agreement is a framework, not delivered generation", () => {
  assert.equal(byId.get("ms-brookfield-renewables")?.firmness, "framework");
});

test("the shipped registry yields well-formed agreement rows", () => {
  const m = computeDealMetrics(projects);
  assert.ok(m.rowCount >= 15, "at least 15 tracked agreements");
  assert.ok(m.signed.count > 0, "some agreements have been reviewed as signed");
  for (const r of m.rows) {
    assert.ok(r.offtaker.length > 0, `${r.id} has a buyer`);
    assert.ok(r.capacityMW === null || r.capacityMW > 0, `${r.id} has a positive or undisclosed capacity`);
    assert.ok(r.type !== "load", `${r.id} is not load`);
  }
  const signedRows = m.rows.filter((r) => r.firmness === "signed");
  const nested = new Set(signedRows.flatMap((r) => r.includes));
  const expected = signedRows
    .filter((r) => !nested.has(r.id))
    .reduce((s, r) => s + (r.capacityMW ?? 0), 0);
  assert.equal(m.signed.mw, expected, "the signed subtotal is the unique signed rows, nothing else");
  assert.equal(m.signedByBuyer.reduce((s, b) => s + b.mw, 0), m.signed.mw);
});

test("a row's first review is kept even when the same request corrects a fact", () => {
  const unreviewed = deal({ id: "first", capacityMW: 500 });
  const reviewed = mergeBacklogProjectUpdate(unreviewed, {
    ...unreviewed,
    capacityMW: 600,
    firmness: "signed",
    ...REVIEW,
  });
  assert.equal(reviewed.capacityMW, 600);
  assert.equal(reviewed.firmness, "signed", "it was dropped because no stored review existed to be older");
  assert.equal(reviewed.reviewed, REVIEW.reviewed);
});

test("a same-day correction is two requests: the fact change voids the review, then the review lands", () => {
  const existing = deal({ id: "same-day", firmness: "signed", ...REVIEW });
  const factFixed = mergeBacklogProjectUpdate(existing, { ...existing, capacityMW: 150 });
  assert.equal(factFixed.firmness, undefined);
  const rereviewed = mergeBacklogProjectUpdate(factFixed, { ...factFixed, firmness: "signed", ...REVIEW });
  assert.equal(rereviewed.firmness, "signed");
  assert.equal(rereviewed.capacityMW, 150);
});

const BODY = {
  projectName: "Plant A",
  sponsor: "Seller",
  capacityMW: 100,
  type: "nuclear",
  iso: "PJM",
  state: "PA",
  category: "ppa",
};

test("the admin request accepts an undisclosed size as null instead of forcing a number", () => {
  const r = parseBacklogProjectRequest({ ...BODY, capacityMW: null }, "a", false);
  assert.ok(r.ok);
  assert.equal(r.ok && r.project.capacityMW, null);
  for (const bad of ["100", -5, Number.NaN, undefined]) {
    const x = parseBacklogProjectRequest({ ...BODY, capacityMW: bad }, "a", false);
    assert.equal(x.ok, false, String(bad));
  }
});

test("an update that leaves out status and dcRelevant keeps the stored values", () => {
  const stored = deal({ id: "keep", status: "operational", dcRelevant: true });
  const r = parseBacklogProjectRequest({ ...BODY, notes: "notes-only edit" }, "keep", false);
  assert.ok(r.ok);
  assert.equal(r.ok && r.project.status, undefined);
  assert.equal(r.ok && r.project.dcRelevant, undefined);
  const merged = mergeBacklogProjectUpdate(stored, (r as { ok: true; project: DealProject }).project);
  assert.equal(merged.status, "operational", "it was reset to active");
  assert.equal(merged.dcRelevant, true, "it was reset to false");
});

test("a new row still starts active and not data-center relevant unless the request says so", () => {
  const r = parseBacklogProjectRequest(BODY, "new", true);
  assert.ok(r.ok);
  assert.equal(r.ok && r.project.status, "active");
  assert.equal(r.ok && r.project.dcRelevant, false);
});

test("the admin request rejects bad values with a reason instead of storing them", () => {
  const cases: Array<[Record<string, unknown>, RegExp]> = [
    [{ ...BODY, status: "paused" }, /status must be one of/],
    [{ ...BODY, type: "coal" }, /type must be one of/],
    [{ ...BODY, dcRelevant: "yes" }, /dcRelevant/],
    [{ ...BODY, firmness: "signed" }, /firmnessSource/],
    [{ ...BODY, firmness: "signed", firmnessSource: "https://a.example", reviewed: "Sept 28" }, /reviewed/],
    [{ ...BODY, sponsor: "" }, /sponsor/],
  ];
  for (const [body, message] of cases) {
    const r = parseBacklogProjectRequest(body, "x", true);
    assert.equal(r.ok, false);
    assert.match((r as { ok: false; error: string }).error, message);
  }
});
