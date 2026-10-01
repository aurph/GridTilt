import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Search } from "lucide-react";
import {
  PAGE_ENTRIES,
  clusterEntries,
  rankEntries,
  researchEntries,
  stateEntries,
  stockEntries,
  type ArticleLike,
  type ClusterLike,
  type PaletteEntry,
} from "@/lib/palette";
import { STATE_GRID } from "@/data/state-grid";
import { supplyNodes } from "@/data/supply-chain-config";

/**
 * Quick-open (Cmd+K / Ctrl+K): search what already exists and go there.
 * Pages and states are static; clusters and research load from their
 * file-backed endpoints on first open. No quote APIs are touched, so an
 * open palette costs two cached JSON reads at most.
 *
 * Self-contained on purpose: it owns its hotkey and the
 * "gt-open-palette" event, so App.tsx only mounts it and the G-chord
 * handler stays untouched.
 */

const CATEGORY_TAG: Record<PaletteEntry["category"], string> = {
  page: "page",
  state: "my grid",
  stock: "stock",
  cluster: "cluster",
  research: "research",
};

const MY_GRID_STATE_KEY = "gt-my-grid-state";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("gt-open-palette", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("gt-open-palette", onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // The input mounts with the panel; focus it once it exists.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const { data: clusters } = useQuery<ClusterLike[]>({
    queryKey: ["/api/clusters"],
    enabled: open,
  });
  const { data: articles } = useQuery<ArticleLike[]>({
    queryKey: ["/api/blog"],
    enabled: open,
  });

  const entries = useMemo(
    () => [
      ...PAGE_ENTRIES,
      ...stateEntries(STATE_GRID),
      ...stockEntries(supplyNodes),
      ...clusterEntries(clusters ?? []),
      ...researchEntries(articles ?? []),
    ],
    [clusters, articles],
  );

  const results = useMemo(() => rankEntries(entries, query), [entries, query]);
  const activeEntry = results[Math.min(active, results.length - 1)] ?? null;

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!activeEntry || !listRef.current) return;
    listRef.current
      .querySelector(`[data-entry-id="${CSS.escape(activeEntry.id)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeEntry]);

  function go(entry: PaletteEntry) {
    if (entry.category === "state") {
      // Same key the My Grid page reads on mount; selection failing to
      // persist still lands the user on the page.
      try {
        localStorage.setItem(MY_GRID_STATE_KEY, entry.id.replace("state-", ""));
      } catch {
        /* storage blocked */
      }
    }
    setOpen(false);
    navigate(entry.href);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/60"
      onMouseDown={() => setOpen(false)}
      data-testid="command-palette"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search GridTilt"
        className="mx-auto mt-[12vh] w-[min(92vw,560px)] overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="palette-listbox"
            aria-activedescendant={activeEntry ? `palette-option-${activeEntry.id}` : undefined}
            aria-label="Search pages, states, tickers, clusters, and research"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && activeEntry) {
                e.preventDefault();
                go(activeEntry);
              }
            }}
            placeholder="Search pages, states, tickers, clusters…"
            className="w-full bg-transparent py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            data-testid="palette-input"
          />
          <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-10 text-muted-foreground">
            esc
          </kbd>
        </div>

        {results.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground" data-testid="palette-empty">
            Nothing matches "{query}".
          </p>
        ) : (
          <ul
            id="palette-listbox"
            role="listbox"
            aria-label="Results"
            ref={listRef}
            className="max-h-[46vh] overflow-y-auto py-1"
            data-testid="palette-results"
          >
            {results.map((r) => {
              const isActive = r.id === activeEntry?.id;
              return (
                <li
                  key={r.id}
                  id={`palette-option-${r.id}`}
                  role="option"
                  aria-selected={isActive}
                  data-entry-id={r.id}
                  onMouseEnter={() => setActive(results.indexOf(r))}
                  onMouseDown={(e) => {
                    // Mousedown, not click: the input keeps focus and the
                    // overlay's own mousedown-to-close never sees it.
                    e.preventDefault();
                    go(r);
                  }}
                  className={`flex cursor-pointer items-baseline gap-3 px-4 py-2 ${
                    isActive ? "bg-brand/10" : ""
                  }`}
                  data-testid={`palette-option-${r.id}`}
                >
                  <span className="min-w-0 truncate text-sm text-foreground">{r.label}</span>
                  {r.hint && (
                    <span className="min-w-0 truncate text-xs text-muted-foreground">{r.hint}</span>
                  )}
                  <span className="ml-auto shrink-0 font-mono text-10 uppercase tracking-wider text-muted-foreground/60">
                    {CATEGORY_TAG[r.category]}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
