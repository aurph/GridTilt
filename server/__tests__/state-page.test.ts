// The Maryland pilot page: one composed record feeds the JSON, the HTML and
// the metadata, its grid facts are My Grid's, its documents are dated and
// linked in their own terms, and nothing in it claims coverage or review the
// records do not have.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  composeStatePage,
  dateSpan,
  injectStateHtml,
  loadStatePage,
  loadStatePageSlugs,
  longDate,
  renderStateHtml,
  slugForState,
  stateDescription,
  statePagePrerender,
  statePageSlugs,
  stateTitle,
  validateStatePages,
  type CuratedStates,
  type StatePageInput,
} from "../state-page";
import { buildSitemap, getPageMeta, robotsAllows, unavailableMeta } from "../seo";
import { pageResponse } from "../static";
import { areaForState as clientAreaForState, cushion as clientCushion } from "../../client/src/lib/reserve-margins";
import { STATE_GRID } from "../../client/src/data/state-grid";

const data = (file: string) => JSON.parse(readFileSync(join(process.cwd(), "server", "data", file), "utf-8"));
const shipped = data("state-pages.json") as CuratedStates;
const TODAY = "2026-10-01";

const input = (over: Partial<StatePageInput> = {}): StatePageInput => ({
  curated: shipped,
  clusters: data("clusters.json").clusters,
  facilities: data("datacenters.json"),
  today: TODAY,
  ...over,
});

const page = () => {
  const result = loadStatePage("maryland", TODAY);
  assert.equal(result.kind, "page");
  return result.kind === "page" ? result.page : (null as never);
};

describe("state pages: curated file", () => {
  it("the shipped file is valid and publishes only Maryland", () => {
    assert.deepEqual(validateStatePages(shipped, TODAY), []);
    assert.deepEqual(statePageSlugs(shipped).map((s) => s.slug), ["maryland"]);
  });

  it("rejects unknown states, slugs that are not the state's name, undated or unlinked rows, and dates past the review", () => {
    const md = shipped.states[0];
    assert.match(validateStatePages({ states: [{ ...md, code: "ZZ" }] }).join(), /not a state/);
    assert.match(validateStatePages({ states: [{ ...md, code: "VA" }] }).join(), /slug must be "virginia"/, "a slug publishes the state it names");
    assert.equal(slugForState("District of Columbia"), "district-of-columbia");
    assert.match(validateStatePages({ states: [{ ...md, documents: [{ ...md.documents[0], url: "http://example.com" }] }] }).join(), /https/);
    assert.match(validateStatePages({ states: [{ ...md, documents: [{ ...md.documents[0], date: "2026-10-02" }] }] }).join(), /after the review/);
    assert.match(validateStatePages({ states: [{ ...md, documents: [{ ...md.documents[0], kind: "rumor" as never }] }] }).join(), /kind must be/);
    assert.match(validateStatePages({ states: [{ ...md, nextDates: [{ ...md.nextDates[0], date: "soon" }] }] }).join(), /real YYYY-MM-DD/);
    assert.match(validateStatePages({ states: [{ ...md, nextDates: [{ ...md.nextDates[1], through: "2027-05-01" }] }] }).join(), /through must be/);
    assert.match(validateStatePages({ states: [{ ...md, bill: { explanation: "", source: "x", url: "https://x.test" } }] }).join(), /bill needs/);
    assert.match(validateStatePages({ states: [{ ...md, reviewed: "2026-02-30" }] }).join(), /real YYYY-MM-DD/);
    assert.match(validateStatePages({ states: [{ ...md, reviewed: "2026-10-02" }] }, TODAY).join(), /after today/, "a review cannot be dated in the future");
  });

  it("the page's review date is the review the ledger records", () => {
    const ledger = data("dataset-reviews.json").reviews as Array<{ dataset: string; reviewed: string }>;
    const latest = ledger.filter((r) => r.dataset === "state-pages").map((r) => r.reviewed).sort().pop();
    for (const s of shipped.states) assert.equal(s.reviewed, latest, s.code);
  });
});

