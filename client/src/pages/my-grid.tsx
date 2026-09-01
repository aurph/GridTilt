/**
 * My Grid: the buildout where you live. Map first - national view until a
 * state is chosen, then the state boundary with every tracked facility in
 * and around it - followed by the operator's headroom, the region's queue,
 * the facility list, and residential rates. State choice persists locally;
 * nothing leaves the browser.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MapContainer, TileLayer, CircleMarker, GeoJSON as GeoJSONLayer, Tooltip as MapTooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Feature, FeatureCollection } from "geojson";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AsOf, ErrorState, SrChartTable } from "@/components/Freshness";
import { PageHeader } from "@/components/PageHeader";
import { RTO_CONFIG, RTO_SOURCE_NOTE, type RTOConfig } from "@/data/rto-config";
import { STATE_GRID, STATE_GRID_SOURCE } from "@/data/state-grid";
import { BORDER, BRAND, CATEGORY_COLORS, FONT, INK, SEMANTIC, STATUS_COLORS, SURFACE } from "@/lib/tokens";
import { seriesMotion, axisProps, gridProps, tooltipContentStyle, tooltipItemStyle, tooltipLabelStyle,  } from "@/lib/chart-theme";
// US state boundaries: US Census cartographic boundary file (public domain),
// via the widely used us-states GeoJSON distribution.
import statesGeoRaw from "@/data/us-states.geo.json";

const statesGeo = statesGeoRaw as unknown as FeatureCollection;

const STORAGE_KEY = "gt-my-grid-state";

// Same threshold the Power map honors: only hyperscale-class sites. The
// captions on this page promise 400 MW and up, so the filter enforces it.
const MIN_TRACKED_MW = 400;

interface Facility {
  id: number;
  name: string;
  company: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  powerMW: number | null;
  status: string;
}

interface RatePoint {
  month: string;
  centsPerKwh: number;
}

type RetailRates =
  | { configured: false; howTo: string }
  | { configured: true; unit: string; source: string; sourceUrl: string; byState: Record<string, RatePoint[]> };

interface QueueProject {
  id?: string;
  iso: string;
  projectName?: string;
  capacityMW: number | null;
  type?: string;
  category?: string;
}

/**
 * Terse captions for the regional queue aggregates, stated as the source
 * states them (name, count, and as-of are facts from the row's sources).
 */
const AGG_PRESENTATION: Record<string, { label: string; note: string }> = {
  "pjm-transition-cycle-1": { label: "In the PJM queue", note: "811 active projects · PJM, Apr 2026" },
  "ercot-large-load": { label: "Large loads waiting in ERCOT", note: "72.9% data centers · ERCOT, late 2025" },
  "miso-active-queue": { label: "In the MISO queue", note: "910 active projects · MISO" },
  "caiso-active-queue": { label: "In the CAISO queue", note: "largest single-ISO queue · LBNL 2025" },
  "noniso-west": { label: "Queued in the non-ISO West", note: "largest US queue volume · LBNL 2025" },
};

interface QueueResponse {
  projects: QueueProject[];
}

// ── Live grid snapshot (server proxies each ISO's keyless public feeds) ──

interface LiveFuelSlice {
  fuel: string;
  mw: number;
}
interface GridLiveSnapshot {
  rto: string;
  operator: string;
  asOf: string;
  demand: { time: string; mw: number }[];
  currentDemandMW: number;
  peakDemandMW: number;
  fuelMix: LiveFuelSlice[];
  source: string;
  sourceUrl: string;
}

/** States with a keyless live feed today. Everything else joins via EIA
 *  hourly data once EIA_API_KEY is configured. */
function liveRtoFor(state: string, region: string | null): "ercot" | "caiso" | "miso" | null {
  if (state === "TX") return "ercot";
  if (state === "CA") return "caiso";
  if (region === "MISO") return "miso";
  return null;
}

