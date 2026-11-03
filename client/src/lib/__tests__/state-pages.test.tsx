/**
 * The state-page entry points list exactly the registry's published states,
 * read from the same loader the server uses (no DOM, no network).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router, Route } from "wouter";
import { TooltipProvider } from "../../components/ui/tooltip";
import { StatePagesRow } from "../../components/StatePagesRow";
import StatePage from "../../pages/state-page";
import { STATE_GRID } from "../../data/state-grid";
import { statePageLinks, statePagesByCode } from "../state-pages";
import { loadStatePageSlugs } from "../../../../server/state-page";

const TODAY = "2026-10-30";
const REGISTRY = loadStatePageSlugs(TODAY);

function hrefsIn(html: string): string[] {
  return Array.from(html.matchAll(/href="(\/state\/[a-z-]+)"/g)).map((m) => m[1]);
}

describe("statePageLinks", () => {
  it("lists exactly the registry's published states, named and alphabetical", () => {
    assert.ok(REGISTRY.length >= 1, "the registry publishes at least one state");
    const links = statePageLinks(REGISTRY, STATE_GRID);
    assert.deepEqual(
      links.map((l) => l.slug).sort(),
      REGISTRY.map((r) => r.slug).sort(),
    );
    assert.deepEqual(
      links.map((l) => l.name),
      [...links.map((l) => l.name)].sort((a, b) => a.localeCompare(b)),
    );
    for (const l of links) {
      assert.equal(l.href, `/state/${l.slug}`);
      assert.equal(l.name, STATE_GRID[l.code].name);
    }
  });

  it("drops a page whose state the client cannot name, and tolerates no data", () => {
    assert.deepEqual(statePageLinks(undefined, STATE_GRID), []);
    assert.deepEqual(statePageLinks([{ slug: "atlantis", code: "ZZ" }], STATE_GRID), []);
    const byCode = statePagesByCode(REGISTRY, STATE_GRID);
    assert.deepEqual(Object.keys(byCode).sort(), REGISTRY.map((r) => r.code).sort());
  });
});

describe("StatePagesRow", () => {
  function render(pages: unknown): string {
    const qc = new QueryClient();
    qc.setQueryData(["/api/state-pages"], pages);
    return renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <Router ssrPath="/">
          <StatePagesRow />
        </Router>
      </QueryClientProvider>,
    );
  }

  it("renders one link per published state and nothing else", () => {
    const html = render(REGISTRY);
    assert.deepEqual(hrefsIn(html).sort(), REGISTRY.map((r) => `/state/${r.slug}`).sort());
    assert.match(html, /State pages/);
    for (const r of REGISTRY) assert.match(html, new RegExp(STATE_GRID[r.code].name));
  });

  it("renders nothing while the registry has not answered or is empty", () => {
    assert.equal(render(undefined), "");
    assert.equal(render([]), "");
  });
});

describe("state page 404", () => {
  it("lists the states that do have a page", () => {
    // enabled:false keeps the observer from turning the seeded 404 back into a
    // pending state on mount, which is what a fresh fetch would do in the browser.
    const qc = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
    qc.setQueryData(["/api/state-pages"], REGISTRY);
    // Seed the failed lookup the way the fetcher reports it: a 404 error.
    const q = qc.getQueryCache().build(qc, { queryKey: ["/api/state-pages/atlantis"] });
    q.setState({
      status: "error",
      error: new Error("404: No state page at this address"),
      data: undefined,
      fetchStatus: "idle",
    } as never);
    const html = renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <Router ssrPath="/state/atlantis">
            <Route path="/state/:slug" component={StatePage} />
          </Router>
        </TooltipProvider>
      </QueryClientProvider>,
    );
    assert.match(html, /state-page-missing/);
    assert.deepEqual(hrefsIn(html).sort(), REGISTRY.map((r) => `/state/${r.slug}`).sort());
  });
});
