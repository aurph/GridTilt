/**
 * Consolidation primitive: URL-persisted tabs for folded tools.
 * ?tab=<id> round-trips so old routes can 301 into a specific tab and
 * views stay shareable (same pattern as the Neocloud chart params).
 *
 * role="tablist" is a promise about keyboard behaviour: arrows move between
 * tabs, Home and End jump to the ends, and Tab treats the group as one stop.
 * The markup claimed the role without honouring any of it, so a screen reader
 * user was told to press arrows and nothing happened. That is implemented here.
 *
 * Deliberately no aria-controls: the panels render in the page body while this
 * renders in the PageHeader controls slot, and on Power the map panel is a
 * bare fragment rather than an element. Pointing at ids that do not exist is
 * worse than omitting the attribute, so wiring the panels is its own change.
 */
import { useEffect, useRef, useState } from "react";

export interface ToolTab {
  id: string;
  label: string;
}

export function readTabParam(tabs: ToolTab[], fallback: string): string {
  const sp = new URLSearchParams(window.location.search);
  const t = sp.get("tab");
  return tabs.some((x) => x.id === t) ? (t as string) : fallback;
}

export function useToolTabs(tabs: ToolTab[], fallback: string): [string, (id: string) => void] {
  const [active, setActive] = useState(() => readTabParam(tabs, fallback));
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (active === fallback) sp.delete("tab");
    else sp.set("tab", active);
    const qs = sp.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [active, fallback]);
  return [active, setActive];
}

/**
 * Which tab an arrow key moves to. Wraps at both ends, which is what the
 * tablist pattern specifies. Returns -1 for keys the tablist does not handle,
 * so the caller leaves them alone.
 */
export function tabKeyTarget(key: string, current: number, count: number): number {
  if (count === 0) return -1;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (current + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return -1;
  }
}

export function ToolTabs({
  tabs,
  active,
  onChange,
  className = "",
  label = "Views",
}: {
  tabs: ToolTab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
  /** accessible name for the tablist itself */
  label?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const current = tabs.findIndex((t) => t.id === active);
    const target = tabKeyTarget(e.key, current, tabs.length);
    if (target < 0) return;
    e.preventDefault();
    onChange(tabs[target].id);
    refs.current[target]?.focus();
  };

  return (
    <div
      className={`flex items-center gap-1.5 ${className}`}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {tabs.map((t, i) => {
        const selected = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={selected}
            // Roving tabindex: Tab enters the group once and lands on the
            // selected tab; arrows move within it.
            tabIndex={selected ? 0 : -1}
            ref={(el) => {
              refs.current[i] = el;
            }}
            onClick={() => onChange(t.id)}
            className={`px-3 py-1 rounded border text-xs font-mono font-semibold transition-colors ${
              selected
                ? "border-brand/60 text-brand bg-brand/10"
                : "border-subtle text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tool-tab-${t.id}`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
