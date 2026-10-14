// Page views and the analytics events carry only bounded, allowlisted context. These
// cases pin what may leave the browser and what never does.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  campaignQuery,
  createDeduper,
  eventPath,
  pagePath,
  sourceDomain,
  trafficAllowed,
} from "../analytics-events";

test("a page view keeps the route and allowlisted parameters, never the raw query string", () => {
  assert.equal(pagePath("/analyze", "?tab=scenario&token=abc123&email=a@b.co"), "/analyze?tab=scenario");
  assert.equal(pagePath("/power-map", "?tab=deals&utm_source=x"), "/power-map?tab=deals");
  assert.equal(pagePath("/power-map", "?tab=<script>&state=MD"), "/power-map");
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
  assert.equal(eventPath({ name: "project_opened", entity: "stargate-abilene", state: "Texas", status: "operational", surface: "map" }), null);
  assert.equal(eventPath({ name: "project_opened", entity: "stargate-abilene", state: "TX", status: "operational", surface: "popup" as never }), null);
  assert.equal(eventPath({ name: "project_opened", entity: "NVDA, CEG, my basket", state: "TX", status: "operational", surface: "map" }), null);
  assert.equal(eventPath({ name: "source_opened", entity: "x", claim: "ratedPowerMW", url: "javascript:alert(1)" }), null);
});

test("a source link that is not http(s) has no domain", () => {
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
  const name = "project_opened-stargate-abilene-TX-operational-map";
  assert.equal(d.first(name), true);
  assert.equal(d.first(name), false);
  d.reset();
  assert.equal(d.first(name), true);
});
