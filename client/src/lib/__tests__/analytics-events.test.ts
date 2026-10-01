// The five analytics events carry only bounded, allowlisted context. These
// cases pin what may leave the browser and what never does.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ageBucket,
  campaignQuery,
  createDeduper,
  eventDedupeKey,
  eventPath,
  pagePath,
  recordBucket,
  sourceDomain,
  trafficAllowed,
} from "../analytics-events";

test("a page view keeps the route and allowlisted parameters, never the raw query string", () => {
  assert.equal(pagePath("/analyze", "?tab=scenario&token=abc123&email=a@b.co"), "/analyze?tab=scenario");
  assert.equal(pagePath("/my-grid", "?state=MD&utm_source=x"), "/my-grid?state=MD");
  assert.equal(pagePath("/my-grid", "?state=<script>"), "/my-grid");
  assert.equal(pagePath("/stock/NVDA"), "/stock/NVDA");
});

test("admin pages and malformed paths are not counted", () => {
  assert.equal(pagePath("/admin/social"), null);
  assert.equal(pagePath("/search?q=typed words"), null);
  assert.equal(pagePath("/a b"), null);
});

test("campaign tags are bounded; other parameters never reach the campaign field", () => {
  assert.equal(campaignQuery("?utm_source=newsletter&utm_medium=email&q=my+search"), "utm_source=newsletter&utm_medium=email");
  assert.equal(campaignQuery("?utm_source=a@b.co"), null);
  assert.equal(campaignQuery(""), null);
});

test("each event encodes only checked values", () => {
  assert.equal(eventPath({ name: "state_selected", state: "MD", surface: "chooser" }), "state_selected-MD-chooser");
  assert.equal(
    eventPath({ name: "state_context_ready", state: "MD", ratesAvailable: false, records: 0, dataAgeDays: null }),
    "state_context_ready-MD-rates_no-records_0-age_unknown",
  );
  assert.equal(
    eventPath({ name: "project_opened", entity: "stargate-abilene", state: "TX", status: "operational", surface: "map" }),
    "project_opened-stargate-abilene-TX-operational-map",
  );
  assert.equal(
    eventPath({ name: "source_opened", entity: "stargate-abilene", claim: "ratedPowerMW", url: "https://www.fool.com/earnings/x?utm=1" }),
    "source_opened-stargate-abilene-ratedpowermw-fool.com",
  );
});

test("a payload with any unchecked value is not sent at all", () => {
  assert.equal(eventPath({ name: "state_selected", state: "Maryland", surface: "chooser" }), null);
  assert.equal(eventPath({ name: "state_selected", state: "MD", surface: "popup" as never }), null);
  assert.equal(eventPath({ name: "project_opened", entity: "NVDA, CEG, my basket", state: "TX", status: "operational", surface: "map" }), null);
  assert.equal(eventPath({ name: "source_opened", entity: "x", claim: "ratedPowerMW", url: "javascript:alert(1)" }), null);
});

test("buckets keep counts and ages coarse", () => {
  assert.deepEqual([0, 2, 7, 40].map(recordBucket), ["0", "1_3", "4_10", "11plus"]);
  assert.deepEqual([null, 3, 20, 60, 400].map(ageBucket), ["unknown", "lt7d", "lt30d", "lt90d", "90dplus"]);
  assert.equal(sourceDomain("mailto:a@b.co"), null);
});

test("only the production host counts; local, preview and automated browsers do not", () => {
  const allowedHosts = ["gridtilt.com", "www.gridtilt.com"];
  assert.equal(trafficAllowed({ hostname: "gridtilt.com", allowedHosts }), true);
  assert.equal(trafficAllowed({ hostname: "localhost", allowedHosts }), false);
  assert.equal(trafficAllowed({ hostname: "gridtilt.replit.app", allowedHosts }), false);
  assert.equal(trafficAllowed({ hostname: "gridtilt.com", allowedHosts, webdriver: true }), false);
});

test("a repeat render in the same view is not another event", () => {
  const d = createDeduper();
  assert.equal(d.first("state_context_ready-MD"), true);
  assert.equal(d.first("state_context_ready-MD"), false);
  d.reset();
  assert.equal(d.first("state_context_ready-MD"), true);
});

test("state_context_ready counts once per state, even when a refetch moves a bucket", () => {
  const a = { name: "state_context_ready" as const, state: "MD", ratesAvailable: true, records: 3, dataAgeDays: 40 };
  const b = { ...a, records: 4, dataAgeDays: 100 };
  assert.notEqual(eventPath(a), eventPath(b), "the recorded name still carries the buckets");
  assert.equal(eventDedupeKey(a, eventPath(a)!), eventDedupeKey(b, eventPath(b)!));
  assert.notEqual(eventDedupeKey(a, eventPath(a)!), eventDedupeKey({ ...a, state: "VA" }, eventPath({ ...a, state: "VA" })!));
  const sel = { name: "state_selected" as const, state: "MD", surface: "chooser" as const };
  assert.equal(eventDedupeKey(sel, eventPath(sel)!), eventPath(sel));
});
