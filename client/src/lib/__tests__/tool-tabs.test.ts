import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tabKeyTarget } from "../../components/ToolTabs";

describe("tabKeyTarget", () => {
  it("moves right and wraps at the end", () => {
    assert.equal(tabKeyTarget("ArrowRight", 0, 3), 1);
    assert.equal(tabKeyTarget("ArrowRight", 2, 3), 0);
  });

  it("moves left and wraps at the start", () => {
    assert.equal(tabKeyTarget("ArrowLeft", 2, 3), 1);
    assert.equal(tabKeyTarget("ArrowLeft", 0, 3), 2);
  });

  it("treats up and down as the same axis as left and right", () => {
    assert.equal(tabKeyTarget("ArrowDown", 0, 3), 1);
    assert.equal(tabKeyTarget("ArrowUp", 0, 3), 2);
  });

  it("jumps to the ends", () => {
    assert.equal(tabKeyTarget("Home", 2, 3), 0);
    assert.equal(tabKeyTarget("End", 0, 3), 2);
  });

  it("ignores keys the tablist does not own, so typing still works", () => {
    for (const k of ["Enter", " ", "Tab", "a", "Escape", "PageDown"]) {
      assert.equal(tabKeyTarget(k, 0, 3), -1, k);
    }
  });

  it("handles an empty tablist without wrapping arithmetic blowing up", () => {
    assert.equal(tabKeyTarget("ArrowRight", 0, 0), -1);
    assert.equal(tabKeyTarget("Home", 0, 0), -1);
  });

  it("stays put on a single tab", () => {
    assert.equal(tabKeyTarget("ArrowRight", 0, 1), 0);
    assert.equal(tabKeyTarget("ArrowLeft", 0, 1), 0);
  });
});
