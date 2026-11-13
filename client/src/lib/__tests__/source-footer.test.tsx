/**
 * The line under a number: source, the data's own date, and "est." when the
 * number is modeled. A registry's date is its own (data status), never the
 * time the browser fetched it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RegistryDate, registryDay } from "../../components/Freshness";
import { RegistrySourceFooter, SourceFooter } from "../../components/SourceFooter";

const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

const DATASETS = [
  { id: "clusters", lastUpdated: "2026-10-30", lastReviewed: null },
  { id: "catalysts", lastUpdated: null, lastReviewed: "2026-10-28" },
  { id: "eia-grid-live", lastUpdated: null, lastReviewed: null },
];

function withStatus(node: React.ReactNode, datasets: unknown = DATASETS): string {
  const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  if (datasets) qc.setQueryData(["/api/data-status"], { datasets });
  return renderToStaticMarkup(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe("SourceFooter", () => {
  it("names a linked source and the data's date", () => {
    const html = renderToStaticMarkup(<SourceFooter source="EIA" href="https://www.eia.gov/" asOf="2026-10" />);
    assert.match(html, /<a href="https:\/\/www\.eia\.gov\/"[^>]*>EIA<\/a>/);
    assert.equal(text(html), "Source: EIA · as of 2026-10");
    assert.doesNotMatch(html, /est\./);
  });

  it("prints no date when it is given none", () => {
    assert.equal(text(renderToStaticMarkup(<SourceFooter source="Yahoo Finance" asOf={null} />)), "Source: Yahoo Finance");
  });

  it("marks a modeled number est. and says how", () => {
    const html = renderToStaticMarkup(
      <SourceFooter source="GridTilt scenario model" est="computed from the assumptions set above; illustrative" />,
    );
    assert.equal(text(html), "Source: GridTilt scenario model · est. computed from the assumptions set above; illustrative");
    assert.match(html, /data-testid="source-footer-est"/);
    assert.equal(text(renderToStaticMarkup(<SourceFooter source="Model" est />)), "Source: Model · est.");
  });

  it("says when it is showing the previous fetch", () => {
    assert.match(text(renderToStaticMarkup(<SourceFooter source="EIA" stale />)), /last refresh failed, showing the previous fetch/);
  });
});

describe("registry dates", () => {
  it("use the dataset's newest data date, then its review date, then nothing", () => {
    assert.equal(registryDay(DATASETS, "clusters"), "2026-10-30");
    assert.equal(registryDay(DATASETS, "catalysts"), "2026-10-28");
    assert.equal(registryDay(DATASETS, "eia-grid-live"), null);
    assert.equal(registryDay(DATASETS, "no-such-dataset"), null);
    assert.equal(registryDay(undefined, "clusters"), null);
  });

  it("render the registry's date and never a relative time", () => {
    const html = withStatus(<RegistryDate dataset="clusters" />);
    assert.equal(text(html), "data as of 2026-10-30");
    assert.doesNotMatch(html, /just now|ago/);
  });

  it("render nothing for a dataset with no date, or before data status answers", () => {
    assert.equal(withStatus(<RegistryDate dataset="eia-grid-live" />), "");
    assert.equal(withStatus(<RegistryDate dataset="clusters" />, null), "");
  });

  it("date a registry chart's footer from the registry", () => {
    const html = withStatus(
      <RegistrySourceFooter dataset="clusters" source="GridTilt cluster registry" est="planned capacity is as announced" />,
    );
    assert.equal(text(html), "Source: GridTilt cluster registry · as of 2026-10-30 · est. planned capacity is as announced");
    const undated = withStatus(<RegistrySourceFooter dataset="eia-grid-live" source="EIA" />);
    assert.equal(text(undated), "Source: EIA");
  });
});
