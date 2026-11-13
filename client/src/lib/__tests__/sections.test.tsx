/**
 * The site map: four sections, their chips, and where every old address
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
import { SectionChips } from "../../components/section-chips";
import {
  LEGACY_ROUTES,
  SECTIONS,
  chipFromSearch,
  chipHref,
  fitCount,
  legacyRedirect,
  metaAddress,
  sectionById,
  sectionForPath,
  splitChips,
  withSectionParams,
} from "../sections";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf-8");

describe("the four sections", () => {
  it("are States, Grid, Buildout, Markets, in that order, at these addresses", () => {
    assert.deepEqual(
      SECTIONS.map((s) => [s.label, s.href]),
      [
        ["States", "/states"],
        ["Grid", "/grid"],
        ["Buildout", "/buildout"],
        ["Markets", "/markets"],
      ],
    );
  });

  it("hold these features as chips, default first", () => {
    assert.deepEqual(
      Object.fromEntries(SECTIONS.map((s) => [s.id, s.chips.map((c) => `${c.id}:${c.label}`)])),
      {
        // The States chips are the published state pages, read from the registry.
        states: [],
        grid: ["map:Map", "queue:Queue", "deals:Deals", "live:Live grid", "timeline:Timeline"],
        buildout: ["compute:Compute", "supply-chain:Supply Chain", "gpu-prices:GPU Prices"],
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
    assert.equal(chipFromSearch(sectionById("buildout"), ""), "compute");
  });

  it("render in the top bar with those labels and addresses", () => {
    const html = renderToStaticMarkup(
      <Router ssrPath="/grid">
        <SectionLinks active={sectionForPath("/grid")} />
      </Router>,
    );
    const links = Array.from(html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)/g)).map((m) => [m[2], m[1]]);
    assert.deepEqual(links, [
      ["States", "/states"],
      ["Grid", "/grid"],
      ["Buildout", "/buildout"],
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
    assert.equal(metaAddress("/states", "?x=1"), "/states");
    assert.equal(metaAddress("/state/maryland", ""), "/state/maryland");
  });

  it("light up for the pages reached from them", () => {
    assert.equal(sectionForPath("/state/maryland"), "states");
    assert.equal(sectionForPath("/compute-frontier/some-cluster"), "buildout");
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
    "/compute-frontier": "/buildout",
    "/supply-chain": "/buildout?tab=supply-chain",
    "/neocloud-intel": "/buildout?tab=gpu-prices",
    "/gpu-economics": "/buildout?tab=gpu-prices&sub=economics",
    "/brief": "/blog",
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
    assert.equal(legacyRedirect("/neocloud-intel", "?tab=economics"), "/buildout?tab=gpu-prices&sub=economics");
    assert.equal(legacyRedirect("/neocloud-intel", "?tab=frontier&family=coding"), "/buildout?tab=gpu-prices&sub=frontier&family=coding");
    assert.equal(legacyRedirect("/timeline", "?record=deal:x"), "/grid?tab=timeline&record=deal%3Ax");
    assert.equal(legacyRedirect("/stack", "?view=flow"), "/markets?tab=equities&view=flow");
    assert.equal(legacyRedirect("/trade", "?utm_source=newsletter"), "/markets?tab=analyze&sub=scenario&utm_source=newsletter");
    assert.equal(legacyRedirect("/power-deals", "?tab=queue"), "/grid?tab=deals", "a fixed alias keeps its own target");
    assert.equal(legacyRedirect("/brief", "?utm_source=x"), "/blog?utm_source=x");
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

describe("chip overflow", () => {
  // Measured chip widths for the Grid row, in px, with an 8px gap.
  const GRID = [62, 76, 70, 92, 92];
  const MORE = 96;

  it("shows every chip on a wide row", () => {
    assert.equal(fitCount(GRID, 1200, MORE, 8), 5);
  });

  it("keeps room for the +N more chip on a phone row", () => {
    // 390px screen, 16px gutters, a 90px scope pill and its gap.
    const available = 390 - 32 - 90 - 8;
    const n = fitCount(GRID, available, MORE, 8);
    assert.equal(n, 2);
    const used = GRID.slice(0, n).reduce((a, w) => a + w, 0) + 8 * (n - 1) + 8 + MORE;
    assert.ok(used <= available, "the row with its +N more chip fits");
  });

  it("always shows at least one chip", () => {
    assert.equal(fitCount(GRID, 40, MORE, 8), 1);
    assert.equal(fitCount([], 40, MORE, 8), 0);
  });

  it("keeps the active chip on the row", () => {
    const chips = sectionById("grid").chips;
    const first = splitChips(chips, "map", 2);
    assert.deepEqual(first.visible.map((c) => c.id), ["map", "queue"]);
    assert.deepEqual(first.overflow.map((c) => c.id), ["deals", "live", "timeline"]);
    const deep = splitChips(chips, "timeline", 2);
    assert.deepEqual(deep.visible.map((c) => c.id), ["map", "timeline"]);
    assert.deepEqual(deep.overflow.map((c) => c.id), ["queue", "deals", "live"]);
    assert.deepEqual(splitChips(chips, "map", 9).overflow, []);
  });

  it("renders the overflow as a +N more chip with the rest as links", () => {
    const section = sectionById("grid");
    const chips = section.chips.map((c) => ({ id: c.id, label: c.label, href: chipHref("grid", c.id) }));
    const html = renderToStaticMarkup(
      <Router ssrPath="/grid">
        <SectionChips chips={chips} active="live" label="Grid features" visibleCount={2} />
      </Router>,
    );
    assert.match(html, /\+3 more/);
    assert.match(html, /data-testid="chip-map"/);
    assert.match(html, /aria-selected="true"[^>]*data-testid="chip-live"|data-testid="chip-live"[^>]*aria-selected="true"/);
    for (const id of ["queue", "deals", "timeline"]) {
      assert.match(html, new RegExp(`data-testid="chip-more-${id}"`));
      assert.doesNotMatch(html, new RegExp(`data-testid="chip-${id}"`));
    }
    assert.match(html, /href="\/grid\?tab=timeline"/, "every chip is a link with its own address");
  });

  it("renders every chip and no +N more when all fit", () => {
    const chips = sectionById("markets").chips.map((c) => ({ id: c.id, label: c.label, href: chipHref("markets", c.id) }));
    const html = renderToStaticMarkup(
      <Router ssrPath="/markets">
        <SectionChips chips={chips} active="overview" label="Markets features" visibleCount={4} />
      </Router>,
    );
    assert.doesNotMatch(html, /more</);
    assert.equal((html.match(/role="tab"/g) ?? []).length, 4);
  });
});
