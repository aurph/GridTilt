import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  trainingEstimate,
  trainingSensitivity,
  type TrainingBaseInput,
} from "../gpu-economics-series";

const input: TrainingBaseInput = {
  totalFlops: 1e25,
  tflopsBf16: 989.5,
  pricePerHr: 2.79,
  gpuCount: 1000,
};

describe("trainingEstimate", () => {
  it("uses the same FLOPs, MFU, price, and cluster formula as the calculator", () => {
    const result = trainingEstimate({ ...input, mfu: 40 });
    assert.ok(result);
    assert.ok(result.gpuHours > 6_900_000 && result.gpuHours < 7_100_000);
    assert.ok(result.usdCost > 19_000_000 && result.usdCost < 20_500_000);
    assert.ok(result.wallClockDays > 270 && result.wallClockDays < 310);
  });

  it("returns null for invalid physical or utilization inputs", () => {
    assert.equal(trainingEstimate({ ...input, mfu: 0 }), null);
    assert.equal(trainingEstimate({ ...input, mfu: 101 }), null);
    assert.equal(trainingEstimate({ ...input, gpuCount: 0, mfu: 40 }), null);
    assert.equal(trainingEstimate({ ...input, totalFlops: NaN, mfu: 40 }), null);
  });
});

describe("trainingSensitivity", () => {
  it("builds a deterministic 20-60 percent MFU curve", () => {
    const points = trainingSensitivity(input, 20, 60, 5);
    assert.deepEqual(points.map((point) => point.mfu), [20, 25, 30, 35, 40, 45, 50, 55, 60]);
    assert.ok(points[0].usdCost > points.at(-1)!.usdCost);
    const current = trainingEstimate({ ...input, mfu: 40 });
    assert.ok(current);
    assert.equal(points.find((point) => point.mfu === 40)?.usdCost, current.usdCost);
  });

  it("returns no modeled points for invalid ranges or inputs", () => {
    assert.deepEqual(trainingSensitivity(input, 60, 20, 5), []);
    assert.deepEqual(trainingSensitivity(input, 20, 60, 0), []);
    assert.deepEqual(trainingSensitivity({ ...input, pricePerHr: -1 }, 20, 60, 5), []);
  });
});
