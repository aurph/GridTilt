/**
 * The Maryland state page as a reader sees it, rendered with react-dom/server
 * from the same composed record the server serves (no DOM, no network).
 * Covers the facts, the links back to their sources, the coverage limit, and
 * both rates states: EIA configured and not.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router, Route } from "wouter";
import { TooltipProvider } from "../../components/ui/tooltip";
import StatePage from "../../pages/state-page";
import { loadStatePage } from "../../../../server/state-page";

function render(rates?: unknown): string {
  const qc = new QueryClient();
  qc.setQueryData(["/api/state-pages/maryland"], loadStatePage("maryland", "2026-10-01"));
  if (rates !== undefined) qc.setQueryData(["/api/physical/retail-rates"], rates);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <Router ssrPath="/state/maryland">
          <Route path="/state/:slug" component={StatePage} />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

/** Thirteen months so a year-on-year change exists; the ends are EIA's July figures. */
const MD_SERIES = Array.from({ length: 13 }, (_, i) => {
  const month = new Date(Date.UTC(2025, 6 + i, 1)).toISOString().slice(0, 7);
  return { month, centsPerKwh: i === 0 ? 18.83 : i === 12 ? 21.41 : 20 };
});

describe("state page render", () => {
  it("shows the grid facts, the dated decisions and the projects with their sources", () => {
    const html = render({ configured: false, howTo: "set EIA_API_KEY" });
    assert.match(html, /Maryland&#x27;s grid/);
    assert.match(html, /Reviewed October 1, 2026/);
    assert.match(html, /href="\/my-grid\?state=MD"/);
    assert.match(html, /29\.7%/);
    assert.match(html, /reference level of 18\.6%/);
    assert.match(html, /Order No\. 92606/);
    assert.match(html, /September 14, 2026 · Frederick County/);
    assert.match(html, /href="\/compute-frontier\/aligned-iad-quantum-frederick-md"/);
    assert.match(html, /264 MW planned/);
    assert.match(html, /est\./, "estimates stay flagged");
    assert.match(html, /a project missing here is not evidence that none exists/);
  });

  it("says where to find prices when the EIA feed is not configured, and gives no figure", () => {
    const html = render({ configured: false, howTo: "set EIA_API_KEY" });
    assert.match(html, /EIA&#x27;s price feed is not available here right now/);
    assert.match(html, /epmt_5_6_a/);
    assert.ok(!/¢\/kWh/.test(html), "no price is shown without one");
    assert.match(html, /nothing on this page shows how much any project or power line added to a household&#x27;s bill/);
  });

  it("shows the latest month and the year-on-year change when EIA answers", () => {
    const html = render({ configured: true, unit: "cents/kWh", source: "EIA", sourceUrl: "https://www.eia.gov", byState: { MD: MD_SERIES } });
    assert.match(html, /Residential average, July 2026/);
    assert.match(html, /21\.4¢\/kWh/);
    assert.match(html, /\+13\.7% from a year earlier/);
  });
});