// Dot colors reuse the sitewide energy vocabulary; unlisted fuels stay muted
// and every row is labeled, so color never carries identity alone.
const LIVE_FUEL_COLOR: Record<string, string> = {
  gas: CATEGORY_COLORS.gas,
  coal: CATEGORY_COLORS.coal,
  nuclear: CATEGORY_COLORS.nuclear,
  wind: CATEGORY_COLORS.wind,
  solar: CATEGORY_COLORS.solar,
  hydro: CATEGORY_COLORS.hydro,
  storage: CATEGORY_COLORS.storage,
};

const fmtGw = (mw: number) => `${(mw / 1000).toFixed(1)} GW`;
const fmtFuelMw = (mw: number) =>
  Math.abs(mw) >= 1000 ? fmtGw(mw) : `${Math.round(mw).toLocaleString()} MW`;

/** Which LBNL queue buckets correspond to a state's mapped region. */
const QUEUE_ISOS: Record<string, string[]> = {
  PJM: ["PJM"],
  MISO: ["MISO"],
  ERCOT: ["ERCOT"],
  SERC: ["SERC"],
  SPP: ["SPP"],
  WECC: ["WECC", "Non-ISO West"],
  NPCC: ["NYISO", "ISO-NE"],
};

/** Same stress ramp the Power map uses: SEMANTIC state colors, one truth. */
const SIGNAL_COLOR: Record<RTOConfig["aiSignal"], string> = {
  Critical: SEMANTIC.negativeDeep,
  Elevated: SEMANTIC.warning,
  Moderate: SEMANTIC.positiveDeep,
  Low: SEMANTIC.positive,
};

const STATUS_LABEL: Record<string, string> = {
  operational: "Operational",
  construction: "Under construction",
  announced: "Announced",
};

const STATUS_OPACITY: Record<string, number> = {
  operational: 0.9,
  construction: 0.55,
  announced: 0.3,
};

