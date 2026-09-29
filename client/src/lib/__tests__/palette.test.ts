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

const ALL: PaletteEntry[] = [
  ...PAGE_ENTRIES,
  ...stateEntries(STATE_GRID),
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
});

describe("stateEntries", () => {
  it("covers every STATE_GRID state and matches on the postal code", () => {
    const entries = stateEntries(STATE_GRID);
    assert.equal(entries.length, Object.keys(STATE_GRID).length);
    const out = rankEntries(entries, "tx");
    assert.equal(out[0]?.id, "state-TX");
  });

  it("opens the shareable state address, not a remembered choice", () => {
    const md = stateEntries(STATE_GRID).find((e) => e.id === "state-MD");
    assert.equal(md?.href, "/my-grid?state=MD");
  });
});

describe("page entries", () => {
  it("go straight to final routes, never to a redirect alias", () => {
    // Redirects in App.tsx: each of these only forwards somewhere else.
    const aliases = ["/power-deals", "/queue", "/supply-chain", "/brief", "/trade", "/portfolio", "/gpu-economics"];
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
