/**
 * The boundary's job is containment plus recovery.
 *
 * The tests that matter here replay React's real call order, because testing
 * resetOnKeyChange on a hand-built state object hid a fatal bug once already:
 * the reset guard skipped adopting the key during clean renders, so the first
 * caught error was cleared by the very next getDerivedStateFromProps, the
 * children re-threw, and React unmounted the whole tree. The boundary became
 * the blank page it exists to prevent, and a unit test on the pure function
 * alone still passed.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ErrorBoundary, resetOnKeyChange } from "../../components/error-boundary";

const err = new Error("boom");

/** Replay React's sequence: gDSFP before every render, gDSFE on a throw. */
function simulate(steps: Array<{ resetKey?: unknown; throws?: boolean }>) {
  let state = { error: null as Error | null, key: undefined as unknown };
  const rendered: string[] = [];
  for (const step of steps) {
    const props = { children: null, resetKey: step.resetKey };
    const derived = resetOnKeyChange(props, state);
    if (derived) state = derived;
    if (step.throws) {
      state = { ...state, ...ErrorBoundary.getDerivedStateFromError(err) };
      // React re-renders after catching; gDSFP runs again first.
      const again = resetOnKeyChange(props, state);
      if (again) state = again;
    }
    rendered.push(state.error ? "error-state" : "children");
  }
  return { state, rendered };
}

describe("ErrorBoundary lifecycle", () => {
  it("holds the error through the re-render that follows catching it", () => {
    // The regression: this used to come back "children", loop, and unmount.
    const { rendered } = simulate([{ resetKey: "/subscribe" }, { resetKey: "/subscribe", throws: true }]);
    assert.deepEqual(rendered, ["children", "error-state"]);
  });

  it("still shows the error on later renders at the same route", () => {
    const { rendered } = simulate([
      { resetKey: "/subscribe" },
      { resetKey: "/subscribe", throws: true },
      { resetKey: "/subscribe" },
      { resetKey: "/subscribe" },
    ]);
    assert.deepEqual(rendered, ["children", "error-state", "error-state", "error-state"]);
  });

  it("recovers when the route changes", () => {
    const { rendered } = simulate([
      { resetKey: "/subscribe" },
      { resetKey: "/subscribe", throws: true },
      { resetKey: "/stack" },
    ]);
    assert.deepEqual(rendered, ["children", "error-state", "children"]);
  });

  it("contains a throw on a boundary with no resetKey (chrome)", () => {
    const { rendered } = simulate([{}, { throws: true }, {}]);
    assert.deepEqual(rendered, ["children", "error-state", "error-state"]);
  });
});

describe("resetOnKeyChange", () => {
  it("adopts the key on a clean render so the error has something to match", () => {
    assert.deepEqual(resetOnKeyChange({ children: null, resetKey: "/a" }, { error: null, key: undefined }), {
      error: null,
      key: "/a",
    });
  });

  it("holds the error while the key is unchanged", () => {
    assert.equal(resetOnKeyChange({ children: null, resetKey: "/a" }, { error: err, key: "/a" }), null);
  });

  it("clears the error when the key changes", () => {
    assert.deepEqual(resetOnKeyChange({ children: null, resetKey: "/b" }, { error: err, key: "/a" }), {
      error: null,
      key: "/b",
    });
  });

  it("maps a caught error into error state", () => {
    assert.deepEqual(ErrorBoundary.getDerivedStateFromError(err), { error: err });
  });
});

describe("ErrorBoundary rendering", () => {
  it("renders children untouched when nothing has thrown", () => {
    assert.equal(
      renderToStaticMarkup(
        <ErrorBoundary label="x">
          <p>live content</p>
        </ErrorBoundary>,
      ),
      "<p>live content</p>",
    );
  });
});
