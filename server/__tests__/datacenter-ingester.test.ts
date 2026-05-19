import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.NODE_ENV = "test";

const {
  parsePowerMW,
  detectCompany,
  parseFeedItem,
  dedupeAgainst,
  isAdminDuplicate,
  runDatacenterIngestion,
  approvePending,
  rejectPending,
  loadPending,
} = await import("../datacenter-ingester");

test("parsePowerMW parses MW, GW, and megawatt-suffixed numbers", () => {
  assert.equal(parsePowerMW("New 600 MW campus"), 600);
  assert.equal(parsePowerMW("a 1.2 GW facility"), 1200);
  assert.equal(parsePowerMW("1,200 MW data center"), 1200);
  assert.equal(parsePowerMW("750-megawatt site"), 750);
  assert.equal(parsePowerMW("no power mention"), null);
  assert.equal(parsePowerMW("100 MW small site"), 100);
  // Regression: unformatted 4+ digit MW values
  assert.equal(parsePowerMW("1200 MW announcement"), 1200);
  assert.equal(parsePowerMW("25000 MW total fleet"), 25000);
  assert.equal(parsePowerMW("3000-megawatt cluster"), 3000);
});

test("detectCompany recognizes hyperscaler aliases", () => {
  assert.equal(detectCompany("Microsoft announces new Azure region"), "Microsoft");
  assert.equal(detectCompany("aws expands footprint"), "Amazon");
  assert.equal(detectCompany("nothing relevant"), null);
});

test("parseFeedItem rejects sub-400 MW and missing fields", () => {
  const cities = new Map<string, { lat: number; lng: number; state: string }>();
  assert.equal(parseFeedItem("Microsoft 200 MW data center in Texas", "", cities), null);
  assert.equal(parseFeedItem("Some article about utilities", "", cities), null);
  const ok = parseFeedItem(
    "Microsoft announces 600 MW data center in Texas",
    "A new hyperscale facility coming online",
    cities,
  );
  assert.ok(ok, "expected match");
  assert.equal(ok!.company, "Microsoft");
  assert.equal(ok!.state, "TX");
  assert.equal(ok!.powerMW, 600);
});

test("parseFeedItem prefers known city coords when available (not approx)", () => {
  const cities = new Map<string, { lat: number; lng: number; state: string }>([
    ["phoenix", { lat: 33.4484, lng: -112.074, state: "AZ" }],
  ]);
  const got = parseFeedItem(
    "Google plans 800 MW data center campus in Phoenix",
    "",
    cities,
  );
  assert.ok(got);
  assert.equal(got!.approxCoords, false);
  assert.equal(got!.state, "AZ");
});

test("isAdminDuplicate boundary: <0.01 deg dup, >=0.01 deg fresh", () => {
  const existing = { name: "A", company: "Microsoft", lat: 33.4484, lng: -112.0740 };
  // 0.009 delta both axes - duplicate
  assert.equal(
    isAdminDuplicate({ name: "Different", company: "Microsoft", lat: 33.4574, lng: -112.0830 }, existing),
    true,
  );
  // 0.011 delta on lat - not a duplicate
  assert.equal(
    isAdminDuplicate({ name: "Different", company: "Microsoft", lat: 33.4594, lng: -112.0740 }, existing),
    false,
  );
  // Same coords but different company - not a duplicate (matches admin rule)
  assert.equal(
    isAdminDuplicate({ name: "Different", company: "Google", lat: 33.4484, lng: -112.0740 }, existing),
    false,
  );
  // Same name (case-insensitive) - duplicate regardless of coords
  assert.equal(
    isAdminDuplicate({ name: "a", company: "Google", lat: 0, lng: 0 }, existing),
    true,
  );
});

test("dedupeAgainst catches matching coords/company", () => {
  const approved = [
    { id: 1, name: "Azure Phoenix", company: "Microsoft", city: "Phoenix", state: "AZ", lat: 33.4484, lng: -112.074, powerMW: 600, status: "construction" as const, annualMWh: 0, gridOperator: "APS", openDate: "2026" },
  ];
  const dup = dedupeAgainst(
    { name: "Different Name", company: "Microsoft", lat: 33.4484, lng: -112.074 },
    approved,
    [],
  );
  assert.equal(dup, true);

  const fresh = dedupeAgainst(
    { name: "New Site", company: "Google", lat: 40.0, lng: -75.0 },
    approved,
    [],
  );
  assert.equal(fresh, false);
});

