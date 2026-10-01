// The Maryland pilot page: one composed record feeds the JSON, the HTML and
// the metadata, its grid facts are My Grid's, its documents are dated and
// linked, and nothing in it claims coverage the records do not have.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  composeStatePage,
  injectStateHtml,
  longDate,
  renderStateHtml,
  stateDescription,
  statePageSlugs,
  stateTitle,
  validateStatePages,
  type CuratedStates,
  type StatePageInput,
} from "../state-page";
import { areaForState as clientAreaForState, cushion as clientCushion } from "../../client/src/lib/reserve-margins";
import { STATE_GRID } from "../../client/src/data/state-grid";
import { buildSitemap, getPageMeta, robotsAllows } from "../seo";
import { pageResponse } from "../static";
import { loadStatePage, loadStatePageSlugs, statePagePrerender } from "../state-page";

const data = (file: string) => JSON.parse(readFileSync(join(process.cwd(), "server", "data", file), "utf-8"));
const shipped = data("state-pages.json") as CuratedStates;

const input = (over: Partial<StatePageInput> = {}): StatePageInput => ({
  curated: shipped,
  clusters: data("clusters.json").clusters,
  facilities: data("datacenters.json"),
  today: "2026-10-01",
  ...over,
});

describe("state pages: curated file", () => {
  it("the shipped file is valid and publishes only Maryland", () => {
    assert.deepEqual(validateStatePages(shipped), []);
    assert.deepEqual(statePageSlugs(shipped).map((s) => s.slug), ["maryland"]);
  });

  it("rejects unknown states, duplicate slugs, undated or unlinked rows, and rows dated after the review", () => {
    const md = shipped.states[0];
    assert.match(validateStatePages({ states: [{ ...md, code: "ZZ" }] }).join(), /not a state/);
    assert.match(validateStatePages({ states: [md, { ...md, code: "VA" }] }).join(), /duplicate slug/);
    assert.match(validateStatePages({ states: [{ ...md, documents: [{ ...md.documents[0], url: "http://example.com" }] }] }).join(), /https/);
    assert.match(validateStatePages({ states: [{ ...md, documents: [{ ...md.documents[0], date: "2026-10-02" }] }] }).join(), /after the review/);
    assert.match(validateStatePages({ states: [{ ...md, nextDates: [{ ...md.nextDates[0], date: "soon" }] }] }).join(), /YYYY-MM-DD/);
    assert.match(validateStatePages({ states: [{ ...md, billSource: { source: "", url: "x" } }] }).join(), /billSource/);
  });
});

