/**
 * The boundary's job is containment plus recovery. Recovery is the part that
 * silently rots: without it a caught error pins the visitor to a dead screen
 * for the rest of the session, because navigating does not remount the
 * boundary. resetOnKeyChange is that rule, tested without a DOM.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ErrorBoundary, resetOnKeyChange } from "../../components/error-boundary";

const err = new Error("boom");

describe("ErrorBoundary reset rule", () => {
  it("holds the error while the reset key is unchanged", () => {
    const state = { error: err, key: "/stack" };
    assert.equal(resetOnKeyChange({ children: null, resetKey: "/stack" }, state), null);
  });

  it("clears the error when the reset key changes (navigation recovers)", () => {
    const state = { error: err, key: "/stack" };
    const next = resetOnKeyChange({ children: null, resetKey: "/power-map" }, state);
    assert.deepEqual(next, { error: null, key: "/power-map" });
  });

  it("does nothing when there is no error to clear", () => {
    const state = { error: null, key: "/stack" };
    assert.equal(resetOnKeyChange({ children: null, resetKey: "/power-map" }, state), null);
  });

  it("treats an undefined reset key as a real value, not a wildcard", () => {
    // A boundary with no resetKey must not clear itself on every render.
    const state = { error: err, key: undefined };
    assert.equal(resetOnKeyChange({ children: null }, state), null);
  });

  it("maps a caught error into error state", () => {
    assert.deepEqual(ErrorBoundary.getDerivedStateFromError(err), { error: err });
  });

  it("renders children untouched when nothing has thrown", () => {
    const html = renderToStaticMarkup(
      <ErrorBoundary label="x">
        <p>live content</p>
      </ErrorBoundary>,
    );
    assert.equal(html, "<p>live content</p>");
  });
});
