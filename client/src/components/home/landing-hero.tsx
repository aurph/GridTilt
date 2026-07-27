/**
 * The intro: GridTilt types itself out, then the Tilt half tilts and takes
 * the orange. Clean paper, one line of grid-first mission copy, two doors.
 * The dashboard front page continues below.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";

const TEXT = "GridTilt";
const SPLIT = 4; // "Grid" | "Tilt"
const STEP_MS = 95;
const FIRST_DELAY_MS = 260;
const TILT_DELAY_MS = 300;
const CARET_FADE_DELAY_MS = 600;

export function LandingHero() {
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
          }, TILT_DELAY_MS + CARET_FADE_DELAY_MS);
        }
      }
      tick(1);
    }, FIRST_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(startTyping);
    };
  }, []);

  const visibleGrid = TEXT.slice(0, Math.min(count, SPLIT));
  const visibleTilt = TEXT.slice(SPLIT, count);

  return (
    <section
      className="relative flex h-[80vh] min-h-[520px] max-h-[860px] w-full flex-col items-center justify-center overflow-hidden border-b border-rule px-5 text-center"
      data-testid="landing-hero"
    >
      <h1
        className="font-serif text-[64px] leading-none tracking-[-0.01em] text-ink sm:text-[110px]"
        aria-label="GridTilt"
        data-testid="hero-wordmark"
      >
        <span>{visibleGrid}</span>
        <span
          className="inline-block origin-bottom transition-[transform,color] duration-500 ease-out"
          style={{
            transform: tilted ? "skewX(-9deg)" : "none",
            color: tilted ? "var(--brand-ink)" : "var(--ink)",
          }}
        >
          {visibleTilt}
        </span>
        <span
          aria-hidden
          className="ml-1 inline-block w-[0.06em] -translate-y-[0.06em] select-none bg-brand align-baseline transition-opacity duration-700"
          style={{ height: "0.72em", opacity: caretFading ? 0 : 1 }}
        />
      </h1>

      <div
        className="mt-7 transition-opacity duration-700"
        style={{ opacity: tilted ? 1 : 0 }}
      >
        <p className="text-[16px] font-semibold text-ink sm:text-[18px]">
          Energy infrastructure, in plain sight.
        </p>
        <p className="mx-auto mt-3 max-w-[52ch] text-[14.5px] leading-[1.65] text-ink-secondary sm:text-[15.5px]">
          Data centers are rewriting the American power grid. GridTilt maps who is building,
          where the electricity comes from, and what it means for the bill you pay.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-5">
          <Link
            href="/overview"
            className="bg-ink px-6 py-3 text-[14px] font-semibold text-paper no-underline transition-colors hover:bg-brand-ink"
            data-testid="hero-cta-today"
          >
            Open the dashboard →
          </Link>
          <Link
            href="/power-map"
            className="text-[14px] font-semibold text-ink no-underline hover:text-brand-ink"
            data-testid="hero-cta-map"
          >
            See the map →
          </Link>
        </div>
      </div>
    </section>
  );
}
