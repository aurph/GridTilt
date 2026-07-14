import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  recordedByModel,
  summarizeGpuHistory,
  type Snapshot,
} from "../gpu-history";

describe("summarizeGpuHistory", () => {
  it("counts distinct live observation days and returns the latest date", () => {
    const snapshots: Snapshot[] = [
      { date: "2026-07-13", prices: { H100: 2.7 }, source: "live" },
      { date: "2026-06-01", prices: { H100: 2.8 }, source: "curated" },
      { date: "2026-07-03", prices: { H100: 2.9 }, source: "live" },
      { date: "2026-07-13", prices: { A100: 1.4 }, source: "live" },
      { date: "2026-05-01", prices: { H100: 3.0 } },
    ];

    assert.deepEqual(summarizeGpuHistory(snapshots), {
      recordedDays: 2,
      lastRecordedDate: "2026-07-13",
    });
  });

  it("reports an honest empty state when no live snapshots exist", () => {
    assert.deepEqual(
      summarizeGpuHistory([
        { date: "2026-06-01", prices: { H100: 2.8 }, source: "curated" },
        { date: "2026-05-01", prices: { H100: 3.0 } },
      ]),
      { recordedDays: 0, lastRecordedDate: null },
    );
  });
});

describe("recordedByModel", () => {
  it("copies live dispersion metadata and excludes curated or legacy rows", () => {
    const snapshots: Snapshot[] = [
      {
        date: "2026-07-13",
        prices: { H100: 2.7, A100: 1.4 },
        meta: {
          H100: { low: 2.1, high: 2.9, sources: ["runpod-secure", "vast"], n: 2 },
          A100: { low: 1.4, high: 1.4, sources: ["runpod-secure"], n: 1 },
        },
        source: "live",
      },
      { date: "2026-06-01", prices: { H100: 2.8 }, source: "curated" },
      { date: "2026-05-01", prices: { H100: 3.0 } },
    ];

    assert.deepEqual(recordedByModel(snapshots), {
      H100: [{
        date: "2026-07-13",
        price: 2.7,
        low: 2.1,
        high: 2.9,
        sources: ["runpod-secure", "vast"],
        n: 2,
      }],
      A100: [{
        date: "2026-07-13",
        price: 1.4,
        low: 1.4,
        high: 1.4,
        sources: ["runpod-secure"],
        n: 1,
      }],
    });
  });
});
