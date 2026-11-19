/**
 * The row under a section heading: one tab per feature in the section.
 *
 * Every feature shows at once, on every screen, with an icon, its name and,
 * where there is room, one line saying what it holds. Each tab is a real link
 * (`/grid?tab=queue`), so every view has an address a visitor can share and a
 * crawler can follow. The open feature carries a filled orange icon and an
 * orange rule under it, the same mark the top bar puts under the open section.
 *
 * Layout is CSS (index.css, .gt-tabs): equal columns, and each tab arranges
 * itself by the width its column gives it. Nothing is measured in script and
 * nothing is folded into a menu.
 *
 * Keyboard: the row is a tablist with a roving tab stop; arrows, Home and End
 * move between the tabs.
 */
import { useRef, type CSSProperties } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  CalendarDays,
  ChartCandlestick,
  CircleDollarSign,
  Cpu,
  Gauge,
  Handshake,
  History,
  Hourglass,
  Map as MapIcon,
  SlidersHorizontal,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { tabKeyTarget } from "@/components/ToolTabs";

export interface FeatureTab {
  id: string;
  label: string;
  /** One short line: what the feature holds. */
  blurb: string;
  href: string;
}

/** One icon per feature id in lib/sections.ts. The section test fails on a feature without one. */
export const FEATURE_ICONS: Record<string, LucideIcon> = {
  map: MapIcon,
  queue: Hourglass,
  deals: Handshake,
  live: Activity,
  timeline: History,
  clusters: Cpu,
  "supply-chain": Workflow,
  "gpu-prices": CircleDollarSign,
  overview: Gauge,
  equities: ChartCandlestick,
  analyze: SlidersHorizontal,
  catalysts: CalendarDays,
};

export function FeatureTabs({
  tabs,
  active,
  label,
  testId = "feature-tabs",
}: {
  tabs: FeatureTab[];
  active: string;
  /** accessible name for the row */
  label: string;
  testId?: string;
}) {
  const [, navigate] = useLocation();
  const refs = useRef<Array<HTMLAnchorElement | null>>([]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const current = tabs.findIndex((t) => t.id === active);
    const target = tabKeyTarget(e.key, current, tabs.length);
    if (target < 0) return;
    e.preventDefault();
    navigate(tabs[target].href);
    refs.current[target]?.focus();
  };

  return (
    <div
      className="gt-tabs"
      style={{ "--gt-tabs": tabs.length } as CSSProperties}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      data-testid={testId}
    >
      {tabs.map((t, i) => {
        const on = t.id === active;
        const Icon = FEATURE_ICONS[t.id];
        return (
          <Link
            key={t.id}
            href={t.href}
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            ref={(el: HTMLAnchorElement | null) => {
              refs.current[i] = el;
            }}
            className="gt-tab group relative block min-w-0 rounded-t-md no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F07800]"
            data-testid={`feature-tab-${t.id}`}
          >
            <span className="gt-tab-body">
              <span
                aria-hidden
                className={`gt-tab-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                  on
                    ? "border-[#F07800] bg-[#F07800] text-[#101010]"
                    : "border-border text-muted-foreground group-hover:border-foreground/40 group-hover:text-foreground"
                }`}
              >
                {Icon && <Icon className="h-4 w-4" strokeWidth={2} />}
              </span>
              <span className="min-w-0 max-w-full">
                <span
                  className={`gt-tab-name block truncate font-semibold leading-tight ${
                    on ? "text-foreground" : "text-foreground/75 group-hover:text-foreground"
                  }`}
                >
                  {t.label}
                </span>
                <span className="gt-tab-blurb mt-0.5 truncate text-[12px] leading-tight text-muted-foreground">{t.blurb}</span>
              </span>
            </span>
            {on && <span aria-hidden className="absolute inset-x-0 -bottom-px h-[2px] bg-[#F07800]" />}
          </Link>
        );
      })}
    </div>
  );
}
