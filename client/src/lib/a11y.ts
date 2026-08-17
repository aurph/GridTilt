import type { KeyboardEvent } from "react";

/**
 * Keyboard access for elements that carry a click handler but are not buttons.
 *
 * The scan found 28 of these: rows, tags and cells that navigate on click and
 * cannot be reached from a keyboard at all. A real <button> would be better
 * semantics, but these are styled through hand-written CSS that sets display,
 * font and colour per class, so swapping the tag risks a visual regression on
 * ten sites at once. role + tabIndex + Enter/Space restores the behaviour that
 * was missing without touching the stylesheet.
 *
 * Where the element is genuinely not a control, the handler is left alone and
 * the finding is suppressed with a reason instead.
 */

/** Enter and Space activate a button. Nothing else does. */
export function isActivationKey(key: string): boolean {
  return key === "Enter" || key === " " || key === "Spacebar";
}

/**
 * Props that make a non-button element behave like one.
 *
 * Spread onto the element instead of a bare onClick. Space is prevented from
 * scrolling the page, which is what it does by default and why adding tabIndex
 * without a key handler makes things worse rather than better.
 */
export function activatable(onActivate: () => void, label?: string) {
  return {
    role: "button" as const,
    tabIndex: 0,
    "aria-label": label,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => {
      if (!isActivationKey(e.key)) return;
      e.preventDefault();
      onActivate();
    },
  };
}