test("runDatacenterIngestion writes pending entries and dedupes against approved", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dc-ingester-"));
  const approvedPath = join(dir, "datacenters.json");
  const pendingPath = join(dir, "pending.json");
  writeFileSync(approvedPath, JSON.stringify([
    { id: 1, name: "Existing", company: "Meta", city: "Eagle Mountain", state: "UT", lat: 40.3, lng: -112.0, powerMW: 500, status: "operational", annualMWh: 0, gridOperator: "x", openDate: "2024" },
  ]));
  writeFileSync(pendingPath, "[]");

  const fakeFetcher = async (_url: string) => ({
    items: [
      { title: "Microsoft announces 800 MW data center in Phoenix, AZ", contentSnippet: "hyperscale campus", link: "https://example.com/a" },
      { title: "Random utility filing about rates", contentSnippet: "", link: "https://example.com/b" },
      { title: "Meta 600 MW data center in Eagle Mountain, UT", contentSnippet: "expansion", link: "https://example.com/c" },
      { title: "Google 100 MW data center in Dallas, TX", contentSnippet: "small", link: "https://example.com/d" },
    ],
  });

  const result = await runDatacenterIngestion(
    { approvedPath, pendingPath },
    fakeFetcher,
  );

  assert.ok(result.matched >= 1, `expected matches, got ${result.matched}`);
  assert.ok(result.added >= 1, `expected at least one added, got ${result.added}`);
  const written = JSON.parse(readFileSync(pendingPath, "utf-8"));
  assert.ok(Array.isArray(written));
  const phx = written.find((d: any) => d.company === "Microsoft");
  assert.ok(phx, "expected Microsoft entry");
  assert.equal(phx.status, "announced");
  assert.equal(phx.sourceUrl, "https://example.com/a");
  assert.ok(phx.powerMW >= 400);

  // No Meta dup (already approved)
  assert.equal(written.find((d: any) => d.company === "Meta"), undefined);
  // No Google (under threshold)
  assert.equal(written.find((d: any) => d.company === "Google"), undefined);
});

test("approvePending moves entry to approved and removes from pending", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dc-approve-"));
  const approvedPath = join(dir, "datacenters.json");
  const pendingPath = join(dir, "pending.json");
  writeFileSync(approvedPath, "[]");
  writeFileSync(pendingPath, JSON.stringify([
    { id: 5, name: "Test DC", company: "Microsoft", city: "Phoenix", state: "AZ", lat: 33.4, lng: -112.0, powerMW: 800, status: "announced", annualMWh: 1000, gridOperator: "x", openDate: "TBD", sourceUrl: "u", sourceTitle: "t", sourceName: "DCD", discoveredAt: "now", approxCoords: false },
  ]));

  const result = approvePending(5, { approvedPath, pendingPath });
  assert.equal(result.ok, true);
  const approved = JSON.parse(readFileSync(approvedPath, "utf-8"));
  assert.equal(approved.length, 1);
  assert.equal(approved[0].company, "Microsoft");
  assert.equal(loadPending({ approvedPath, pendingPath }).length, 0);

  const notFound = approvePending(999, { approvedPath, pendingPath });
  assert.equal(notFound.ok, false);
});

test("rejectPending removes entry", () => {
  const dir = mkdtempSync(join(tmpdir(), "dc-reject-"));
  const approvedPath = join(dir, "datacenters.json");
  const pendingPath = join(dir, "pending.json");
  writeFileSync(approvedPath, "[]");
  writeFileSync(pendingPath, JSON.stringify([
    { id: 7, name: "X", company: "Y", city: "Z", state: "TX", lat: 1, lng: 1, powerMW: 500, status: "announced", annualMWh: 0, gridOperator: "x", openDate: "TBD", sourceUrl: "", sourceTitle: "", sourceName: "", discoveredAt: "", approxCoords: false },
  ]));
  assert.equal(rejectPending(7, { approvedPath, pendingPath }), true);
  assert.equal(loadPending({ approvedPath, pendingPath }).length, 0);
  assert.equal(rejectPending(999, { approvedPath, pendingPath }), false);
});
