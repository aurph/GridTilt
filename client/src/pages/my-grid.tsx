/**
 * My Grid: the buildout where you live. Map first - national view until a
 * state is chosen, then the state boundary with every tracked facility in
 * and around it - followed by the operator's headroom, the region's queue,
 * the facility list, and residential rates. State choice persists locally;
 * nothing leaves the browser.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MapContainer, TileLayer, CircleMarker, GeoJSON as GeoJSONLayer, Tooltip as MapTooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Feature, FeatureCollection } from "geojson";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, SrChartTable } from "@/components/Freshness";
import { PageShell, PageTitle, Provenance, PullStat, RuleSection } from "@/components/editorial";
import { RTO_CONFIG, RTO_SOURCE_NOTE } from "@/data/rto-config";
import { STATE_GRID, STATE_GRID_SOURCE } from "@/data/state-grid";
import { BRAND, INK } from "@/lib/tokens";
import { HIGHLIGHT, axisProps, gridProps, tooltipContentStyle, tooltipItemStyle, tooltipLabelStyle } from "@/lib/chart-theme";
// US state boundaries: US Census cartographic boundary file (public domain),
// via the widely used us-states GeoJSON distribution.
import statesGeoRaw from "@/data/us-states.geo.json";

const statesGeo = statesGeoRaw as unknown as FeatureCollection;

const STORAGE_KEY = "gt-my-grid-state";

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
  iso: string;
  projectName?: string;
  capacityMW: number | null;
  type?: string;
}

interface QueueResponse {
  projects: QueueProject[];
}

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

const SIGNAL_CLASS: Record<string, string> = {
  Critical: "text-negative",
  Elevated: "text-warning",
  Moderate: "text-ink-secondary",
  Low: "text-positive",
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
  useMemo(() => {
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
    <figure className="border border-rule" data-testid="my-grid-map">
      <div className="h-[440px] w-full isolate z-0">
        <MapContainer
          center={[38.5, -96]}
          zoom={4}
          zoomControl
          scrollWheelZoom={false}
          attributionControl
          className="h-full w-full"
          style={{ background: "var(--paper)" }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          {feature && (
            <GeoJSONLayer
              key={stateCode}
              data={feature}
              style={{ color: BRAND.primary, weight: 2, fillColor: BRAND.primary, fillOpacity: 0.04 }}
            />
          )}
          {facilities.map((f) => {
            const inState = stateCode !== "" && f.state === stateCode;
            return (
              <CircleMarker
                key={f.id}
                center={[f.lat, f.lng]}
                radius={inState ? Math.max(6, Math.min(14, Math.sqrt(f.powerMW ?? 100) / 2.6)) : 4}
                pathOptions={{
                  color: inState ? BRAND.primary : INK.faint,
                  weight: 1,
                  fillColor: inState ? BRAND.primary : INK.faint,
                  fillOpacity: inState ? (STATUS_OPACITY[f.status] ?? 0.3) : 0.35,
                }}
              >
                <MapTooltip>
                  <span className="text-[12px]">
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
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-rule px-3 py-2 text-[12.5px] text-ink-secondary">
        <span>
          {stateName
            ? `Tracked facilities in and around ${stateName}; neighbors in gray`
            : "Every tracked US facility; pick a state to zoom in"}
        </span>
        <span className="text-ink-muted">size = capacity · solid = operational, faint = announced</span>
      </figcaption>
    </figure>
  );
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
    data: facilities,
    isLoading: facilitiesLoading,
    isError: facilitiesError,
    refetch: refetchFacilities,
  } = useQuery<Facility[]>({
    queryKey: ["/api/datacenters"],
    refetchInterval: 900000,
  });

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

  const localFacilities = useMemo(() => {
    if (!facilities || !state) return [];
    return facilities
      .filter((f) => f.state === state)
      .sort((a, b) => (b.powerMW ?? 0) - (a.powerMW ?? 0));
  }, [facilities, state]);

  const regionQueue = useMemo(() => {
    if (!queue?.projects || !grid) return null;
    const isos = state === "CA" ? ["CAISO"] : (grid.region ? QUEUE_ISOS[grid.region] ?? [] : []);
    if (isos.length === 0) return null;
    const rows = queue.projects.filter((p) => isos.includes(p.iso));
    // The dataset mixes LBNL whole-queue aggregate rows with named
    // AI-relevant projects; summing both would double count. Headline the
    // aggregate where one exists, count only the named rows.
    const named = rows.filter((p) => !/aggregate/i.test(p.projectName ?? ""));
    const agg = rows.find((p) => /aggregate/i.test(p.projectName ?? ""));
    if (agg?.capacityMW) return { kind: "total" as const, isos, count: named.length, mw: agg.capacityMW };
    const mw = named.reduce((s, p) => s + (p.capacityMW ?? 0), 0);
    if (named.length === 0) return null;
    return { kind: "named" as const, isos, count: named.length, mw };
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
    <PageShell>
      <PageTitle
        title="My Grid"
        right={
          <label className="flex items-baseline gap-2 text-[13px] text-ink-secondary">
            State
            <select
              value={state}
              onChange={(e) => chooseState(e.target.value)}
              className="rounded-sm border border-rule bg-card px-2 py-1.5 text-[13.5px] text-ink"
              data-testid="my-grid-state"
            >
              <option value="">Choose…</option>
              {stateOptions.map(([code, s]) => (
                <option key={code} value={code}>{s.name}</option>
              ))}
            </select>
          </label>
        }
        testId="my-grid-header"
      />

      <MyGridMap stateCode={state} stateName={grid?.name ?? null} facilities={facilities ?? []} />
      <Provenance
        source="GridTilt facility registry"
        extra="hyperscale campuses of 400 MW and up; boundaries from US Census cartographic files"
      />

      {grid && (
        <>
          <RuleSection head="Your grid" testId="my-grid-operator">
            <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-[13px] leading-tight text-ink-secondary">Grid operator</p>
                <p className="mt-1 font-serif text-[24px] leading-tight text-ink">{grid.operatorLabel}</p>
                {grid.note && <p className="mt-2 text-[12.5px] leading-snug text-ink-muted">{grid.note}</p>}
              </div>
              {rto ? (
                <>
                  <PullStat
                    label="Projected reserve margin"
                    value={`${rto.reserveMargin.toFixed(1)}%`}
                    delta={<span className={`text-[13px] font-semibold ${SIGNAL_CLASS[rto.aiSignal] ?? "text-ink-muted"}`}>{rto.aiSignal}</span>}
                    note="Headroom between expected peak demand and supply"
                    testId="my-grid-margin"
                  />
                  {regionQueue ? (
                    <PullStat
                      label={regionQueue.kind === "total" ? "In your region's queue" : "Tracked queue projects"}
                      value={`${(regionQueue.mw / 1000).toFixed(1)} GW`}
                      note={
                        regionQueue.kind === "total"
                          ? `full ${regionQueue.isos.join("/")} queue (LBNL) · ${regionQueue.count} AI-relevant projects tracked`
                          : `${regionQueue.count} named projects (${regionQueue.isos.join(", ")})`
                      }
                      testId="my-grid-queue"
                    />
                  ) : (
                    <div>
                      <p className="text-[13px] leading-tight text-ink-secondary">Waiting in your region's queue</p>
                      <p className="mt-1.5 max-w-[30ch] text-[13px] leading-relaxed text-ink-muted">
                        No AI-relevant projects for this region in the current tracked sample.
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-[13px] leading-tight text-ink-secondary">What the signal means</p>
                    <p className="mt-1.5 max-w-[36ch] text-[13.5px] leading-relaxed text-ink-secondary">
                      NERC's reference level is about 15%. Regions under it face constrained
                      interconnection for large new loads.
                    </p>
                  </div>
                </>
              ) : (
                <div className="md:col-span-3">
                  <p className="max-w-[48ch] text-[13.5px] leading-relaxed text-ink-secondary">
                    {grid.note ?? "No regional reliability assessment applies here."}
                  </p>
                </div>
              )}
            </div>
            <Provenance
              source={RTO_SOURCE_NOTE}
              extra={
                <>
                  {STATE_GRID_SOURCE}; queue from LBNL Queued Up, AI-relevant sample
                </>
              }
            />
          </RuleSection>

          <RuleSection head={`Being built in ${grid.name}`} testId="my-grid-facilities">
            {facilitiesLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : facilitiesError ? (
              // A fetch failure must not read as "nothing is being built here".
              <ErrorState label="Facility registry failed to load." onRetry={() => refetchFacilities()} className="h-24" />
            ) : localFacilities.length === 0 ? (
              <p className="text-[13.5px] text-ink-secondary" data-testid="my-grid-no-facilities">
                No tracked facilities in {grid.name}. The registry covers hyperscale campuses of
                400 MW and up; smaller sites are out of scope. Gray marks on the map are the
                nearest tracked facilities in neighboring states.
              </p>
            ) : (
              <table className="print-table" data-testid="my-grid-facility-table">
                <thead>
                  <tr>
                    <th>Facility</th>
                    <th>Operator</th>
                    <th>City</th>
                    <th className="num">MW</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {localFacilities.map((f) => (
                    <tr key={f.id}>
                      <td className="font-semibold text-ink">{f.name}</td>
                      <td className="text-ink-secondary">{f.company}</td>
                      <td className="text-ink-secondary">{f.city}</td>
                      <td className="num">{f.powerMW ?? "--"}</td>
                      <td className={f.status === "operational" ? "font-semibold text-ink" : f.status === "construction" ? "text-ink-secondary" : "text-ink-muted"}>
                        {STATUS_LABEL[f.status] ?? f.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-2">
              <Link href="/power-map" className="text-[12.5px] font-semibold text-ink no-underline hover:text-brand-ink">
                Open the full map →
              </Link>
            </p>
            <Provenance source="GridTilt facility registry" extra="hyperscale campuses of 400 MW and up" />
          </RuleSection>

          <RuleSection head={`What electricity costs in ${grid.name}`} testId="my-grid-rates">
            {ratesError ? (
              <ErrorState label="Rate data failed to load." onRetry={() => refetchRates()} className="h-40" />
            ) : !rates ? (
              <Skeleton className="h-40 w-full" />
            ) : !("byState" in rates) ? (
              <p className="max-w-[60ch] text-[13.5px] leading-relaxed text-ink-secondary" data-testid="my-grid-rates-unconfigured">
                Rate data is not configured on this deployment yet. It comes straight from the
                EIA once a free API key is set; nothing is shown in its place.
              </p>
            ) : series.length === 0 ? (
              <p className="text-[13.5px] text-ink-secondary">No EIA series available for {grid.name}.</p>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-end gap-x-10 gap-y-4">
                  <PullStat
                    label={`Residential average, ${latest ? fmtMonth(latest.month) : ""}`}
                    value={latest ? `${latest.centsPerKwh.toFixed(1)}¢/kWh` : "--"}
                    delta={
                      yoy != null ? (
                        <span className={`text-[13px] font-semibold tnum ${yoy >= 0 ? "text-negative" : "text-positive"}`}>
                          {yoy >= 0 ? "+" : "−"}{Math.abs(yoy).toFixed(1)}% y/y
                        </span>
                      ) : undefined
                    }
                    testId="my-grid-rate"
                  />
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
                    <Line type="monotone" dataKey="centsPerKwh" stroke={HIGHLIGHT} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
                <SrChartTable
                  caption={`Residential electricity price in ${grid.name}, cents per kWh`}
                  columns={["Month", "Cents per kWh"]}
                  rows={series.map((p) => [p.month, p.centsPerKwh.toFixed(2)])}
                />
                <Provenance source={rates.source} href={rates.sourceUrl} extra={rates.unit} />
              </>
            )}
          </RuleSection>
        </>
      )}
    </PageShell>
  );
}
