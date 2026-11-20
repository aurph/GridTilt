/**
 * The States section was retired 2026-11-18 (Jack: three states is not a
 * section). These lock what replaced it: the front door points at the map,
 * no surface links the old index, and the published state pages keep their
 * own addresses. Rendered without a DOM or a network.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { Hero } from "../../components/home/Hero";
import { HomeRecord } from "../../components/home/home-record";
import NotFound from "../../pages/not-found";
import { SECTIONS } from "../sections";

const CLIENT = join(process.cwd(), "client", "src");

/** A published registry, so a state row would render wherever one is still mounted. */
const PUBLISHED = [
  { slug: "maryland", code: "MD", reviewed: "2026-10-30", decisions: 4, nextDate: { date: "2027-01-15", what: "A hearing." } },
  { slug: "texas", code: "TX", reviewed: "2026-10-30", decisions: 3, nextDate: null },
];

function render(node: React.ReactNode, path = "/"): string {
  const qc = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
  qc.setQueryData(["/api/state-pages"], PUBLISHED);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <Router ssrPath={path}>{node}</Router>
    </QueryClientProvider>,
  );
}

/** Every `href="..."` in a rendered tree. */
function hrefs(html: string): string[] {
  return Array.from(html.matchAll(/href="([^"]+)"/g)).map((m) => m[1]);
}

describe("the front door after States", () => {
  const hero = render(<Hero />);

  it("leads with the map as its one primary button", () => {
    const primary = /<a[^>]*data-testid="hero-cta-map"[^>]*>([^<]+)</.exec(hero);
    assert.ok(primary, "the map button is on the hero");
    assert.equal(primary[1], "Explore the map");
    assert.match(primary[0], /href="\/grid"/);
    assert.match(primary[0], /bg-brand/, "the map button is the filled, primary one");
    assert.ok(hero.indexOf('data-testid="hero-cta-map"') < hero.indexOf('data-testid="hero-cta-live"'), "the map comes first");
  });

  it("no longer offers a state picker or a state stat", () => {
    assert.ok(!hero.includes("Find your state"));
    assert.ok(!hero.includes("State pages"));
    assert.ok(!hero.includes("state decisions"));
    assert.ok(!hrefs(hero).some((h) => h === "/states" || h.startsWith("/state/")));
  });

  it("shows the interconnection queue total where the state stat was, honest before data", () => {
    assert.match(hero, /Waiting in the interconnection queue/);
    assert.match(hero, /href="\/grid\?tab=queue"/);
    // No data in this render: the figure is "--", never a number typed here.
    assert.ok(!/\d[\d,]* GW/.test(hero), "no figure is hardcoded into the hero");
  });

  it("keeps the next public dates, linked to the timeline instead of an index of states", () => {
    const record = render(<HomeRecord />);
    assert.match(record, /Next public dates/);
    assert.ok(!hrefs(record).includes("/states"));
    assert.ok(hrefs(record).includes("/grid?tab=timeline"));
    assert.ok(!record.includes("All state pages"));
  });
});

describe("the 404 after States", () => {
  it("offers the three sections and no state row", () => {
    const html = render(<NotFound />, "/nope");
    const links = Array.from(html.matchAll(/data-testid="not-found-link-([a-z-]+)"/g)).map((m) => m[1]);
    assert.deepEqual(links, SECTIONS.map((s) => s.label.toLowerCase()));
    assert.equal(links.length, 3);
    assert.ok(!html.includes("not-found-state-pages"));
    assert.ok(!hrefs(html).some((h) => h === "/states" || h.startsWith("/state/")), "no state links on the 404");
  });
});

describe("links to the retired index", () => {
  /** Every .ts/.tsx under client/src except tests. */
  function sources(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== "__tests__") sources(full, out);
      } else if (/\.tsx?$/.test(name)) out.push(full);
    }
    return out;
  }

  it("are gone from the client: nothing navigates to /states", () => {
    const offenders = sources(CLIENT).filter((f) => /["'`]\/states["'`?]/.test(readFileSync(f, "utf-8")) && !f.endsWith(join("lib", "sections.ts")));
    assert.deepEqual(offenders.map((f) => f.replace(CLIENT, "")), []);
  });

  it("leave the index page deleted and the state page in place", () => {
    assert.equal(existsSync(join(CLIENT, "pages", "states.tsx")), false);
    assert.equal(existsSync(join(CLIENT, "pages", "state-page.tsx")), true);
  });
});
