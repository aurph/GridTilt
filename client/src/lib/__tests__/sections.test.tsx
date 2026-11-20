/**
 * The site map: three sections, their chips, and where every old address
 * lands. Old routes are permalinks someone may have bookmarked or linked,
 * and both the chip reader and the view reader fall back silently on an
 * unknown id, so a renamed chip would keep answering 200 on the wrong view.
 * These tests fail first.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { SectionLinks } from "../../components/section-links";
import { FEATURE_ICONS, FeatureTabs } from "../../components/feature-tabs";
import {
  LEGACY_ROUTES,
  SECTIONS,
  chipFromSearch,
  chipHref,
  legacyRedirect,
  metaAddress,
  sectionById,
  sectionForPath,
  withSectionParams,
} from "../sections";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf-8");

describe("the three sections", () => {
  it("are Grid, Compute, Markets, in that order, at these addresses", () => {
    assert.deepEqual(
      SECTIONS.map((s) => [s.label, s.href]),
      [
        ["Grid", "/grid"],
        ["Compute", "/compute"],
        ["Markets", "/markets"],
      ],
    );
  });

  it("hold these features as chips, default first", () => {
    assert.deepEqual(
      Object.fromEntries(SECTIONS.map((s) => [s.id, s.chips.map((c) => `${c.id}:${c.label}`)])),
      {
        grid: ["map:Map", "queue:Queue", "deals:Deals", "live:Live grid", "timeline:Timeline"],
        compute: ["clusters:Clusters", "supply-chain:Supply Chain", "gpu-prices:GPU Prices"],
        markets: ["overview:Overview", "equities:Equities", "analyze:Analyze", "catalysts:Catalysts"],
      },
    );
  });

  it("give the default chip the bare address and every other chip ?tab=", () => {
    assert.equal(chipHref("grid", "map"), "/grid");
    assert.equal(chipHref("grid", "queue"), "/grid?tab=queue");
    assert.equal(chipHref("markets", "analyze", "scenario"), "/markets?tab=analyze&sub=scenario");
    assert.equal(chipFromSearch(sectionById("grid"), "?tab=deals&deal=x"), "deals");
    assert.equal(chipFromSearch(sectionById("grid"), "?tab=nope"), "map");
    assert.equal(chipFromSearch(sectionById("compute"), ""), "clusters");
  });

  it("render in the top bar with those labels and addresses", () => {
    const html = renderToStaticMarkup(
      <Router ssrPath="/grid">
        <SectionLinks active={sectionForPath("/grid")} />
      </Router>,
    );
    const links = Array.from(html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)/g)).map((m) => [m[2], m[1]]);
    assert.deepEqual(links, [
      ["Grid", "/grid"],
      ["Compute", "/compute"],
      ["Markets", "/markets"],
    ]);
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
    assert.match(html, /aria-current="page"[^>]*data-testid="top-nav-grid"|data-testid="top-nav-grid"[^>]*aria-current="page"/);
  });

  it("file a page's title under its chip, whatever the feature's own filters say", () => {
    assert.equal(metaAddress("/grid", ""), "/grid");
    assert.equal(metaAddress("/grid", "?tab=timeline&range=90d&type=deal"), "/grid?tab=timeline");
    assert.equal(metaAddress("/markets", "tab=analyze&sub=scenario"), "/markets?tab=analyze");
    assert.equal(metaAddress("/grid", "?tab=nope"), "/grid");
    assert.equal(metaAddress("/state/maryland", ""), "/state/maryland");
  });

  it("light up for the pages reached from them", () => {
    // State pages left the top bar with the States section (2026-11); they are reached from Grid.
    assert.equal(sectionForPath("/state/maryland"), "grid");
    assert.equal(sectionForPath("/states"), null, "the old index is a redirect, not a page");
    assert.equal(sectionForPath("/compute-frontier/some-cluster"), "compute");
    assert.equal(sectionForPath("/stock/CEG"), "markets");
    assert.equal(sectionForPath("/region/pjm"), "grid");
    assert.equal(sectionForPath("/blog"), null);
  });

  it("have a feature behind every chip", () => {
    const src = read("client", "src", "pages", "section-page.tsx");
    for (const s of SECTIONS) {
      for (const c of s.chips) {
        const key = /^[a-z]+$/.test(c.id) ? `${c.id}: lazy(` : `"${c.id}": lazy(`;
        assert.ok(src.includes(key), `section-page.tsx has no feature for ${s.id}/${c.id}`);
      }
    }
  });
});

describe("old addresses", () => {
  const EXPECTED: Record<string, string> = {
    "/overview": "/markets",
    "/stack": "/markets?tab=equities",
    "/analyze": "/markets?tab=analyze",
    "/trade": "/markets?tab=analyze&sub=scenario",
    "/portfolio": "/markets?tab=analyze&sub=portfolio",
    "/catalysts": "/markets?tab=catalysts",
    "/power-map": "/grid",
    "/power-deals": "/grid?tab=deals",
    "/queue": "/grid?tab=queue",
    "/my-grid": "/grid",
    "/timeline": "/grid?tab=timeline",
    "/compute-frontier": "/compute",
    "/supply-chain": "/compute?tab=supply-chain",
    "/neocloud-intel": "/compute?tab=gpu-prices",
    "/gpu-economics": "/compute?tab=gpu-prices&sub=economics",
    "/brief": "/blog",
    // The States index was retired 2026-11-18; the state pages keep their own addresses.
    "/states": "/grid",
  };

  it("each land on the right section and chip", () => {
    assert.deepEqual(Object.keys(LEGACY_ROUTES).sort(), Object.keys(EXPECTED).sort());
    for (const [from, to] of Object.entries(EXPECTED)) assert.equal(legacyRedirect(from), to, from);
  });

  it("carry an old tab, a view, a record and a campaign tag to the new address", () => {
    assert.equal(legacyRedirect("/power-map", "?tab=deals&deal=abc"), "/grid?tab=deals&deal=abc");
    assert.equal(legacyRedirect("/power-map", "?tab=queue"), "/grid?tab=queue");
    assert.equal(legacyRedirect("/power-map", "?view=clusters"), "/grid?view=clusters");
    assert.equal(legacyRedirect("/analyze", "?tab=scenario"), "/markets?tab=analyze&sub=scenario");
    assert.equal(legacyRedirect("/neocloud-intel", "?tab=economics"), "/compute?tab=gpu-prices&sub=economics");
    assert.equal(legacyRedirect("/neocloud-intel", "?tab=frontier&family=coding"), "/compute?tab=gpu-prices&sub=frontier&family=coding");
    assert.equal(legacyRedirect("/timeline", "?record=deal:x"), "/grid?tab=timeline&record=deal%3Ax");
    assert.equal(legacyRedirect("/stack", "?view=flow"), "/markets?tab=equities&view=flow");
    assert.equal(legacyRedirect("/trade", "?utm_source=newsletter"), "/markets?tab=analyze&sub=scenario&utm_source=newsletter");
    assert.equal(legacyRedirect("/power-deals", "?tab=queue"), "/grid?tab=deals", "a fixed alias keeps its own target");
    assert.equal(legacyRedirect("/brief", "?utm_source=x"), "/blog?utm_source=x");
    assert.equal(legacyRedirect("/states", "?utm_source=brief"), "/grid?utm_source=brief");
  });

  it("are not invented for addresses that never were pages", () => {
    assert.equal(legacyRedirect("/grid"), null);
    assert.equal(legacyRedirect("/compute-frontier/methodology"), null);
    assert.equal(legacyRedirect("/state/maryland"), null);
  });

  it("name chips and views that still exist", () => {
    const idsFromBlock = (file: string, name: string) => {
      const src = read("client", "src", "pages", file);
      const start = src.indexOf(`const ${name}`);
      assert.ok(start >= 0, `could not find ${name}`);
      const block = src.slice(src.indexOf("[", start), src.indexOf("];", start));
      return Array.from(block.matchAll(/id:\s*"([^"]+)"/g)).map((m) => m[1]);
    };
    const views: Record<string, string[]> = {
      analyze: idsFromBlock("Analyze.tsx", "ANALYZE_TABS"),
      "gpu-prices": idsFromBlock("neocloud-intel.tsx", "GPU_TABS"),
    };
    for (const [from, route] of Object.entries(LEGACY_ROUTES)) {
      if (!route.section) continue;
      const chips = sectionById(route.section).chips.map((c) => c.id);
      assert.ok(chips.includes(route.chip as string), `${from} names chip ${route.chip}`);
      for (const chip of Object.values(route.tabToChip ?? {})) assert.ok(chips.includes(chip), `${from} maps to chip ${chip}`);
      const subs = [...(route.sub ? [route.sub] : []), ...(route.tabToSub ?? [])];
      for (const sub of subs) {
        assert.ok(views[route.chip as string]?.includes(sub), `${from} names view ${sub}, which ${route.chip} does not declare`);
      }
    }
  });

  it("stay intact when a feature rewrites its own query", () => {
    assert.equal(withSectionParams("?tab=timeline&range=30d", "?range=90d&type=deal"), "?tab=timeline&range=90d&type=deal");
    assert.equal(withSectionParams("?tab=analyze&sub=portfolio", "tickers=CEG%2CVST"), "?tab=analyze&sub=portfolio&tickers=CEG%2CVST");
    assert.equal(withSectionParams("", ""), "");
    assert.equal(withSectionParams("?view=clusters", ""), "", "a feature's own old params are not kept");
  });
});

describe("feature tabs", () => {
  const tabsFor = (id: "grid" | "compute" | "markets") =>
    sectionById(id).chips.map((c) => ({ id: c.id, label: c.label, blurb: c.blurb, href: chipHref(id, c.id) }));
  const render = (id: "grid" | "compute" | "markets", active: string) =>
    renderToStaticMarkup(
      <Router ssrPath={`/${id}`}>
        <FeatureTabs tabs={tabsFor(id)} active={active} label={`${id} features`} />
      </Router>,
    );

  it("say what each feature holds in one short line, with no figures", () => {
    for (const s of SECTIONS) {
      for (const c of s.chips) {
        assert.ok(typeof c.blurb === "string" && c.blurb.length >= 12, `${s.id}/${c.id} has a line`);
        // 30 characters is what fits beside the icon when five tabs share a laptop screen.
        assert.ok(c.blurb.length <= 30, `${s.id}/${c.id}: "${c.blurb}" is ${c.blurb.length} characters`);
        // A figure in the navigation would need a date and a source of its own.
        assert.doesNotMatch(c.blurb, /\d/, `${s.id}/${c.id} carries a figure`);
        assert.doesNotMatch(c.blurb, /[\u2013\u2014]|\.$/, `${s.id}/${c.id}: plain, no dash, no full stop`);
        assert.notEqual(c.blurb.toLowerCase(), c.label.toLowerCase(), `${s.id}/${c.id} only repeats its name`);
      }
    }
  });

  it("show every feature of a section at once, each a link with its own address", () => {
    for (const s of SECTIONS) {
      const html = render(s.id, s.chips[0].id);
      assert.equal((html.match(/role="tab"/g) ?? []).length, s.chips.length, `${s.id}: one tab per feature`);
      assert.doesNotMatch(html, /more</, `${s.id}: nothing is folded into a menu`);
      for (const c of s.chips) {
        assert.ok(html.includes(`data-testid="feature-tab-${c.id}"`), `${s.id}/${c.id}`);
        assert.ok(html.includes(`href="${chipHref(s.id, c.id)}"`), `${s.id}/${c.id} has its own address`);
        assert.ok(html.includes(c.label), `${s.id}/${c.id} shows its name`);
        assert.ok(html.includes(c.blurb), `${s.id}/${c.id} shows its line`);
      }
    }
  });

  it("mark the open feature and keep one tab stop", () => {
    const html = render("grid", "live");
    const selected = html.match(/<a [^>]*aria-selected="true"[^>]*>/g) ?? [];
    assert.equal(selected.length, 1);
    assert.match(selected[0], /data-testid="feature-tab-live"/);
    assert.match(selected[0], /tabindex="0"/);
    assert.equal((html.match(/tabindex="0"/g) ?? []).length, 1, "arrow keys move between tabs, Tab leaves the row");
    assert.equal((html.match(/tabindex="-1"/g) ?? []).length, 4);
  });

  it("draw an icon for every feature", () => {
    for (const s of SECTIONS) {
      for (const c of s.chips) assert.ok(FEATURE_ICONS[c.id], `${s.id}/${c.id} has no icon`);
      const html = render(s.id, s.chips[0].id);
      assert.equal((html.match(/<svg/g) ?? []).length, s.chips.length, `${s.id}: one icon per tab`);
    }
  });
});
