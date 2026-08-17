// 28 click handlers sat on non-interactive elements, unreachable from a
// keyboard. These pin the contract the replacement has to keep.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isActivationKey, activatable } from "../a11y";

test("Enter and Space activate, nothing else does", () => {
  for (const k of ["Enter", " ", "Spacebar"]) {
    assert.equal(isActivationKey(k), true, `${JSON.stringify(k)} should activate`);
  }
  for (const k of ["Tab", "Escape", "a", "ArrowDown", "Shift", ""]) {
    assert.equal(isActivationKey(k), false, `${JSON.stringify(k)} must not activate`);
  }
});

test("the element is reachable and announced as a button", () => {
  const props = activatable(() => {});
  assert.equal(props.role, "button");
  assert.equal(props.tabIndex, 0, "without this it is still unreachable");
});

test("a click still works", () => {
  let fired = 0;
  const props = activatable(() => { fired += 1; });
  props.onClick();
  assert.equal(fired, 1);
});

test("Enter fires the same handler as a click", () => {
  let fired = 0;
  const props = activatable(() => { fired += 1; });
  let prevented = false;
  props.onKeyDown({ key: "Enter", preventDefault: () => { prevented = true; } } as never);
  assert.equal(fired, 1);
  assert.equal(prevented, true);
});

test("Space activates and does not scroll the page", () => {
  // tabIndex without this makes things worse: the element takes focus and then
  // Space scrolls instead of activating.
  let fired = 0;
  let prevented = false;
  const props = activatable(() => { fired += 1; });
  props.onKeyDown({ key: " ", preventDefault: () => { prevented = true; } } as never);
  assert.equal(fired, 1);
  assert.equal(prevented, true, "Space must be prevented from scrolling");
});

test("other keys do nothing and are not swallowed", () => {
  let fired = 0;
  let prevented = false;
  const props = activatable(() => { fired += 1; });
  for (const key of ["Tab", "Escape", "ArrowRight"]) {
    props.onKeyDown({ key, preventDefault: () => { prevented = true; } } as never);
  }
  assert.equal(fired, 0);
  assert.equal(prevented, false, "Tab must still move focus");
});

test("a label is attached when the element has no text of its own", () => {
  assert.equal(activatable(() => {}, "Open NVDA")["aria-label"], "Open NVDA");
  assert.equal(activatable(() => {})["aria-label"], undefined);
});
