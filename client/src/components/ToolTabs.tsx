/**
 * Consolidation primitive: URL-persisted tabs for folded tools.
 * ?tab=<id> round-trips so old routes can 301 into a specific tab and
 * views stay shareable (same pattern as the Neocloud chart params).
 */
import { useEffect, useState } from "react";

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

export function ToolTabs({
  tabs,
  active,
  onChange,
  className = "",
}: {
  tabs: ToolTab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-5 border-b border-rule ${className}`}
      role="tablist"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`relative pb-2 text-[13.5px] leading-none transition-colors duration-fast ${
            active === t.id
              ? "font-semibold text-brand-ink"
              : "text-ink-secondary hover:text-ink"
          }`}
          data-testid={`tool-tab-${t.id}`}
        >
          {t.label}
          {active === t.id && (
            <span aria-hidden className="absolute inset-x-0 -bottom-px h-[2px] bg-brand" />
          )}
        </button>
      ))}
    </div>
  );
}
