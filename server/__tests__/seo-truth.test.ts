// T20: every address answers as what it is. Real pages keep their metadata
// and 200; an address that names nothing is a 404 with noindex, never the
// home page's metadata on a 200. The sitemap lists only real pages, and the
// same content gives the same sitemap tomorrow.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ALIAS_REDIRECTS, buildSitemap, getPageMeta, injectMetaTags, SECTOR_SLUGS, REGION_SLUGS, OPERATOR_SLUGS } from "../seo";
import { COMPANY_DATABASE } from "../company-registry";
import { pageResponse } from "../static";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf-8");
const SHELL = '<html><head><title>GridTilt</title><meta name="robots" content="index, follow" /></head><body><div id="root"></div></body></html>';

describe("entity pages: real ones keep their page, invented ones are 404", () => {
  it("stock pages follow the registry the stock API answers from", () => {
    const ceg = getPageMeta("/stock/CEG");
    assert.equal(ceg.status ?? 200, 200);
    assert.equal(ceg.canonical, "https://gridtilt.com/stock/CEG");
    assert.equal(getPageMeta("/stock/ceg").canonical, "https://gridtilt.com/stock/CEG");
    for (const bad of ["/stock/NOPE", "/stock/NLR"]) assert.equal(getPageMeta(bad).status, 404, bad);
  });

  it("stock pages describe the company or fund, not a product GridTilt provides", () => {
    const company = JSON.stringify(getPageMeta("/stock/CEG").jsonLd);
    assert.ok(!company.includes("FinancialProduct"));
    assert.ok(company.includes('"@type":"Corporation"') && company.includes('"tickerSymbol":"CEG"'));
    const fund = JSON.stringify(getPageMeta("/stock/SPY").jsonLd);
    assert.ok(!fund.includes("Corporation") && fund.includes('"@type":"Thing"'));
  });

  it("all 13 sectors resolve, natural gas with its own canonical", () => {
    const gas = getPageMeta("/sector/natural-gas");
    assert.equal(gas.status ?? 200, 200);
    assert.equal(gas.canonical, "https://gridtilt.com/sector/natural-gas");
    assert.equal(Object.keys(SECTOR_SLUGS).length, 13);
    assert.equal(getPageMeta("/sector/made-up").status, 404);
  });

  it("regions, operators, clusters and articles: known resolve, unknown are 404", () => {
    assert.equal(getPageMeta("/region/pjm").status ?? 200, 200);
    assert.equal(getPageMeta("/region/atlantis").status, 404);
    assert.equal(getPageMeta("/operator/meta").status ?? 200, 200);
    assert.equal(getPageMeta("/operator/nobody").status, 404);
    assert.equal(getPageMeta("/compute-frontier/stargate-abilene").status ?? 200, 200);
    assert.equal(getPageMeta("/compute-frontier/not-a-cluster").status, 404);
    const slug = JSON.parse(read("content", "blog", "articles.json"))[0].slug;
    assert.equal(getPageMeta(`/blog/${slug}`).status ?? 200, 200);
    assert.equal(getPageMeta("/blog/not-a-post").status, 404);
  });

  it("a cluster's description states its status in words and never prints a missing value", () => {
    const desc = getPageMeta("/compute-frontier/stargate-abilene").description;
    assert.match(desc, /under construction|operating|planned/);
    for (const c of JSON.parse(read("server", "data", "clusters.json")).clusters as Array<{ id: string }>) {
      const d = getPageMeta(`/compute-frontier/${c.id}`).description;
      assert.ok(!/\bnull\b|\bundefined\b|NaN/.test(d), `${c.id}: ${d}`);
    }
  });

  it("an unknown address is a 404; every known page and the admin screens are not", () => {
    assert.equal(getPageMeta("/made/up/path").status, 404);
    assert.notEqual(getPageMeta("/my-grid").status, 404);
    const admin = getPageMeta("/admin/datacenters");
    assert.equal(admin.status ?? 200, 200);
    assert.equal(admin.robots, "noindex, nofollow");
    assert.equal(admin.canonical, null);
  });

  it("an alias describes its destination", () => {
    assert.equal(getPageMeta("/trade").canonical, getPageMeta("/analyze").canonical);
  });
});

