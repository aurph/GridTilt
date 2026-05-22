import { useEffect, useState } from "react";

/**
 * Floating bottom-right chevron stack. Always visible during scroll. Clicking
 * scrolls down by ~85% of viewport height. Fades out when the user reaches
 * within 200px of the bottom of the page so it doesn't sit on top of the
 * footer.
 */
export function FloatingScrollCue() {
  const [nearBottom, setNearBottom] = useState(false);

  useEffect(() => {
    function handle() {
      const remaining =
        document.documentElement.scrollHeight -
        (window.scrollY + window.innerHeight);
      setNearBottom(remaining < 200);
    }
    handle();
    window.addEventListener("scroll", handle, { passive: true });
    window.addEventListener("resize", handle);
    return () => {
      window.removeEventListener("scroll", handle);
      window.removeEventListener("resize", handle);
    };
  }, []);

  function handleClick() {
    window.scrollBy({ top: window.innerHeight * 0.85, behavior: "smooth" });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Scroll down"
      className={`gt-chevrons-floating${nearBottom ? " is-near-bottom" : ""}`}
      data-testid="floating-scroll-cue"
    >
      <Chevron />
      <Chevron />
      <Chevron />
    </button>
  );
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