describe("state pages: Maryland", () => {
  const md = composeStatePage("maryland", input())!;

  it("states My Grid's operator and NERC area facts exactly", () => {
    const area = clientAreaForState("MD")!;
    assert.equal(md.operatorLabel, STATE_GRID.MD.operatorLabel);
    assert.equal(md.nerc?.key, area.key);
    assert.equal(md.nerc?.margin, area.margin);
    assert.equal(md.nerc?.reference, area.reference);
    assert.equal(md.nerc?.cushion, clientCushion(area));
    assert.equal(md.nerc?.risk, area.risk);
    assert.equal(md.canonical, "https://gridtilt.com/state/maryland");
    assert.equal(md.myGridUrl, "https://gridtilt.com/my-grid?state=MD");
  });

  it("lists the Compute Frontier records in Maryland with their estimate flags, and the registry count apart", () => {
    assert.deepEqual(
      md.projects.map((p) => [p.id, p.plannedMW, p.plannedEstimated]),
      [
        ["aligned-iad-quantum-frederick-md", 264, true],
        ["rowan-bauxite-frederick-md", 231, true],
      ],
    );
    assert.equal(md.registry.floorMW, 400);
    assert.equal(md.registry.tracked, 0, "no campus of 400 MW or more in the registry for Maryland");
  });

  it("orders documents newest first and drops next dates that have passed", () => {
    const dates = md.documents.map((d) => d.date);
    assert.deepEqual(dates, [...dates].sort().reverse());
    const later = composeStatePage("maryland", input({ today: "2027-05-12" }))!;
    assert.deepEqual(later.nextDates.map((d) => d.date), ["2027-07-01"]);
  });

  it("answers null for a slug that is not published", () => {
    assert.equal(composeStatePage("virginia", input()), null);
    assert.equal(composeStatePage("", input()), null);
  });

  it("writes the same facts into the HTML, escaped, with the coverage and bill limits", () => {
    const html = renderStateHtml(md);
    assert.match(html, /<h1>Maryland's grid<\/h1>/);
    assert.ok(html.includes(`anticipated reserve margin ${md.nerc!.margin.toFixed(1)}%`));
    assert.ok(html.includes("Order No. 92606"));
    assert.ok(html.includes("July 1, 2027"));
    assert.ok(html.includes("a project missing here is not evidence that none exists"));
    assert.ok(html.includes("nothing on this page shows how much any project or power line added to a household's bill"));
    for (const p of md.projects) assert.ok(html.includes(p.url), p.id);
    const hostile = renderStateHtml({ ...md, documents: [{ ...md.documents[0], title: `<script>alert(1)</script>`, url: `https://x.test/"onmouseover="y` }] });
    assert.ok(!hostile.includes("<script>alert"), "text is escaped");
    assert.ok(!hostile.includes(`"onmouseover`), "attributes are escaped");
  });

  it("puts the HTML into an empty root only", () => {
    const shell = `<body><div id="root"></div></body>`;
    assert.equal(injectStateHtml(shell, "<main>x</main>"), `<body><div id="root"><main>x</main></div></body>`);
    assert.equal(injectStateHtml("<body></body>", "<main>x</main>"), "<body></body>");
  });

  it("titles and describes the page from the record", () => {
    assert.equal(stateTitle(md), "Maryland's grid: operator, reliability and data center decisions | GridTilt");
    assert.ok(stateDescription(md).includes("summer 2026 reserve margin for PJM: 29.7%, with a reference level of 18.6%"));
    assert.ok(stateDescription(md).length <= 300);
    assert.equal(longDate("2026-09-14"), "September 14, 2026");
  });
});

describe("state pages: one canonical address, wired through", () => {
  const SHELL = '<html><head><title>GridTilt</title></head><body><div id="root"></div></body></html>';

  it("/state/maryland is the indexable page; the My Grid tool keeps its own canonical", () => {
    const meta = getPageMeta("/state/maryland");
    assert.equal(meta.canonical, "https://gridtilt.com/state/maryland");
    assert.equal(meta.status, undefined);
    assert.equal(meta.ogImage, "https://gridtilt.com/api/og?template=state_fact&state=MD");
    assert.equal(meta.title, "Maryland's grid: operator, reliability and data center decisions | GridTilt");
    assert.equal(getPageMeta("/my-grid").canonical, "https://gridtilt.com/my-grid");
  });

  it("an unpublished state is a real 404, not a thin page", () => {
    for (const path of ["/state/virginia", "/state/md", "/state/Maryland", "/state/"]) {
      const meta = getPageMeta(path);
      assert.equal(meta.status, 404, path);
      assert.equal(meta.canonical, null, path);
    }
    assert.equal(statePagePrerender("/state/virginia"), null);
  });

  it("the response carries the page's facts in its HTML; the tool's response does not", () => {
    const page = pageResponse(SHELL, "/state/maryland?utm_source=x");
    assert.equal(page.status, 200);
    assert.match(page.html, /<div id="root"><main data-prerender="state-page">/);
    assert.match(page.html, /Order No\. 92606/);
    assert.match(page.html, /<link rel="canonical" href="https:\/\/gridtilt\.com\/state\/maryland" \/>/);
    const tool = pageResponse(SHELL, "/my-grid?state=MD");
    assert.ok(!tool.html.includes("data-prerender"));
    const missing = pageResponse(SHELL, "/state/virginia");
    assert.equal(missing.status, 404);
    assert.ok(!missing.html.includes("data-prerender"));
  });

  it("is in the sitemap, dated by its review, and its data is crawlable", () => {
    const xml = buildSitemap({ tickers: [], clusters: [], articles: [], statePages: loadStatePageSlugs() });
    assert.match(xml, /<loc>https:\/\/gridtilt\.com\/state\/maryland<\/loc>\n    <lastmod>2026-10-01<\/lastmod>/);
    assert.ok(robotsAllows("/api/state-pages"));
    assert.ok(robotsAllows("/api/state-pages/maryland"));
    assert.ok(robotsAllows("/state/maryland"));
  });

  it("loads the same record the route serves", () => {
    const page = loadStatePage("maryland", "2026-10-01");
    assert.equal(page?.code, "MD");
    assert.equal(loadStatePage("virginia", "2026-10-01"), null);
  });
});