describe("state pages: Maryland", () => {
  const md = page();

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

  it("lists the Compute Frontier records with their estimate flags and their own review state", () => {
    assert.deepEqual(
      md.projects.map((p) => [p.id, p.plannedMW, p.plannedEstimated, p.reviewed]),
      [
        ["aligned-iad-quantum-frederick-md", 264, true, null],
        ["rowan-bauxite-frederick-md", 231, true, null],
      ],
    );
    assert.equal(md.registry.floorMW, 400);
    assert.equal(md.registry.tracked, 0, "no campus of 400 MW or more in the registry for Maryland");
  });

  it("keeps a status snapshot apart from decisions", () => {
    assert.deepEqual(md.documents.map((d) => d.date), ["2026-09-14", "2026-09-14", "2026-08-27"]);
    assert.deepEqual(md.statusRecords.map((d) => [d.kind, d.date]), [["status", "2026-07-01"]]);
    assert.ok(!md.documents.some((d) => /site plans/i.test(d.title)), "the county map is not a July 1 decision");
  });

  it("keeps an event listed through its last day, then drops it", () => {
    const during = composeStatePage("maryland", input({ today: "2027-05-15" }))!;
    assert.deepEqual(during.nextDates.map((d) => d.date), ["2027-05-11", "2027-07-01"], "the evidentiary hearings are still running");
    const after = composeStatePage("maryland", input({ today: "2027-05-22" }))!;
    assert.deepEqual(after.nextDates.map((d) => d.date), ["2027-07-01"]);
    assert.equal(dateSpan("2027-05-11", "2027-05-21"), "May 11 to 21, 2027");
    assert.equal(dateSpan("2027-05-30", "2027-06-02"), "May 30, 2027 to June 2, 2027");
  });

  it("answers absent for a slug that is not published", () => {
    assert.equal(loadStatePage("virginia", TODAY).kind, "absent");
    assert.equal(composeStatePage("virginia", input()), null);
  });

  it("writes the same facts into the HTML, escaped, with scoped review dates and the limits", () => {
    const html = renderStateHtml(md);
    assert.match(html, /<h1>Maryland's grid<\/h1>/);
    assert.ok(html.includes(`anticipated reserve margin ${md.nerc!.margin.toFixed(1)}%`));
    assert.ok(html.includes("Each checked against its document on October 1, 2026."));
    assert.ok(html.includes("<strong>As of July 1, 2026, Frederick County: Approved data center site plans"));
    assert.ok(html.includes("May 11 to 21, 2027: Piedmont line evidentiary hearings"));
    assert.ok(html.includes("not yet reviewed field by field"), "projects keep their own review state");
    assert.ok(!html.includes("Reviewed October 1, 2026."), "no page-wide review stamp");
    assert.ok(html.includes("a project missing here is not evidence that none exists"));
    assert.ok(html.includes("A statewide residential average blends every utility's residential customers"));
    for (const p of md.projects) assert.ok(html.includes(p.url), p.id);
    const hostile = renderStateHtml({ ...md, documents: [{ ...md.documents[0], title: `<script>alert(1)</script>`, url: `https://x.test/"onmouseover="y` }] });
    assert.ok(!hostile.includes("<script>alert"), "text is escaped");
    assert.ok(!hostile.includes(`"onmouseover`), "attributes are escaped");
  });

  it("puts the HTML into an empty root only, and writes $ patterns as text", () => {
    const shell = `<body><div id="root"></div><script type="module" src="/x.js"></script></body>`;
    assert.equal(injectStateHtml(shell, "<main>x</main>"), `<body><div id="root"><main>x</main></div><script type="module" src="/x.js"></script></body>`);
    assert.equal(injectStateHtml("<body></body>", "<main>x</main>"), "<body></body>");
    const tricky = injectStateHtml(shell, "<p>$$5 and $' then $& end</p>");
    assert.ok(tricky.includes(`<div id="root"><p>$$5 and $' then $& end</p></div>`));
    assert.equal(tricky.split(`<div id="root">`).length, 2, "one root, not a copied shell");
  });

  it("titles and describes the page from the record", () => {
    assert.equal(stateTitle(md), "Maryland's grid: operator, reliability and data center decisions | GridTilt");
    assert.ok(stateDescription(md).includes("summer 2026 reserve margin for PJM: 29.7%, with a reference level of 18.6%"));
    assert.ok(stateDescription(md).length <= 300);
    assert.equal(longDate("2026-09-14"), "September 14, 2026");
  });
});

describe("state pages: a fault is not an absence", () => {
  // Runs the loader against a copy of the data folder with one file broken.
  function withBrokenData(breakIt: (dir: string) => void, check: () => void) {
    const root = mkdtempSync(join(tmpdir(), "gridtilt-state-"));
    const prev = process.cwd();
    try {
      mkdirSync(join(root, "server"), { recursive: true });
      cpSync(join(prev, "server", "data"), join(root, "server", "data"), { recursive: true });
      breakIt(join(root, "server", "data"));
      process.chdir(root);
      check();
    } finally {
      process.chdir(prev);
      rmSync(root, { recursive: true, force: true });
    }
  }

  it("an invalid curated file makes the page unavailable (503), not missing (404)", () => {
    withBrokenData(
      (dir) => writeFileSync(join(dir, "state-pages.json"), JSON.stringify({ states: [{ code: "MD" }] })),
      () => {
        assert.equal(loadStatePage("maryland", TODAY).kind, "unavailable");
        assert.equal(getPageMeta("/state/maryland").status, 503);
        assert.equal(statePagePrerender("/state/maryland", TODAY), null);
        assert.deepEqual(loadStatePageSlugs(TODAY), []);
      },
    );
  });

  it("an unreadable record file does the same", () => {
    withBrokenData(
      (dir) => writeFileSync(join(dir, "clusters.json"), "{ not json"),
      () => assert.equal(loadStatePage("maryland", TODAY).kind, "unavailable"),
    );
  });

  it("the 503 meta tells crawlers to come back, not that nothing is here", () => {
    const meta = unavailableMeta();
    assert.equal(meta.status, 503);
    assert.equal(meta.robots, "noindex");
    assert.equal(meta.canonical, null);
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
    assert.equal(statePagePrerender("/state/virginia", TODAY), null);
  });

  it("the response carries the page's facts in its HTML; the tool's response does not", () => {
    const res = pageResponse(SHELL, "/state/maryland?utm_source=x");
    assert.equal(res.status, 200);
    assert.match(res.html, /<div id="root"><main data-prerender="state-page">/);
    assert.match(res.html, /Order No\. 92606/);
    assert.match(res.html, /<link rel="canonical" href="https:\/\/gridtilt\.com\/state\/maryland" \/>/);
    const tool = pageResponse(SHELL, "/my-grid?state=MD");
    assert.ok(!tool.html.includes("data-prerender"));
    const missing = pageResponse(SHELL, "/state/virginia");
    assert.equal(missing.status, 404);
    assert.ok(!missing.html.includes("data-prerender"));
  });

  it("works on the real app shell, not only a test one", () => {
    const real = readFileSync(join(process.cwd(), "client", "index.html"), "utf-8");
    assert.ok(real.includes(`<div id="root"></div>`), "the shell's root is where the facts are written");
    const res = pageResponse(real, "/state/maryland");
    assert.match(res.html, /<div id="root"><main data-prerender="state-page">/);
    assert.equal(res.html.split(`<div id="root">`).length, 2);
  });

  it("is in the sitemap, dated by its review, and its data is crawlable", () => {
    const xml = buildSitemap({ tickers: [], clusters: [], articles: [], statePages: loadStatePageSlugs(TODAY) });
    assert.match(xml, /<loc>https:\/\/gridtilt\.com\/state\/maryland<\/loc>\n    <lastmod>2026-10-01<\/lastmod>/);
    assert.ok(robotsAllows("/api/state-pages"));
    assert.ok(robotsAllows("/api/state-pages/maryland"));
    assert.ok(robotsAllows("/state/maryland"));
  });
});