function fmtMonth(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

/** Fly the map to the selected state's bounds (or the continental US). */
function MapFocus({ feature }: { feature: Feature | null }) {
  const map = useMap();
  useEffect(() => {
    if (feature) {
      map.fitBounds(L.geoJSON(feature).getBounds().pad(0.35), { animate: true, duration: 0.8 });
    } else {
      map.fitBounds(L.latLngBounds([24.5, -125], [49.5, -66.5]), { animate: false });
    }
  }, [feature, map]);
  return null;
}

function MyGridMap({
  stateCode,
  stateName,
  facilities,
}: {
  stateCode: string;
  stateName: string | null;
  facilities: Facility[];
}) {
  const feature = useMemo(
    () => (stateName ? statesGeo.features.find((f) => (f.properties as { name?: string })?.name === stateName) ?? null : null),
    [stateName],
  );

  return (
    <Card className="my-grid-map border-card-border overflow-hidden" data-testid="my-grid-map">
      <div className="h-[440px] w-full isolate z-0">
        <MapContainer
          center={[38.5, -96]}
          zoom={4}
          zoomControl
          scrollWheelZoom={false}
          attributionControl
          className="h-full w-full"
          style={{ background: SURFACE.base }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          {feature && (
            <GeoJSONLayer
              key={stateCode}
              data={feature}
              style={{ color: BRAND.primary, weight: 2, fillColor: BRAND.primary, fillOpacity: 0.04 }}
            />
          )}
          {facilities.map((f) => {
            // No state chosen: every facility is in view, so all render in
            // brand orange. Once a state is picked, out-of-state dims to gray.
            const noneChosen = stateCode === "";
            const inState = noneChosen || f.state === stateCode;
            return (
              <CircleMarker
                key={f.id}
                center={[f.lat, f.lng]}
                radius={inState ? Math.max(noneChosen ? 4 : 6, Math.min(noneChosen ? 9 : 14, Math.sqrt(f.powerMW ?? 100) / (noneChosen ? 3.4 : 2.6))) : 4}
                pathOptions={{
                  color: inState ? BRAND.primary : INK.faint,
                  weight: 1,
                  fillColor: inState ? BRAND.primary : INK.faint,
                  fillOpacity: inState ? (STATUS_OPACITY[f.status] ?? 0.3) : 0.35,
                }}
              >
                <MapTooltip>
                  <span className="text-11 font-mono">
                    {f.name} · {f.company}
                    {f.powerMW ? ` · ${f.powerMW} MW` : ""} · {STATUS_LABEL[f.status] ?? f.status}
                  </span>
                </MapTooltip>
              </CircleMarker>
            );
          })}
          <MapFocus feature={feature} />
        </MapContainer>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-border px-4 py-2">
        <span className="text-11 text-muted-foreground">
          {stateName
            ? `Tracked facilities in and around ${stateName}; neighbors in gray`
            : "Every tracked US facility; pick a state to zoom in"}
        </span>
        <span className="text-10 font-mono text-muted-foreground/60">size = capacity · solid = operational, faint = announced</span>
      </div>
    </Card>
  );
}

/** Small label above a stat or panel cell. */
function CellLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground">{children}</p>;
}

export default function MyGrid() {
  const [state, setState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved && STATE_GRID[saved] ? saved : "";
    } catch {
      return "";
    }
  });

  function chooseState(code: string) {
    setState(code);
    try {
      if (code) localStorage.setItem(STORAGE_KEY, code);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage blocked; selection still works for the session */
    }
  }

  const {
    data: facilitiesRaw,
    isLoading: facilitiesLoading,
    isError: facilitiesError,
    refetch: refetchFacilities,
    dataUpdatedAt,
  } = useQuery<Facility[]>({
    queryKey: ["/api/datacenters"],
    refetchInterval: 900000,
  });

  // Honor the 400 MW threshold everywhere on this page, same as the Power map.
  const facilities = useMemo(
    () => (facilitiesRaw ?? []).filter((f) => (f.powerMW ?? 0) >= MIN_TRACKED_MW),
    [facilitiesRaw],
  );

  const { data: queue } = useQuery<QueueResponse>({ queryKey: ["/api/queue"] });

  const {
    data: rates,
    isError: ratesError,
    refetch: refetchRates,
  } = useQuery<RetailRates>({
    queryKey: ["/api/physical/retail-rates"],
    // 503 = honestly unconfigured, still a payload we render; only network
    // failures should register as errors.
    queryFn: async () => {
      const res = await fetch("/api/physical/retail-rates");
      if (!res.ok && res.status !== 503) throw new Error(`retail-rates ${res.status}`);
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
  });

  const grid = state ? STATE_GRID[state] : null;
  const rto = grid?.region ? RTO_CONFIG[grid.region] : null;

  const liveRto = grid ? liveRtoFor(state, grid.region) : null;
  const {
    data: live,
    isError: liveError,
    refetch: refetchLive,
  } = useQuery<GridLiveSnapshot>({
    queryKey: [`/api/grid-live/${liveRto}`],
    enabled: !!liveRto,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/grid-live/${liveRto}`);
      if (!res.ok) throw new Error(`grid-live ${res.status}`);
      return res.json();
    },
  });

  const localFacilities = useMemo(() => {
    if (!state) return [];
    return facilities
      .filter((f) => f.state === state)
      .sort((a, b) => (b.powerMW ?? 0) - (a.powerMW ?? 0));
  }, [facilities, state]);

  const regionQueue = useMemo(() => {
    if (!queue?.projects || !grid) return null;
    const isos = state === "CA" ? ["CAISO"] : (grid.region ? QUEUE_ISOS[grid.region] ?? [] : []);
    if (isos.length === 0) return null;
    const rows = queue.projects.filter((p) => isos.includes(p.iso));
    // Aggregate rows are whole-queue figures with their own sources; named
    // rows are individual projects. Never sum across the two. Present the
    // known aggregate for the region with its own caption, else sum the
    // named projects.
    const agg = rows.find((p) => p.category === "aggregate" && p.id && AGG_PRESENTATION[p.id]);
    if (agg?.capacityMW && agg.id) {
      return { kind: "total" as const, mw: agg.capacityMW, ...AGG_PRESENTATION[agg.id] };
    }
    const named = rows.filter((p) => p.category !== "aggregate");
    const mw = named.reduce((s, p) => s + (p.capacityMW ?? 0), 0);
    if (named.length === 0) return null;
    return {
      kind: "named" as const,
      mw,
      label: "Tracked queue projects",
      note: `${named.length} named projects (${isos.join(", ")})`,
    };
  }, [queue, grid, state]);

  const series = useMemo(() => {
    if (!rates || !("byState" in rates) || !state) return [];
    return (rates.byState[state] ?? []).slice(-24);
  }, [rates, state]);

  const latest = series.length ? series[series.length - 1] : null;
  const yearAgo = series.length >= 13 ? series[series.length - 13] : null;
  const yoy = latest && yearAgo ? ((latest.centsPerKwh - yearAgo.centsPerKwh) / yearAgo.centsPerKwh) * 100 : null;

  const stateOptions = Object.entries(STATE_GRID).sort((a, b) => a[1].name.localeCompare(b[1].name));

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Dark leaflet chrome for this page's map, scoped under .my-grid-map */}
      <style>{`
        .my-grid-map .leaflet-container {
          background: ${SURFACE.base} !important;
          font-family: inherit;
        }
        .my-grid-map .leaflet-control-zoom {
          border: none !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.5) !important;
        }
        .my-grid-map .leaflet-control-zoom a {
          background: ${SURFACE.raised} !important;
          color: ${INK.secondary} !important;
          border: 1px solid ${BORDER.subtle} !important;
        }
        .my-grid-map .leaflet-control-zoom a:hover {
          background: ${SURFACE.overlay} !important;
          color: ${BRAND.primary} !important;
        }
        .my-grid-map .leaflet-control-attribution {
          background: rgba(0,0,0,0.4) !important;
          color: ${INK.faint} !important;
          font-size: 9px !important;
        }
        .my-grid-map .leaflet-control-attribution a {
          color: ${INK.faint} !important;
        }
        .my-grid-map .leaflet-tooltip {
          background: ${SURFACE.overlay};
          border: 1px solid ${BORDER.strong};
          color: ${INK.primary};
          font-family: ${FONT.mono};
          box-shadow: 0 2px 8px rgba(0,0,0,0.5);
        }
        .my-grid-map .leaflet-tooltip-top:before { border-top-color: ${BORDER.strong}; }
        .my-grid-map .leaflet-tooltip-bottom:before { border-bottom-color: ${BORDER.strong}; }
        .my-grid-map .leaflet-tooltip-left:before { border-left-color: ${BORDER.strong}; }
        .my-grid-map .leaflet-tooltip-right:before { border-right-color: ${BORDER.strong}; }
      `}</style>

      <PageHeader
        title="My Grid"
        testId="my-grid-header"
        about="Who runs your state's grid, how much headroom the region has, what is being built there, and what residential power costs. The state choice stays in this browser."
        right={
          <>
            <label className="flex items-center gap-2 text-11 text-muted-foreground">
              State
              <select
                value={state}
                onChange={(e) => chooseState(e.target.value)}
                className="rounded border border-subtle bg-surface-base px-2 py-1.5 text-xs text-foreground"
                data-testid="my-grid-state"
              >
                <option value="">Choose…</option>
                {stateOptions.map(([code, s]) => (
                  <option key={code} value={code}>{s.name}</option>
                ))}
              </select>
            </label>
            <AsOf updatedAt={dataUpdatedAt} intervalMs={900_000} />
          </>
        }
      />

      <div className="flex-1 w-full max-w-[1200px] mx-auto p-4 sm:p-6 space-y-4">
        <MyGridMap stateCode={state} stateName={grid?.name ?? null} facilities={facilities} />
        <p className="text-10 text-muted-foreground/60 px-1">
          GridTilt facility registry · hyperscale campuses of 400 MW and up · boundaries from US Census cartographic files
        </p>

        {grid && (
          <>
            <Card className="border-card-border" data-testid="my-grid-operator">
              <div className="px-4 py-2 border-b border-border text-[13px] font-semibold text-foreground">
                Your grid · {grid.name}
              </div>
              <div className="p-4 grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2 lg:grid-cols-4">
                <div>
                  <CellLabel>Grid operator</CellLabel>
                  <p className="mt-1 text-base font-semibold text-foreground leading-snug">{grid.operatorLabel}</p>
                  {grid.note && <p className="mt-1.5 text-11 leading-snug text-muted-foreground">{grid.note}</p>}
                </div>
                {rto ? (
                  <>
                    <div data-testid="my-grid-margin">
                      <CellLabel>Projected reserve margin</CellLabel>
                      <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-foreground">
                        {rto.reserveMargin.toFixed(1)}%
                        <span
                          className="ml-2 align-middle text-xs font-semibold font-sans"
                          style={{ color: SIGNAL_COLOR[rto.aiSignal] }}
                        >
                          {rto.aiSignal}
                        </span>
                      </p>
                      <p className="mt-1.5 text-11 leading-snug text-muted-foreground">
                        Headroom between expected peak demand and supply
                      </p>
                    </div>
                    {regionQueue ? (
                      <div data-testid="my-grid-queue">
                        <CellLabel>{regionQueue.label}</CellLabel>
                        <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-foreground">
                          {(regionQueue.mw / 1000).toFixed(1)} GW
                        </p>
                        <p className="mt-1.5 text-11 leading-snug text-muted-foreground">{regionQueue.note}</p>
                      </div>
                    ) : (
                      <div>
                        <CellLabel>Regional queue</CellLabel>
                        <p className="mt-1.5 text-11 leading-snug text-muted-foreground">
                          No aggregate tracked for this region yet.
                        </p>
                      </div>
                    )}
                    <div>
                      <CellLabel>What the signal means</CellLabel>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground max-w-[36ch]">
                        NERC's reference level is about 15%. Regions under it face constrained
                        interconnection for large new loads.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="md:col-span-1 lg:col-span-3">
                    <p className="text-xs leading-relaxed text-muted-foreground max-w-[48ch]">
                      {grid.note ?? "No regional reliability assessment applies here."}
                    </p>
                  </div>
                )}
              </div>
              <div className="px-4 py-2 border-t border-border/50 text-10 text-muted-foreground/60">
                {RTO_SOURCE_NOTE} · {STATE_GRID_SOURCE} · queue figures carry their own source and date
              </div>
            </Card>

            {liveRto && (
              <Card className="border-card-border" data-testid="my-grid-live">
                <div className="px-4 py-2 border-b border-border text-[13px] font-semibold text-foreground">
                  Your grid right now
                </div>
                {liveError ? (
                  <ErrorState
                    label={`The ${grid.operatorLabel} live feed is not answering right now.`}
                    onRetry={() => refetchLive()}
                    className="h-[200px]"
                  />
                ) : !live ? (
                  <div className="p-4">
                    <Skeleton className="h-[200px] w-full" />
                  </div>
                ) : (
                  <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                      <p className="text-sm text-foreground" data-testid="my-grid-live-headline">
                        {grid.name} is drawing{" "}
                        <span className="font-mono font-bold tabular-nums">{fmtGw(live.currentDemandMW)}</span>{" "}
                        right now · today's peak so far{" "}
                        <span className="font-mono font-bold tabular-nums">{fmtGw(live.peakDemandMW)}</span>
                      </p>
                      <div className="mt-3">
                        <ResponsiveContainer width="100%" height={180}>
                          <LineChart data={live.demand} margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
                            <CartesianGrid {...gridProps} />
                            <XAxis
                              {...axisProps}
                              dataKey="time"
                              interval="preserveStartEnd"
                              minTickGap={48}
                            />
                            <YAxis
                              {...axisProps}
                              width={44}
                              domain={["auto", "auto"]}
                              tickFormatter={(v: number) => `${Math.round(v / 1000)}`}
                              label={{ value: "GW", position: "insideTopLeft", offset: 8, fill: INK.muted, fontSize: 10 }}
                            />
                            <Tooltip
                              contentStyle={tooltipContentStyle}
                              itemStyle={tooltipItemStyle}
                              labelStyle={tooltipLabelStyle}
                              formatter={(v: number) => [fmtGw(v), "demand"]}
                            />
                            <Line
                              {...seriesMotion()}
                              type="monotone"
                              dataKey="mw"
                              stroke={BRAND.primary}
                              strokeWidth={2}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <SrChartTable
                        caption={`Today's ${live.operator} demand, hourly sample`}
                        columns={["Time", "MW"]}
                        rows={live.demand.filter((_, i) => i % 12 === 0).map((d) => [d.time, d.mw])}
                      />
                    </div>
                    <div data-testid="my-grid-live-fuel">
                      <CellLabel>What's generating it</CellLabel>
                      <div className="mt-2 space-y-1.5">
                        {live.fuelMix.map((f) => (
                          <div key={f.fuel} className="flex items-center justify-between gap-3 text-xs">
                            <span className="inline-flex items-center gap-1.5 text-muted-foreground capitalize">
                              <span
                                className="h-2 w-2 rounded-full flex-shrink-0"
                                style={{ background: LIVE_FUEL_COLOR[f.fuel] ?? INK.muted }}
                              />
                              {f.fuel}
                            </span>
                            <span className="font-mono tabular-nums text-foreground">{fmtFuelMw(f.mw)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {live && !liveError && (
                  <div className="px-4 py-2 border-t border-border/50 text-10 text-muted-foreground/60">
                    5-minute data ·{" "}
                    <a href={live.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-foreground">
                      {live.source}
                    </a>{" "}
                    · updated {live.asOf}
                  </div>
                )}
              </Card>
            )}

            <Card className="border-card-border overflow-hidden" data-testid="my-grid-facilities">
              <div className="px-4 py-2 border-b border-border flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-foreground">
                  Being built in {grid.name}
                </span>
                <Link
                  href="/power-map"
                  className="text-11 text-brand hover:text-brand-2 no-underline"
                  data-testid="my-grid-full-map-link"
                >
                  Open the full map →
                </Link>
              </div>
              {facilitiesLoading ? (
                <div className="p-4 space-y-2" aria-hidden="true">
                  {Array(4).fill(null).map((_, i) => <Skeleton key={i} className="h-7" />)}
                </div>
              ) : facilitiesError ? (
                // A fetch failure must not read as "nothing is being built here".
                <ErrorState label="Facility registry failed to load." onRetry={() => refetchFacilities()} />
              ) : localFacilities.length === 0 ? (
                <p className="p-4 text-xs leading-relaxed text-muted-foreground" data-testid="my-grid-no-facilities">
                  No tracked facilities in {grid.name}. The registry covers hyperscale campuses of
                  400 MW and up; smaller sites are out of scope. Gray marks on the map are the
                  nearest tracked facilities in neighboring states.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[640px]" data-testid="my-grid-facility-table">
                    <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-surface-base border-b border-border text-[11px] text-muted-foreground">
                      <span className="col-span-4">Facility</span>
                      <span className="col-span-3">Operator</span>
                      <span className="col-span-2">City</span>
                      <span className="col-span-1 text-right">MW</span>
                      <span className="col-span-2">Status</span>
                    </div>
                    {localFacilities.map((f) => (
                      <div
                        key={f.id}
                        className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-border/30 last:border-0 text-xs hover:bg-brand/5"
                        data-testid={`my-grid-facility-row-${f.id}`}
                      >
                        <span className="col-span-4 font-medium text-foreground truncate">{f.name}</span>
                        <span className="col-span-3 text-muted-foreground truncate">{f.company}</span>
                        <span className="col-span-2 text-muted-foreground truncate">{f.city}</span>
                        <span className="col-span-1 font-mono text-foreground text-right tabular-nums">
                          {f.powerMW ?? "--"}
                        </span>
                        <span className="col-span-2 truncate" style={{ color: STATUS_COLORS[f.status as keyof typeof STATUS_COLORS] ?? INK.muted }}>
                          {STATUS_LABEL[f.status] ?? f.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="px-4 py-2 border-t border-border/50 text-10 text-muted-foreground/60">
                GridTilt facility registry · hyperscale campuses of 400 MW and up
              </div>
            </Card>

            <Card className="border-card-border" data-testid="my-grid-rates">
              <div className="px-4 py-2 border-b border-border text-[13px] font-semibold text-foreground">
                What electricity costs in {grid.name}
              </div>
              <div className="p-4">
                {ratesError ? (
                  <ErrorState label="Rate data failed to load." onRetry={() => refetchRates()} />
                ) : !rates ? (
                  <Skeleton className="h-40 w-full" aria-hidden="true" />
                ) : !("byState" in rates) ? (
                  <p className="text-xs leading-relaxed text-muted-foreground max-w-[60ch]" data-testid="my-grid-rates-unconfigured">
                    Rate data connects soon; nothing is shown in its place.
                  </p>
                ) : series.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No EIA series available for {grid.name}.</p>
                ) : (
                  <>
                    <div className="mb-4" data-testid="my-grid-rate">
                      <CellLabel>Residential average, {latest ? fmtMonth(latest.month) : ""}</CellLabel>
                      <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-foreground">
                        {latest ? `${latest.centsPerKwh.toFixed(1)}¢/kWh` : "--"}
                        {yoy != null && (
                          <span className={`ml-2 align-middle text-xs font-semibold tabular-nums ${yoy >= 0 ? "text-negative" : "text-positive"}`}>
                            {yoy >= 0 ? "+" : "−"}{Math.abs(yoy).toFixed(1)}% y/y
                          </span>
                        )}
                      </p>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid {...gridProps} />
                        <XAxis {...axisProps} dataKey="month" tickFormatter={fmtMonth} interval="preserveStartEnd" minTickGap={40} />
                        <YAxis {...axisProps} axisLine={false} width={40} domain={["auto", "auto"]} tickFormatter={(v: number) => `${v.toFixed(0)}¢`} />
                        <Tooltip
                          contentStyle={tooltipContentStyle}
                          labelStyle={tooltipLabelStyle}
                          itemStyle={tooltipItemStyle}
                          labelFormatter={(m: string) => fmtMonth(m)}
                          formatter={(v: number) => [`${v.toFixed(2)}¢/kWh`, "Residential average"]}
                        />
                        <Line {...seriesMotion()} type="monotone" dataKey="centsPerKwh" stroke={BRAND.primary} strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                    <SrChartTable
                      caption={`Residential electricity price in ${grid.name}, cents per kWh`}
                      columns={["Month", "Cents per kWh"]}
                      rows={series.map((p) => [p.month, p.centsPerKwh.toFixed(2)])}
                    />
                    <p className="mt-3 text-10 text-muted-foreground/60">
                      <a href={rates.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand-2">
                        {rates.source}
                      </a>
                      {" · "}{rates.unit}
                    </p>
                  </>
                )}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
