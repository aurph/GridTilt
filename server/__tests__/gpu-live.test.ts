// Live GPU price ingestion: parsing, blending, guard rails, and the full
// sweep against fixture provider payloads. A bad SKU match here would put a
// wrong price on the front page, so the guard rails get their own cases.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RUNPOD_MODEL_IDS,
  blendLivePrice,
  fetchLivePrices,
  parseRunpod,
  parseVast,
  type FetchLike,
  type RunpodGpuType,
} from "../gpu-live";

describe("parseRunpod", () => {
  const types: RunpodGpuType[] = [
    { id: "NVIDIA H100 80GB HBM3", securePrice: 3.29, communityPrice: 2.69 },
    { id: "NVIDIA H100 PCIe", securePrice: 2.89, communityPrice: 1.99 },
    { id: "NVIDIA H200", securePrice: 4.39, communityPrice: 0.5 },
    { id: "NVIDIA B200", securePrice: null, communityPrice: 5.98 },
  ];
  it("matches only the mapped SKU ids", () => {
    const obs = parseRunpod(types, RUNPOD_MODEL_IDS.H100);
    assert.deepEqual(obs.map((o) => o.price), [3.29, 2.69]);
  });
  it("drops placeholder community prices (under 40% of secure)", () => {
    const obs = parseRunpod(types, ["NVIDIA H200"]);
    assert.deepEqual(obs.map((o) => o.price), [4.39]);
  });
  it("community without a secure anchor is dropped entirely", () => {
    const obs = parseRunpod(types, ["NVIDIA B200"]);
    assert.deepEqual(obs, []);
  });
  it("empty/missing input yields no observations", () => {
    assert.deepEqual(parseRunpod([], ["x"]), []);
    assert.deepEqual(parseRunpod(undefined as never, ["x"]), []);
  });
});

describe("parseVast", () => {
  it("takes the median of returned offers", () => {
    const obs = parseVast([{ dph_total: 1.74 }, { dph_total: 1.93 }, { dph_total: 2.0 }]);
    assert.deepEqual(obs, [{ provider: "vast", price: 1.93 }]);
  });
  it("even count averages the middle pair", () => {
    const obs = parseVast([{ dph_total: 1.0 }, { dph_total: 2.0 }, { dph_total: 3.0 }, { dph_total: 4.0 }]);
    assert.equal(obs[0].price, 2.5);
  });
  it("ignores null/zero/negative totals; empty yields nothing", () => {
    assert.deepEqual(parseVast([{ dph_total: null }, { dph_total: 0 }, { dph_total: -1 }]), []);
    assert.deepEqual(parseVast([]), []);
  });
});

describe("blendLivePrice", () => {
  it("median blend with low/high and deduped sources", () => {
    const { blended, dropped } = blendLivePrice(
      [
        { provider: "runpod-secure", price: 3.29 },
        { provider: "runpod-community", price: 2.69 },
        { provider: "vast", price: 1.93 },
      ],
      2.79,
    );
    assert.equal(dropped, 0);
    assert.ok(blended);
    assert.equal(blended.price, 2.69);
    assert.equal(blended.low, 1.93);
    assert.equal(blended.high, 3.29);
    assert.equal(blended.n, 3);
    assert.deepEqual(blended.sources.sort(), ["runpod-community", "runpod-secure", "vast"]);
  });
  it("guard rail: observations 4x off the curated price are dropped as bad matches", () => {
    const { blended, dropped } = blendLivePrice(
      [
        { provider: "vast", price: 0.4 }, // 10x cheaper than curated: wrong SKU
        { provider: "runpod-secure", price: 30 }, // 7x pricier: glitch
        { provider: "runpod-community", price: 4.1 },
      ],
      4.0,
    );
    assert.equal(dropped, 2);
    assert.equal(blended?.price, 4.1);
  });
  it("no curated reference means no ratio guard (new models still record)", () => {
    const { blended, dropped } = blendLivePrice([{ provider: "vast", price: 42 }], null);
    assert.equal(dropped, 0);
    assert.equal(blended?.price, 42);
  });
  it("all observations dropped or empty yields null (record nothing, fabricate nothing)", () => {
    assert.equal(blendLivePrice([], 3).blended, null);
    assert.equal(blendLivePrice([{ provider: "vast", price: NaN }], 3).blended, null);
  });
});

describe("fetchLivePrices (full sweep against fixtures)", () => {
  const runpodBody = {
    data: {
      gpuTypes: [
        { id: "NVIDIA H100 80GB HBM3", securePrice: 3.29, communityPrice: 2.69 },
        { id: "NVIDIA B200", securePrice: 5.89, communityPrice: 5.98 },
      ],
    },
  };
  const vastByName: Record<string, unknown> = {
    "H100 SXM": { offers: [{ dph_total: 1.74 }, { dph_total: 1.93 }, { dph_total: 2.0 }] },
  };
  const fakeFetch: FetchLike = async (url) => {
    if (url.includes("runpod")) return { ok: true, json: async () => runpodBody };
    const q = JSON.parse(decodeURIComponent(url.split("?q=")[1]));
    return { ok: true, json: async () => vastByName[q.gpu_name.eq] ?? { offers: [] } };
  };

  it("blends per model across providers; models with no source record nothing", async () => {
    const live = await fetchLivePrices(
      [
        { model: "H100", currentUsdPerHr: 2.79 },
        { model: "B200", currentUsdPerHr: 6.11 },
        { model: "MI355X", currentUsdPerHr: 2.85 }, // no provider covers it
      ],
      fakeFetch,
    );
    assert.deepEqual(Object.keys(live).sort(), ["B200", "H100"]);
    assert.equal(live.H100.price, 2.69); // median of 3.29, 2.69, 1.93
    assert.equal(live.H100.n, 3);
    assert.equal(live.B200.n, 2);
    assert.equal("MI355X" in live, false);
  });

  it("provider failure degrades to the surviving sources, never throws", async () => {
    const failingFetch: FetchLike = async (url) => {
      if (url.includes("runpod")) throw new Error("network down");
      const q = JSON.parse(decodeURIComponent(url.split("?q=")[1]));
      return { ok: true, json: async () => vastByName[q.gpu_name.eq] ?? { offers: [] } };
    };
    const live = await fetchLivePrices([{ model: "H100", currentUsdPerHr: 2.79 }], failingFetch);
    assert.equal(live.H100.price, 1.93); // vast only
    assert.deepEqual(live.H100.sources, ["vast"]);
  });

  it("total failure yields an empty result (nothing recorded, nothing invented)", async () => {
    const deadFetch: FetchLike = async () => {
      throw new Error("offline");
    };
    const live = await fetchLivePrices([{ model: "H100", currentUsdPerHr: 2.79 }], deadFetch);
    assert.deepEqual(live, {});
  });

  it("non-ok responses are treated as empty, not parsed", async () => {
    const badFetch: FetchLike = async () => ({ ok: false, json: async () => ({ oops: true }) });
    const live = await fetchLivePrices([{ model: "H100", currentUsdPerHr: 2.79 }], badFetch);
    assert.deepEqual(live, {});
  });
});
