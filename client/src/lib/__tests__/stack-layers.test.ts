// The cast this replaces would hand back CorrelationPoint[] typed as StockData[]
// if a layer key ever read "correlation". These pin that it cannot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { STACK_LAYER_KEYS, isStackLayerKey, layerRows } from "../stack-layers";

test("the thirteen equity layers are the whole list", () => {
  assert.equal(STACK_LAYER_KEYS.length, 13);
  assert.ok(STACK_LAYER_KEYS.includes("compute"));
  assert.ok(STACK_LAYER_KEYS.includes("etfsBenchmarks"));
});

test("correlation fields are not layer keys", () => {
  for (const k of ["correlation", "correlationCoeff", "cegCorrelationCoeff", "correlationMeta"]) {
    assert.equal(isStackLayerKey(k), false, `${k} carries a different shape`);
    assert.deepEqual(layerRows({ compute: [1, 2] } as never, k), [], `${k} must yield no rows`);
  }
});

test("a known layer returns its rows", () => {
  assert.deepEqual(layerRows({ compute: ["NVDA", "AMD"] }, "compute"), ["NVDA", "AMD"]);
});

test("a missing payload or layer yields no rows rather than throwing", () => {
  assert.deepEqual(layerRows(undefined, "compute"), []);
  assert.deepEqual(layerRows(null, "compute"), []);
  assert.deepEqual(layerRows({}, "compute"), []);
});

test("a typo'd key yields no rows rather than whatever sits there", () => {
  assert.equal(isStackLayerKey("comput"), false);
  assert.deepEqual(layerRows({ compute: ["NVDA"] }, "comput"), []);
});

test("a non-array at a valid key does not escape as rows", () => {
  // The payload is external. A shape change should not become a .map() crash.
  assert.deepEqual(layerRows({ compute: "NVDA" } as never, "compute"), []);
});
