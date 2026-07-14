/**
 * Lake 8: snapshot tests for the shared widget states (loading/empty/error
 * primitives). Rendered with react-dom/server - no DOM required, so they run
 * in the same node:test harness as everything else. Snapshots live next to
 * this file; regenerate with: node --import tsx --test --test-update-snapshots
 */
import { describe, it, type TestContext } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AsOf, ErrorState, SrChartTable } from "../../components/Freshness";

// @types/node 20 predates node 22+'s t.assert.snapshot; the runtime (node 26)
// has it. One typed shim instead of six casts.
const snap = (t: TestContext, html: string) =>
  (t.assert as unknown as { snapshot: (v: string) => void }).snapshot(html);

describe("state primitive snapshots", () => {
  it("ErrorState with retry", (t) => {
    snap(t, renderToStaticMarkup(<ErrorState label="Price index unavailable." onRetry={() => {}} />));
  });
  it("ErrorState without retry", (t) => {
    snap(t, renderToStaticMarkup(<ErrorState label="Catalysts unavailable." />));
  });
  it("AsOf fresh", (t) => {
    // fixed ages relative to a mocked clock so the snapshot is stable
    t.mock.timers.enable({ apis: ["Date"], now: 1_000_000_000 });
    snap(t, renderToStaticMarkup(<AsOf updatedAt={1_000_000_000 - 120_000} intervalMs={900_000} />));
  });
  it("AsOf stays quiet on old data (age is context, not an alarm)", (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 1_000_000_000 });
    const html = renderToStaticMarkup(<AsOf updatedAt={1_000_000_000 - 3 * 900_000} intervalMs={900_000} />);
    snap(t, html);
  });
  it("AsOf hidden when no timestamp", (t) => {
    snap(t, renderToStaticMarkup(<AsOf updatedAt={undefined} />));
  });
  it("SrChartTable", (t) => {
    snap(t, 
      renderToStaticMarkup(
        <SrChartTable
          caption="NPI gauge history"
          columns={["Date", "NPI"]}
          rows={[["Jan 2 '24", 100], ["Jul 2 '26", 251.9]]}
        />,
      ),
    );
  });
});
