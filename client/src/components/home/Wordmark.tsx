import { useEffect, useState } from "react";

const TEXT = "GRIDTILT";
const SPLIT = 4; // "GRID" then "TILT"
const STEP_MS = 95;
const FIRST_DELAY_MS = 220;
const TILT_DELAY_MS = 260;
const CARET_FADE_MS = 280;

interface WordmarkProps {
  // Override the leadInMs to delay the start of typing (use when the wordmark
  // appears as part of a larger orchestrated entrance).
  leadInMs?: number;
}

/**
 * GRIDTILT wordmark. Types out terminal-style on mount, then the "TILT" half
 * rotates ~8° and turns #F07800 as the signature move.
 *
 * Respects prefers-reduced-motion (in CSS) — the final state still renders
 * tilted and orange but without the typing/rotation animation.
 */
export function Wordmark({ leadInMs = 0 }: WordmarkProps) {
  const [count, setCount] = useState(0);
  const [tilted, setTilted] = useState(false);
  const [caretFading, setCaretFading] = useState(false);

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setCount(TEXT.length);
      setTilted(true);
      setCaretFading(true);
      return;
    }

    let cancelled = false;

    const startTyping = setTimeout(() => {
      function tick(next: number) {
        if (cancelled) return;
        setCount(next);
        if (next < TEXT.length) {
          setTimeout(() => tick(next + 1), STEP_MS);
        } else {
          setTimeout(() => {
            if (!cancelled) setTilted(true);
          }, TILT_DELAY_MS);
          setTimeout(() => {
            if (!cancelled) setCaretFading(true);
          }, TILT_DELAY_MS + 240);
        }
      }
      tick(1);
    }, leadInMs + FIRST_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(startTyping);
    };
  }, [leadInMs]);

  const visibleGrid = TEXT.slice(0, Math.min(count, SPLIT));
  const visibleTilt = TEXT.slice(SPLIT, count);

  return (
    <h1
      className="gt-wordmark"
      aria-label="GridTilt"
      data-testid="home-wordmark"
    >
      <span className="gt-wordmark__half">{visibleGrid}</span>
      <span
        className={`gt-wordmark__half gt-wordmark__half--tilt${tilted ? " is-tilted" : ""}`}
      >
        {visibleTilt}
      </span>
      <span
        aria-hidden
        className={`gt-wordmark__caret${caretFading ? " is-fading" : ""}`}
      >
        ▌
      </span>
    </h1>
  );
}
