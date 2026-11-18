/**
 * The map's two small controls: Layers (what draws) and the legend (what the
 * marks mean). Both stay compact on purpose: the map is the content. On a
 * phone the Layers list opens as a bottom sheet and the legend starts closed.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Layers, X } from "lucide-react";
import { NERC_LTRA } from "@/data/nerc-reserve-margins";
import { RISK_COLOR } from "@/components/map/region-layer";
import { SITE_COLOR } from "@/components/map/points-layer";
import { PLANT_FUEL_GROUPS, fuelColor } from "@/lib/fuel-colors";
import { LAYER_LABEL, MAP_LAYERS, type MapLayer } from "@/lib/map-layers";
import { INK, STATUS_COLORS } from "@/lib/tokens";

/** The mark each layer draws with, small enough for a list row. */
export function LayerSwatch({ layer }: { layer: MapLayer }) {
  if (layer === "campuses") {
    return (
      <span className="relative inline-flex h-3.5 w-3.5 items-center justify-center" aria-hidden>
        <span className="absolute h-3.5 w-3.5 rounded-full opacity-30" style={{ backgroundColor: STATUS_COLORS.operational }} />
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLORS.operational }} />
      </span>
    );
  }
  if (layer === "sites") {
    return (
      <span className="inline-flex h-3.5 w-3.5 items-center justify-center" aria-hidden>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SITE_COLOR, boxShadow: `0 0 0 3px ${SITE_COLOR}22` }} />
      </span>
    );
  }
  if (layer === "clusters") {
    return (
      <span className="inline-flex h-3.5 w-3.5 items-center justify-center" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-full border-[1.5px]" style={{ borderColor: STATUS_COLORS.construction }} />
      </span>
    );
  }
  if (layer === "plants") {
    return (
      <span className="inline-flex h-3.5 w-3.5 items-center justify-center" aria-hidden>
        <span className="h-2 w-2 rotate-45" style={{ backgroundColor: fuelColor("NUC") }} />
      </span>
    );
  }
  return (
    <span className="inline-flex h-3.5 w-3.5 items-center justify-center" aria-hidden>
      <span className="h-2.5 w-3 rounded-[2px] border" style={{ borderColor: "rgba(255,255,255,0.45)", backgroundColor: "rgba(255,255,255,0.08)" }} />
    </span>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative inline-flex h-[14px] w-[24px] shrink-0 rounded-full transition-colors ${on ? "bg-brand" : "bg-white/15"}`}
    >
      <span className={`absolute top-[2px] h-[10px] w-[10px] rounded-full bg-white transition-transform ${on ? "translate-x-[12px]" : "translate-x-[2px]"}`} />
    </span>
  );
}

export function LayersControl({
  layers,
  stress,
  counts,
  loading,
  onToggle,
  onStress,
  children,
}: {
  layers: readonly MapLayer[];
  stress: boolean;
  /** How many marks each layer holds; absent while its data loads. */
  counts: Partial<Record<MapLayer, number>>;
  loading: Partial<Record<MapLayer, boolean>>;
  onToggle: (layer: MapLayer) => void;
  onStress: (on: boolean) => void;
  /** Extra rows under the list (the campus size filter). */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      // The phone sheet has its own backdrop; this closes the desktop popover.
      if (window.matchMedia("(min-width: 640px)").matches && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const list = (
    <div className="space-y-0.5" role="group" aria-label="Map layers">
      {MAP_LAYERS.map((layer) => {
        const on = layers.includes(layer);
        const n = counts[layer];
        return (
          <button
            key={layer}
            type="button"
            role="switch"
            aria-checked={on}
            onClick={() => onToggle(layer)}
            className="flex min-h-[36px] w-full items-center gap-2.5 rounded px-2 text-left text-[12.5px] transition-colors hover:bg-white/[0.06] sm:min-h-[30px] sm:text-xs"
            data-testid={`layer-toggle-${layer}`}
          >
            <LayerSwatch layer={layer} />
            <span className={on ? "text-white/90" : "text-white/45"}>{LAYER_LABEL[layer]}</span>
            <span className="ml-auto font-mono text-10 tabular-nums text-white/40">
              {loading[layer] ? "…" : typeof n === "number" ? n.toLocaleString("en-US") : ""}
            </span>
            <Switch on={on} />
          </button>
        );
      })}
      <div className="my-1.5 border-t border-subtle" />
      <button
        type="button"
        role="switch"
        aria-checked={stress}
        disabled={!layers.includes("regions")}
        onClick={() => onStress(!stress)}
        className="flex min-h-[36px] w-full items-center gap-2.5 rounded px-2 text-left text-[12.5px] transition-colors hover:bg-white/[0.06] disabled:opacity-40 sm:min-h-[30px] sm:text-xs"
        title="Color each region by NERC's 2026 risk level"
        data-testid="layer-toggle-stress"
      >
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center" aria-hidden>
          <span className="h-2.5 w-3 rounded-[2px]" style={{ background: `linear-gradient(90deg, ${RISK_COLOR.Normal}, ${RISK_COLOR.Elevated}, ${RISK_COLOR.High})` }} />
        </span>
        <span className={stress ? "text-white/90" : "text-white/45"}>Color regions by stress</span>
        <span className="ml-auto" />
        <Switch on={stress} />
      </button>
      {children}
    </div>
  );

  const onCount = layers.length;
  return (
    <div ref={ref} className="relative" data-testid="layers-control">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-2 rounded-md border border-subtle bg-surface-raised/90 px-3 py-1.5 text-xs text-white/70 shadow-lg backdrop-blur-md transition-colors hover:text-white"
        data-testid="layers-button"
      >
        <Layers className="h-3.5 w-3.5" aria-hidden />
        <span>Layers</span>
        <span className="font-mono text-10 text-white/40">
          {onCount}/{MAP_LAYERS.length}
        </span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && (
        <>
          {/* Desktop: a popover under the button. */}
          <div
            className="absolute right-0 top-full z-[1100] mt-2 hidden w-[264px] rounded-lg border border-subtle bg-surface-raised/95 p-2 shadow-2xl backdrop-blur-md sm:block"
            role="dialog"
            aria-label="Layers"
            data-testid="layers-panel"
          >
            {list}
          </div>
          {/* Phone: a bottom sheet. */}
          <div className="fixed inset-0 z-[1200] sm:hidden" role="dialog" aria-label="Layers" data-testid="layers-sheet">
            <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-hidden />
            <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-xl border-t border-subtle bg-surface-raised p-4 pb-8">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-white">Layers</span>
                <button type="button" onClick={() => setOpen(false)} className="rounded p-2 hover:bg-white/10" aria-label="Close layers">
                  <X className="h-4 w-4 text-white/60" />
                </button>
              </div>
              {list}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LegendRow({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-10 text-white/60">
      <span className="inline-flex w-4 shrink-0 items-center justify-center">{swatch}</span>
      <span>{children}</span>
    </div>
  );
}

/** What the marks mean, for the layers that are on. Small, and it folds away. */
export function MapLegend({
  layers,
  stress,
  plantFuels,
  defaultOpen,
}: {
  layers: readonly MapLayer[];
  stress: boolean;
  /** Fuel codes present among the plants drawn, so the legend lists only those. */
  plantFuels: string[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const fuels = PLANT_FUEL_GROUPS.filter((g) => g.codes.some((c) => plantFuels.includes(c)));
  const showsPoints = layers.some((l) => l !== "regions");
  if (!showsPoints && !(stress && layers.includes("regions"))) return null;

  return (
    <div className="pointer-events-auto rounded-lg border border-subtle bg-surface-raised/90 shadow-lg backdrop-blur-md" data-testid="map-legend">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-10 text-white/55 hover:text-white/80"
        data-testid="map-legend-toggle"
      >
        <span className="font-semibold uppercase tracking-wide">Legend</span>
        <ChevronDown className={`ml-auto h-3 w-3 transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden />
      </button>
      {open && (
        <div className="space-y-1 px-3 pb-2.5">
          {layers.includes("campuses") && (
            <>
              <LegendRow swatch={<LayerSwatch layer="campuses" />}>Tracked campus, sized by MW</LegendRow>
              <div className="flex items-center gap-2.5 pl-6 text-9 text-white/45">
                {(["operational", "construction", "announced"] as const).map((s) => (
                  <span key={s} className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[s] }} />
                    {s === "operational" ? "running" : s === "construction" ? "being built" : "announced"}
                  </span>
                ))}
              </div>
            </>
          )}
          {layers.includes("sites") && <LegendRow swatch={<LayerSwatch layer="sites" />}>Data center site, location only</LegendRow>}
          {layers.includes("clusters") && <LegendRow swatch={<LayerSwatch layer="clusters" />}>AI cluster, sized by planned MW</LegendRow>}
          {layers.includes("plants") && fuels.length > 0 && (
            <>
              <LegendRow swatch={<LayerSwatch layer="plants" />}>Power plant, sized by MW</LegendRow>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pl-6 text-9 text-white/45">
                {fuels.map((g) => (
                  <span key={g.label} className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className="h-1.5 w-1.5 rotate-45" style={{ backgroundColor: g.codes[0] === "COL" ? INK.secondary : fuelColor(g.codes[0]) }} />
                    {g.label}
                  </span>
                ))}
              </div>
            </>
          )}
          {stress && layers.includes("regions") && (
            <div className="pt-1">
              <p className="text-10 text-white/55">Region color: NERC risk, 2026</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-9 text-white/50">
                {(["High", "Elevated", "Normal", "mixed"] as const).map((k) => (
                  <span key={k} className="flex items-center gap-1">
                    <span className="h-2 w-3 rounded-sm" style={{ backgroundColor: RISK_COLOR[k], opacity: 0.75 }} />
                    {k === "mixed" ? "differs by area" : k}
                  </span>
                ))}
              </div>
              <p className="mt-1 max-w-[230px] text-9 leading-snug text-white/35">
                <a href={NERC_LTRA.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2">
                  {NERC_LTRA.short}
                </a>
                . NERC rates each area against its own reference margin.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
