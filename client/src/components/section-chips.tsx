/**
 * The chip row under a section heading: one pill per feature in the section.
 *
 * Each chip is a real link (`/grid?tab=queue`), so every view has an address
 * a visitor can share and a crawler can follow. The active chip is filled
 * brand orange with dark text; the rest are outlined. Chips that do not fit
 * the row collapse into a "+N more" chip that opens a short list; the active
 * chip always stays on the row. A scope control (a state, a range) can sit at
 * the right end as a small dropdown pill.
 *
 * Keyboard: the row is a tablist with a roving tab stop; arrows, Home and End
 * move between the chips on the row. The overflow list closes on Escape and
 * on a click outside it.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown } from "lucide-react";
import { tabKeyTarget } from "@/components/ToolTabs";
import { fitCount, splitChips } from "@/lib/sections";

export interface ChipItem {
  id: string;
  label: string;
  href: string;
}

const CHIP_BASE =
  "gt-chip inline-flex h-10 shrink-0 items-center sm:h-8 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-semibold leading-none no-underline";
const CHIP_ON = "border-[#F07800] bg-[#F07800] text-[#101010]";
const CHIP_OFF = "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground";
const GAP = 8;

/** Closes a popover on Escape or a pointer press outside `ref`. */
function useDismiss(open: boolean, ref: React.RefObject<HTMLElement>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref, close]);
}

export function SectionChips({
  chips,
  active,
  label,
  right,
  visibleCount,
  testId = "section-chips",
}: {
  chips: ChipItem[];
  active: string;
  /** accessible name for the row */
  label: string;
  /** scope control at the right end of the row */
  right?: ReactNode;
  /** Fixes how many chips show, instead of measuring. For tests. */
  visibleCount?: number;
  testId?: string;
}) {
  const [, navigate] = useLocation();
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [measured, setMeasured] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  useDismiss(open, moreRef, () => setOpen(false));

  // Measure against a hidden copy of the full row, so the count does not
  // depend on what is showing now.
  useLayoutEffect(() => {
    if (visibleCount !== undefined) return;
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;
    const update = () => {
      const kids = Array.from(measure.children) as HTMLElement[];
      const widths = kids.slice(0, chips.length).map((el) => el.offsetWidth);
      const moreWidth = kids[chips.length]?.offsetWidth ?? 84;
      setMeasured(fitCount(widths, row.clientWidth, moreWidth, GAP));
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(row);
    return () => ro.disconnect();
  }, [chips, visibleCount]);

  // A chip change closes the list.
  useEffect(() => setOpen(false), [active]);

  const count = visibleCount ?? measured ?? chips.length;
  const { visible, overflow } = splitChips(chips, active, count);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const current = visible.findIndex((c) => c.id === active);
    const target = tabKeyTarget(e.key, current, visible.length);
    if (target < 0) return;
    e.preventDefault();
    navigate(visible[target].href);
    tabRefs.current[target]?.focus();
  };

  return (
    <div className="flex items-center gap-2" data-testid={testId}>
      <div ref={rowRef} className="relative min-w-0 flex-1">
        <div className="flex items-center gap-2" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
          {visible.map((c, i) => {
            const selected = c.id === active;
            return (
              <Link
                key={c.id}
                href={c.href}
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                ref={(el: HTMLAnchorElement | null) => {
                  tabRefs.current[i] = el;
                }}
                className={`${CHIP_BASE} ${selected ? CHIP_ON : CHIP_OFF}`}
                data-testid={`chip-${c.id}`}
              >
                {c.label}
              </Link>
            );
          })}
          {overflow.length > 0 && (
            <div ref={moreRef} className="relative shrink-0">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className={`${CHIP_BASE} ${CHIP_OFF} gap-1`}
                data-testid="chip-more"
              >
                +{overflow.length} more
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </button>
              <div
                role="menu"
                aria-label={`More in ${label}`}
                data-open={open}
                className="gt-pop absolute left-0 top-full z-40 mt-2 min-w-[180px] rounded-xl border border-border bg-card p-1.5 shadow-2xl"
                data-testid="chip-more-menu"
              >
                {overflow.map((c) => (
                  <Link
                    key={c.id}
                    href={c.href}
                    role="menuitem"
                    tabIndex={open ? 0 : -1}
                    className="flex min-h-[40px] items-center rounded-lg px-3 text-[13px] font-medium text-muted-foreground no-underline hover:bg-muted/40 hover:text-foreground"
                    data-testid={`chip-more-${c.id}`}
                  >
                    {c.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* Hidden full row, measured to decide how many chips fit. */}
        {visibleCount === undefined && (
          <div
            ref={measureRef}
            aria-hidden
            className="pointer-events-none invisible absolute left-0 top-0 flex items-center gap-2"
          >
            {chips.map((c) => (
              <span key={c.id} className={`${CHIP_BASE} ${CHIP_OFF}`}>
                {c.label}
              </span>
            ))}
            <span className={`${CHIP_BASE} ${CHIP_OFF} gap-1`}>
              +{chips.length} more
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </span>
          </div>
        )}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

/** A small dropdown pill of links for the right end of the chip row. */
export function ChipMenu({
  label,
  items,
  testId = "chip-menu",
}: {
  label: string;
  items: { label: string; href: string; hint?: string }[];
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useDismiss(open, ref, () => setOpen(false));
  if (items.length === 0) return null;
  return (
    <div ref={ref} className="relative" data-testid={testId}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${CHIP_BASE} ${CHIP_OFF} gap-1`}
        data-testid={`${testId}-button`}
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      <div
        role="menu"
        aria-label={label}
        data-open={open}
        className="gt-pop absolute right-0 top-full z-40 mt-2 min-w-[190px] rounded-xl border border-border bg-card p-1.5 shadow-2xl"
      >
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            role="menuitem"
            tabIndex={open ? 0 : -1}
            onClick={() => setOpen(false)}
            className="flex min-h-[40px] items-center justify-between gap-4 rounded-lg px-3 text-[13px] font-medium text-muted-foreground no-underline hover:bg-muted/40 hover:text-foreground"
          >
            {it.label}
            {it.hint && <span className="font-mono text-[11px] text-muted-foreground/60">{it.hint}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