describe("the HTML answer", () => {
  it("a 404 page says noindex, claims no canonical address, and carries the status", () => {
    const page = pageResponse(SHELL, "/stock/NOPE?ref=x");
    assert.equal(page.status, 404);
    assert.equal(page.robots, "noindex");
    assert.ok(page.html.includes('<meta name="robots" content="noindex" />'));
    assert.ok(!page.html.includes('rel="canonical"'));
    assert.ok(!page.html.includes('property="og:url"'));
    assert.ok(page.html.includes('<div id="root">'), "the app shell still loads");
  });

  it("a real page keeps 200, its canonical and index, follow", () => {
    const page = pageResponse(SHELL, "/sector/natural-gas");
    assert.equal(page.status, 200);
    assert.ok(page.html.includes('<link rel="canonical" href="https://gridtilt.com/sector/natural-gas" />'));
    assert.equal(page.html.match(/<meta name="robots"/g)?.length, 1, "the shell's own robots tag is replaced");
    const meta = injectMetaTags(SHELL, getPageMeta("/"));
    assert.ok(meta.includes('content="index, follow"'));
  });
});

describe("sitemap", () => {
  const articles = JSON.parse(read("content", "blog", "articles.json")) as Array<{ slug: string; date?: string }>;
  const clusters = (JSON.parse(read("server", "data", "clusters.json")).clusters as Array<{ id: string; reviewed?: string }>).map((c) => ({
    id: c.id,
    reviewed: c.reviewed ?? null,
  }));
  const xml = buildSitemap({ tickers: Object.keys(COMPANY_DATABASE).concat(["NLR", "NOPE"]), clusters, articles });
  const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);

  it("lists only addresses that resolve to a page", () => {
    for (const loc of locs) {
      const path = loc.replace("https://gridtilt.com", "") || "/";
      assert.notEqual(getPageMeta(path).status, 404, loc);
    }
    assert.ok(locs.includes("https://gridtilt.com/sector/natural-gas"));
    assert.ok(!locs.includes("https://gridtilt.com/stock/NLR"));
  });

  it("dates only what has a known change date, never today's", () => {
    const today = new Date().toISOString().slice(0, 10);
    assert.ok(!xml.includes(`<lastmod>${today}</lastmod>`) || articles.some((a) => a.date === today));
    assert.ok(!/<loc>https:\/\/gridtilt\.com\/stack<\/loc>\s*<lastmod>/.test(xml), "static pages carry no lastmod");
    const first = articles[0];
    assert.ok(xml.includes(`<loc>https://gridtilt.com/blog/${first.slug}</loc>\n    <lastmod>${first.date}</lastmod>`));
    const undated = buildSitemap({ tickers: [], clusters: [], articles: [{ slug: "no-date" }] });
    assert.ok(undated.includes("<loc>https://gridtilt.com/blog/no-date</loc>\n  </url>"));
  });

  it("the same content gives the same sitemap tomorrow", () => {
    const again = buildSitemap({ tickers: Object.keys(COMPANY_DATABASE).concat(["NLR", "NOPE"]), clusters, articles });
    assert.equal(again, xml);
  });
});

describe("parity with the client", () => {
  const keysOf = (file: string, constName: string) => {
    const src = read("client", "src", "pages", file);
    const start = src.indexOf(`const ${constName}`);
    const block = src.slice(start, src.indexOf("\n};", start));
    return Array.from(block.matchAll(/^ {2}"([a-z0-9-]+)": \{/gm)).map((m) => m[1]).sort();
  };

  it("sector, region and operator pages match the server's lists", () => {
    assert.deepEqual(keysOf("SectorPage.tsx", "SECTOR_META"), Object.keys(SECTOR_SLUGS).sort());
    assert.deepEqual(keysOf("RegionPage.tsx", "REGION_META"), Object.keys(REGION_SLUGS).sort());
    assert.deepEqual(keysOf("OperatorPage.tsx", "OPERATOR_META"), Object.keys(OPERATOR_SLUGS).sort());
  });

  it("every client redirect is a server 301 to the same place, and every client page resolves", () => {
    const app = read("client", "src", "App.tsx");
    const redirects = Object.fromEntries(
      Array.from(app.matchAll(/<Route path="([^"]+)">\{\(\) => <Redirect to="([^"]+)"/g)).map((m) => [m[1], m[2]]),
    );
    assert.deepEqual(redirects, ALIAS_REDIRECTS);
    const pages = Array.from(app.matchAll(/<Route path="([^":]+)" component=/g)).map((m) => m[1]);
    for (const p of pages) assert.notEqual(getPageMeta(p).status, 404, p);
  });
});
