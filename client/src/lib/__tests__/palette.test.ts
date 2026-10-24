import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PAGE_ENTRIES,
  clusterEntries,
  rankEntries,
  stateEntries,
  stockEntries,
  type PaletteEntry,
} from "../palette";
import { STATE_GRID } from "../../data/state-grid";
import { supplyNodes } from "../../data/supply-chain-config";

const PAGES = [
  { slug: "maryland", code: "MD" },
  { slug: "texas", code: "TX" },
];

const ALL: PaletteEntry[] = [
  ...PAGE_ENTRIES,
  ...stateEntries(PAGES, STATE_GRID),
  ...stockEntries(supplyNodes),
  ...clusterEntries([
    { id: "stargate-abilene", name: "Stargate Abilene (OpenAI/Oracle)", operator: "OpenAI / Oracle", location: { city: "Abilene", state: "TX" } },
    { id: "colossus", name: "Colossus (xAI)", operator: "xAI", location: { city: "Memphis", state: "TN" } },
  ]),
];

describe("rankEntries", () => {
  it("returns the pages when the query is empty", () => {
    const out = rankEntries(ALL, "");
    assert.ok(out.length > 0);
    assert.ok(out.every((e) => e.category === "page"));
  });

  it("finds a ticker by symbol and by company name", () => {
    const bySymbol = rankEntries(ALL, "ccj");
    assert.equal(bySymbol[0]?.id, "stock-CCJ");
    const byName = rankEntries(ALL, "cameco");
    assert.ok(byName.some((e) => e.id === "stock-CCJ"));
  });

  it("finds a cluster by city keyword", () => {
    const out = rankEntries(ALL, "abilene");
    assert.ok(out.some((e) => e.id === "cluster-stargate-abilene"));
  });

  it("prefers the exact-prefix label over keyword matches", () => {
    const out = rankEntries(ALL, "texas");
    assert.equal(out[0]?.id, "state-TX");
  });

  it("caps results and excludes non-matches", () => {
    assert.ok(rankEntries(ALL, "e").length <= 12);
    assert.equal(rankEntries(ALL, "zzzzqqq").length, 0);
  });
});

describe("stockEntries", () => {
  it("dedupes tickers that sit in several supply-chain nodes", () => {
    const tickers = stockEntries(supplyNodes).map((e) => e.label);
    assert.equal(tickers.length, new Set(tickers).size);
    assert.ok(tickers.includes("SMR"));
  });

  it("offers only tickers that have a stock page when the server's list is given", () => {
    // A node company without a stock page must not be offered once the
    // server's list is known.
    const nodes = [...supplyNodes, { ...supplyNodes[0], id: "no-page", companies: [{ ticker: "NOPG", name: "No Page Inc" }] }];
    const all = stockEntries(nodes).map((e) => e.label);
    assert.ok(all.includes("NOPG"));
    const withPage = stockEntries(nodes, new Set(["SMR", "CEG"])).map((e) => e.label);
    assert.deepEqual(withPage.sort(), ["CEG", "SMR"]);
    assert.deepEqual(stockEntries(supplyNodes, new Set()), [], "nothing before the list arrives");
  });
});

describe("stateEntries", () => {
  it("offers only states with a published page, and matches on the postal code", () => {
    const entries = stateEntries(PAGES, STATE_GRID);
    assert.deepEqual(entries.map((e) => e.id), ["state-MD", "state-TX"]);
    const out = rankEntries(entries, "tx");
    assert.equal(out[0]?.id, "state-TX");
  });

  it("opens the state page", () => {
    const md = stateEntries(PAGES, STATE_GRID).find((e) => e.id === "state-MD");
    assert.equal(md?.href, "/state/maryland");
  });

  it("skips a page whose code names no known state", () => {
    assert.deepEqual(stateEntries([{ slug: "atlantis", code: "ZZ" }], STATE_GRID), []);
  });
});

describe("page entries", () => {
  it("go straight to final routes, never to a redirect alias", () => {
    // Redirects in App.tsx: each of these only forwards somewhere else.
    const aliases = ["/power-deals", "/queue", "/brief", "/trade", "/portfolio", "/gpu-economics", "/my-grid"];
    for (const e of PAGE_ENTRIES) {
      const path = e.href.split("?")[0];
      assert.ok(!aliases.includes(path), `${e.label} points at the alias ${e.href}`);
    }
  });

  it("name the agreements page the way the site does", () => {
    const deals = PAGE_ENTRIES.find((e) => e.id === "page-deals");
    assert.equal(deals?.label, "Power agreements");
    assert.equal(deals?.href, "/power-map?tab=deals");
  });
});
