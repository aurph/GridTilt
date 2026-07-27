import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import PriceHistoryChart, { type ScaleMode } from "@/components/neocloud/PriceHistoryChart";
import {
  RANGE_KEYS,
  buildSeries,
  rangeAvailability,
  sparklineDomain,
  type ChartSeries,
  type RangeKey,
} from "@/lib/gpu-series";
import { useMeasuredWidth } from "@/lib/use-measured-width";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown } from "lucide-react";
import { AsOf, ErrorState, SrChartTable } from "@/components/Freshness";
import { ToolTabs, useToolTabs } from "@/components/ToolTabs";
import { EstFlag, PageShell, PageTitle, Provenance, RuleSection } from "@/components/editorial";
import GpuEconomics from "@/pages/gpu-economics";
import FrontierModels from "@/pages/frontier-models";
import { BORDER, DATA_QUALITY, FONT, INK, SERIES, SURFACE } from "@/lib/tokens";
import { CONTEXT } from "@/lib/chart-theme";

// ─── Types (mirror /api/gpu-prices/metrics) ────────────────────────────────

interface GpuChanges { w1: number | null; m1: number | null; ytd: number | null; y1: number | null; }
interface SeriesPoint {
  date: string;
  price: number;
  low?: number;
  high?: number;
  sources?: string[];
  n?: number;
}
interface ProviderCounts { requests: number; succeeded: number; failed: number; observations: number; }
interface GpuSweepSummary {
  date: string;
  ok: boolean;
  perProvider: { runpod: ProviderCounts; vast: ProviderCounts };
  usableModels: number;
}
interface GpuPipelineHealth {
  recordedDays: number;
  lastRecordedDate: string | null;
  lastSweep: GpuSweepSummary | null;
  curatedLastRefreshed: string | null;
}
interface GpuRow {
  model: string;
  vendor: string;
  architecture: string | null;
  vramGB: number | null;
  vramType: string | null;
  launchYear: number | null;
  confidence: string | null;
  oneYearTrend: string | null;
  sources: string[];
  current: number;
  low: number;
  high: number;
  estimated: string[];
  changes: GpuChanges;
  series: SeriesPoint[];
  liveSources?: string[] | null;
  liveDate?: string | null;
}
interface GpuMetrics {
  asOf: string;
  modelCount: number;
  rows: GpuRow[];
  fleetAvg: number;
  fleetAvg1yChange: number | null;
  unit: string | null;
  methodology: string | null;
  lastRefreshed: string | null;
  health: GpuPipelineHealth;
}

// Per-model accent (categorical SERIES slots, fixed order). In the editorial
// chart grammar these appear on hover/selection; resting series read context gray.
const MODEL_COLOR: Record<string, string> = {
  GB200: SERIES[0], B300: SERIES[1], B200: SERIES[2], H200: SERIES[3], GH200: SERIES[4],
  H100: SERIES[5], A100: SERIES[6], MI355X: SERIES[7], MI325X: SERIES[8], MI300X: SERIES[9],
};
const colorFor = (m: string) => MODEL_COLOR[m] ?? INK.muted;

const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
const fmtChange = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
// Standard market direction coloring (up green, down red), same as every other
// module. Direction needs no legend; the renter's cost framing lives in copy.
const changeClass = (v: number | null): string =>
  v === null ? "text-ink-faint" : v > 0 ? "text-positive" : v < 0 ? "text-negative" : "text-ink-muted";

type SortKey = "current" | "model" | "w1" | "m1" | "ytd" | "y1";
type ViewKey = "overlay" | "grid";
const DEFAULT_VISIBLE_MODELS = ["H100", "H200", "B200", "A100"];

// GPU Prices tool tabs (consolidation): rental prices + cost-of-compute.
const GPU_TABS = [
  { id: "prices", label: "Prices" },
  { id: "economics", label: "Economics" },
  { id: "frontier", label: "Frontier" },
];

// Small segmented-control button, 12px floor for interactive text.
const ctlBtn = (on: boolean, enabled = true) =>
  `rounded-sm border px-2 py-0.5 text-[12px] transition-colors duration-fast ${
    on
      ? "border-brand/60 bg-brand/10 font-medium text-brand-ink"
      : enabled
        ? "border-rule text-ink-secondary hover:border-rule-strong hover:text-ink"
        : "border-rule text-ink-faint cursor-not-allowed"
  }`;

// ─── URL-persisted chart state (?gpus=A,B&view=grid&range=1Y) ──────────────

// Grid (small multiples) is the default view - owner call at the Lake 2 review.
function readChartParams(): { gpus: string[] | null; view: ViewKey; range: RangeKey; scale: ScaleMode } {
  const sp = new URLSearchParams(window.location.search);
  const gpusRaw = sp.get("gpus");
  const view = sp.get("view") === "overlay" ? "overlay" : "grid";
  const rangeRaw = sp.get("range");
  const range = (RANGE_KEYS as readonly string[]).includes(rangeRaw ?? "") ? (rangeRaw as RangeKey) : "ALL";
  const scale = sp.get("scale") === "linear" ? "linear" : "log";
  return { gpus: gpusRaw ? gpusRaw.split(",").filter(Boolean) : null, view, range, scale };
}

function writeChartParams(gpus: string[] | null, view: ViewKey, range: RangeKey, scale: ScaleMode) {
  const sp = new URLSearchParams(window.location.search);
  if (gpus) sp.set("gpus", gpus.join(","));
  else sp.delete("gpus");
  if (view !== "grid") sp.set("view", view);
  else sp.delete("view");
  if (range !== "ALL") sp.set("range", range);
  else sp.delete("range");
  if (scale !== "log") sp.set("scale", scale);
  else sp.delete("scale");
  const qs = sp.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
}


export default function NeocloudIntel() {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<GpuMetrics>({ queryKey: ["/api/gpu-prices/metrics"] });
  const [sortKey, setSortKey] = useState<SortKey>("current");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [tab, setTab] = useToolTabs(GPU_TABS, "prices");

  const rows = data?.rows ?? [];
  const now = useMemo(() => Date.now(), [data?.asOf]);

  // ── Price-history chart state (persisted in URL params) ──
  const initial = useMemo(readChartParams, []);
  const [visibleModels, setVisibleModels] = useState<string[] | null>(initial.gpus); // null = preferred four
  const [view, setView] = useState<ViewKey>(initial.view);
  const [range, setRange] = useState<RangeKey>(initial.range);
  const [scaleMode, setScaleMode] = useState<ScaleMode>(initial.scale);
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);
  useEffect(() => {
    writeChartParams(visibleModels, view, range, scaleMode);
  }, [visibleModels, view, range, scaleMode]);

  const allSeries: ChartSeries[] = useMemo(
    () => buildSeries(rows.map((r) => ({ model: r.model, vendor: r.vendor, series: r.series })), colorFor),
    [rows],
  );
  const defaultVisibleModels = useMemo(() => {
    const available = new Set(rows.map((row) => row.model));
    const preferred = DEFAULT_VISIBLE_MODELS.filter((model) => available.has(model));
    return preferred.length > 0 ? preferred : rows.slice(0, 4).map((row) => row.model);
  }, [rows]);
  const effectiveVisibleModels = useMemo(() => {
    const available = new Set(rows.map((row) => row.model));
    const requested = (visibleModels ?? defaultVisibleModels).filter((model) => available.has(model));
    return requested.length > 0 ? requested : defaultVisibleModels;
  }, [defaultVisibleModels, rows, visibleModels]);
  const visibleSet = useMemo(
    () => new Set(effectiveVisibleModels),
    [effectiveVisibleModels],
  );
  const chartSeries = useMemo(() => allSeries.filter((s) => visibleSet.has(s.model)), [allSeries, visibleSet]);
  const availableRanges = useMemo(() => rangeAvailability(chartSeries, now), [chartSeries, now]);
  useEffect(() => {
    if (!availableRanges[range].enabled) setRange("ALL");
  }, [availableRanges, range]);

  const chipClick = (model: string) => {
    const selected = new Set(effectiveVisibleModels);
    if (selected.has(model)) {
      if (selected.size === 1) return;
      selected.delete(model);
    } else selected.add(model);
    const next = rows.map((row) => row.model).filter((candidate) => selected.has(candidate));
    const isDefault = next.length === defaultVisibleModels.length && next.every((candidate) => defaultVisibleModels.includes(candidate));
    setVisibleModels(isDefault ? null : next);
  };

  const [chartRef, chartWidth] = useMeasuredWidth<HTMLDivElement>();
  const [dispRef, dispWidth] = useMeasuredWidth<HTMLDivElement>();

  // Dispersion chart: every model, sorted by blended price desc.
  const dispersionRows = useMemo(
    () => [...rows]
      .sort((a, b) => b.current - a.current)
      .map((r) => ({
        model: r.model,
        vendor: r.vendor,
        current: r.current,
        low: r.low,
        high: r.high,
        est: r.estimated.includes("currentUsdPerHr"),
      })),
    [rows],
  );

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "model") cmp = a.model.localeCompare(b.model);
      else if (sortKey === "current") cmp = a.current - b.current;
      else cmp = (a.changes[sortKey] ?? -Infinity) - (b.changes[sortKey] ?? -Infinity);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "model" ? "asc" : "desc"); }
  };

  // Tables grouped by maker.
  const byVendor = useMemo(() => {
    const groups: Record<string, GpuRow[]> = {};
    for (const r of [...rows].sort((a, b) => b.current - a.current)) (groups[r.vendor] = groups[r.vendor] ?? []).push(r);
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [rows]);

  const hasEst = rows.some((r) => r.estimated.includes("currentUsdPerHr"));
  const updatedDate = data?.lastRefreshed ?? data?.asOf ?? undefined;

  return (
    <PageShell>
      <PageTitle
        title="GPU Prices"
        right={
          <>
            {data && (
              <span className="flex items-baseline gap-2" data-testid="ni-fleet-stat">
                <span className="text-[12.5px] text-ink-secondary">Fleet average</span>
                <span className="text-[15px] font-semibold text-ink tnum">{fmtUsd(data.fleetAvg)}/hr</span>
                {data.fleetAvg1yChange !== null && (
                  <span className={`text-[12.5px] font-semibold tnum ${changeClass(data.fleetAvg1yChange)}`}>
                    {fmtChange(data.fleetAvg1yChange)} 1y
                  </span>
                )}
                <span className="text-[12.5px] text-ink-muted tnum">{data.modelCount} models</span>
              </span>
            )}
            <AsOf updatedAt={dataUpdatedAt} />
            <Link href="/compute-frontier" className="text-[12.5px] font-semibold text-ink no-underline hover:text-brand-ink">
              Compute Frontier →
            </Link>
          </>
        }
        testId="ni-header"
      />

      <ToolTabs tabs={GPU_TABS} active={tab} onChange={setTab} />

      {tab === "frontier" ? (
        <FrontierModels embedded />
      ) : tab === "economics" ? (
        <GpuEconomics embedded />
      ) : (
        <>
          {/* Current prices, grouped by maker */}
          <RuleSection head="Current prices" aside={<span>$/GPU/hr, on demand</span>} testId="ni-groups">
            {isLoading ? (
              <div className="space-y-2 py-2">
                {Array(8).fill(null).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
              </div>
            ) : isError ? (
              <ErrorState label="GPU price index unavailable" onRetry={() => refetch()} />
            ) : (
              <>
                {byVendor.map(([vendor, vrows]) => (
                  <div key={vendor} className="mt-5 first:mt-0" data-testid={`ni-group-${vendor}`}>
                    <p className="mb-1 text-[13px] font-semibold text-ink">
                      {vendor} <span className="font-normal text-ink-muted">· {vrows.length} GPUs</span>
                    </p>
                    <table className="print-table">
                      <thead>
                        <tr>
                          <th>Model</th>
                          <th className="hidden sm:table-cell">Architecture</th>
                          <th className="hidden md:table-cell">Memory</th>
                          <th className="num">Price</th>
                          <th className="num hidden sm:table-cell">Observed range</th>
                          <th className="num">1y</th>
                          <th className="hidden md:table-cell">Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vrows.map((r) => (
                          <tr key={r.model} data-testid={`ni-card-${r.model}`}>
                            <td className="shrink font-semibold text-ink">{r.model}</td>
                            <td className="hidden sm:table-cell text-ink-secondary">
                              {[r.architecture, r.launchYear].filter(Boolean).join(" · ") || "—"}
                            </td>
                            <td className="hidden md:table-cell text-ink-secondary">
                              {r.vramGB ? `${r.vramGB} GB ${r.vramType ?? ""}`.trim() : "—"}
                            </td>
                            <td className="num">
                              {fmtUsd(r.current)}
                              {r.estimated.includes("currentUsdPerHr") && <EstFlag />}
                            </td>
                            <td className="num hidden sm:table-cell text-ink-muted">${r.low}–${r.high}</td>
                            <td className={`num font-semibold ${changeClass(r.changes.y1)}`}>{fmtChange(r.changes.y1)}</td>
                            <td className="hidden md:table-cell text-ink-muted">{r.confidence ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
                <Provenance
                  source="GridTilt GPU price index"
                  updated={updatedDate}
                  extra={hasEst ? "† estimated value" : undefined}
                />
              </>
            )}
          </RuleSection>

          {/* Price history: recorded days and estimated anchors remain separate evidence classes. */}
          <RuleSection
            head="Price history"
            aside={
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {RANGE_KEYS.map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      if (availableRanges[r].enabled) setRange(r);
                    }}
                    aria-disabled={!availableRanges[r].enabled}
                    aria-pressed={range === r}
                    title={availableRanges[r].enabled ? `${availableRanges[r].pointCount} points in this window` : "no data in this window"}
                    className={ctlBtn(range === r, availableRanges[r].enabled)}
                    data-testid={`ni-range-${r}`}
                  >
                    {r}
                  </button>
                ))}
                <span className="mx-1 h-4 w-px bg-rule" />
                {(["log", "linear"] as ScaleMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setScaleMode(mode)}
                    aria-pressed={scaleMode === mode}
                    className={ctlBtn(scaleMode === mode)}
                    data-testid={`ni-scale-${mode}`}
                  >
                    {mode}
                  </button>
                ))}
                <span className="mx-1 h-4 w-px bg-rule" />
                {(["grid", "overlay"] as ViewKey[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    aria-pressed={view === v}
                    className={ctlBtn(view === v)}
                    data-testid={`ni-view-${v}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            }
            testId="ni-history"
          >
            {/* Model chips toggle visibility. The default set is the four densest series. */}
            {rows.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-1.5" data-testid="ni-chips">
                <button
                  onClick={() => setVisibleModels(visibleSet.size === rows.length ? null : rows.map((row) => row.model))}
                  aria-pressed={visibleSet.size === rows.length}
                  className={ctlBtn(visibleSet.size === rows.length)}
                  data-testid="ni-chip-all"
                >
                  All
                </button>
                {rows.map((r) => {
                  const on = visibleSet.has(r.model);
                  return (
                    <button
                      key={r.model}
                      onClick={() => chipClick(r.model)}
                      onPointerEnter={() => setHoveredModel(r.model)}
                      onPointerLeave={() => setHoveredModel(null)}
                      aria-pressed={on}
                      title={on && visibleSet.size === 1 ? "At least one model must remain visible" : `Toggle ${r.model}`}
                      className={`flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[12px] transition-colors duration-fast ${
                        on
                          ? "border-rule-strong text-ink"
                          : "border-rule text-ink-faint hover:text-ink-secondary"
                      }`}
                      data-testid={`ni-chip-${r.model}`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorFor(r.model), opacity: on ? 1 : 0.35 }} />
                      {r.model}
                    </button>
                  );
                })}
              </div>
            )}

            <div ref={chartRef}>
              {isLoading ? (
                <Skeleton className="h-[380px] w-full" />
              ) : isError ? (
                <div className="h-[240px] flex items-center justify-center">
                  <ErrorState label="Price index unavailable" onRetry={() => refetch()} />
                </div>
              ) : (
                <PriceHistoryChart
                  series={chartSeries}
                  range={range}
                  now={now}
                  view={view}
                  scaleMode={scaleMode}
                  width={chartWidth}
                  hovered={hoveredModel}
                  onHover={setHoveredModel}
                />
              )}
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
              Only plotted points are data. Dashed spans connect unobserved time and are never treated as recorded price action.
            </p>
            {data?.health && <PipelineHealthLine health={data.health} />}
            <Provenance source="GridTilt GPU price index" updated={updatedDate} />
          </RuleSection>

          {/* Marketplace dispersion: observed low-high per model on one scale, dot = blended price */}
          <RuleSection head="Marketplace dispersion" aside={<span>$/GPU/hr, observed low to high</span>} testId="ni-chart">
            <div ref={dispRef}>
              {isLoading ? (
                <Skeleton className="h-[320px] w-full" />
              ) : isError || dispersionRows.length === 0 ? (
                <div className="h-[240px] flex items-center justify-center text-[13px] text-ink-muted" data-testid="ni-chart-empty">
                  {isError ? <ErrorState label="Price index unavailable" onRetry={() => refetch()} /> : "No price data."}
                </div>
              ) : (
                <DispersionChart rows={dispersionRows} width={dispWidth} hovered={hoveredModel} onHover={setHoveredModel} />
              )}
            </div>
            {!isLoading && !isError && dispersionRows.length > 0 && (
              <Provenance
                source="GridTilt GPU price index"
                updated={updatedDate}
                extra={hasEst ? "† estimated value" : undefined}
              />
            )}
          </RuleSection>

          {/* Price index table (fleet avg is a plain mean; "weighted" would be a lie) */}
          <RuleSection head="On-demand price index" aside={<span>$/GPU/hr</span>} testId="ni-table">
            {isLoading ? (
              <div className="space-y-2 py-2">{Array(10).fill(null).map((_, i) => <Skeleton key={i} className="h-7" />)}</div>
            ) : isError ? (
              <ErrorState label="Price index unavailable" onRetry={() => refetch()} />
            ) : (
              <>
                <table className="print-table">
                  <thead>
                    <tr>
                      <th><SortHeader label="Model" k="model" cur={sortKey} dir={sortDir} onClick={toggleSort} /></th>
                      <th className="hidden md:table-cell">History</th>
                      <th className="num"><SortHeader label="Avg" k="current" cur={sortKey} dir={sortDir} onClick={toggleSort} /></th>
                      <th className="num"><SortHeader label="1w" k="w1" cur={sortKey} dir={sortDir} onClick={toggleSort} /></th>
                      <th className="num hidden sm:table-cell"><SortHeader label="1m" k="m1" cur={sortKey} dir={sortDir} onClick={toggleSort} /></th>
                      <th className="num hidden sm:table-cell"><SortHeader label="YTD" k="ytd" cur={sortKey} dir={sortDir} onClick={toggleSort} /></th>
                      <th className="num"><SortHeader label="1y" k="y1" cur={sortKey} dir={sortDir} onClick={toggleSort} /></th>
                      <th className="num hidden lg:table-cell">Range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((r) => (
                      <tr
                        key={r.model}
                        className={hoveredModel === r.model ? "bg-paper-shade" : ""}
                        onPointerEnter={() => setHoveredModel(r.model)}
                        onPointerLeave={() => setHoveredModel(null)}
                        data-testid={`ni-row-${r.model}`}
                      >
                        <td className="shrink">
                          <span className="flex items-center gap-1.5 font-semibold text-ink">
                            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: colorFor(r.model) }} />
                            {r.model}
                            <span className="text-[11.5px] font-normal text-ink-muted">{r.vendor}</span>
                          </span>
                        </td>
                        <td className="hidden md:table-cell">
                          <MiniSpark
                            series={allSeries.find((s) => s.model === r.model)}
                            color={hoveredModel === r.model ? colorFor(r.model) : CONTEXT}
                          />
                        </td>
                        <td className="num text-ink">
                          {fmtUsd(r.current)}
                          {r.estimated.includes("currentUsdPerHr") && <EstFlag />}
                        </td>
                        <td className={`num ${changeClass(r.changes.w1)}`}>{fmtChange(r.changes.w1)}</td>
                        <td className={`num hidden sm:table-cell ${changeClass(r.changes.m1)}`}>{fmtChange(r.changes.m1)}</td>
                        <td className={`num hidden sm:table-cell ${changeClass(r.changes.ytd)}`}>{fmtChange(r.changes.ytd)}</td>
                        <td className={`num ${changeClass(r.changes.y1)}`}>{fmtChange(r.changes.y1)}</td>
                        <td className="num hidden lg:table-cell text-ink-muted">${r.low}–${r.high}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Provenance
                  source="GridTilt GPU price index"
                  updated={updatedDate}
                  extra={hasEst ? "† estimated value" : undefined}
                />
                <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
                  1w, 1m, and YTD read "—" until the daily recorder accrues history; 1y is measured from sourced anchors.
                </p>
                <details className="mt-2" data-testid="ni-sources">
                  <summary className="cursor-pointer list-none text-[12.5px] text-ink-muted hover:text-ink-secondary">
                    Per-model sources
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    {sortedRows.map((r) => (
                      <p key={r.model} className="text-[12.5px] leading-relaxed text-ink-muted">
                        <span className="font-semibold text-ink">{r.model}</span>
                        {r.liveSources && r.liveSources.length > 0 && (
                          <span className="text-positive">
                            {" "}· live price from {r.liveSources.join(" + ")}{r.liveDate ? ` (${r.liveDate})` : ""}
                          </span>
                        )}
                        {r.oneYearTrend && <> · {r.oneYearTrend}</>}
                        {r.sources.slice(0, 4).map((s) => (
                          <a
                            key={s}
                            href={s}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-ink-muted underline decoration-rule-strong underline-offset-2 hover:text-brand-ink"
                          >
                            {s.replace(/^https?:\/\//, "").split("/")[0]}
                          </a>
                        ))}
                      </p>
                    ))}
                  </div>
                </details>
              </>
            )}
          </RuleSection>

          <p className="mt-6 max-w-[80ch] text-[12.5px] leading-relaxed text-ink-muted" data-testid="ni-methodology">
            {data?.methodology ?? "Blended on-demand rental prices from public neocloud and marketplace listings and the getdeploying.com / Silicon Data trackers."}
            {" "}Models covered by live provider APIs (RunPod, Vast.ai marketplace) serve an observed daily price; those
            carry no estimate dagger and list their sources under the price index table. The rest carry curated,
            source-verified estimates blended from Lambda, RunPod, Vast.ai, CoreWeave, TensorWave, Vultr, and Nebius
            listings. Prices move constantly and vary widely by provider, term, and availability; treat these as
            indicative, not quotes.
          </p>
        </>
      )}
    </PageShell>
  );
}

function PipelineHealthLine({ health }: { health: GpuPipelineHealth }) {
  const sweep = health.lastSweep;
  const failed = sweep ? sweep.perProvider.runpod.failed + sweep.perProvider.vast.failed : 0;
  return (
    <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-ink-muted" data-testid="ni-pipeline-health">
      Live observations: {health.recordedDays} days, last {health.lastRecordedDate ?? "none"}. Curated reprice: {health.curatedLastRefreshed ?? "unknown"}.
      {sweep ? (
        <span className={failed > 0 ? "text-warning" : ""}>
          {` Last sweep ${sweep.date}: ${failed > 0 ? `${failed} provider request${failed === 1 ? "" : "s"} failed` : `${sweep.usableModels} models recorded`} (RunPod ${sweep.perProvider.runpod.succeeded}/${sweep.perProvider.runpod.requests}, Vast ${sweep.perProvider.vast.succeeded}/${sweep.perProvider.vast.requests}).`}
        </span>
      ) : (
        <span> No provider sweep has completed in this process.</span>
      )}
    </p>
  );
}

interface DispersionRow {
  model: string;
  vendor: string;
  current: number;
  low: number;
  high: number;
  est: boolean;
}

/**
 * Same-scale dispersion strips: the observed low-high marketplace range per
 * model with a dot at the blended price. The spread multiple on the right is
 * the point of the chart: on-demand GPU rent is not one price. Strips read
 * context gray until a model is hovered, then take that model's slot color.
 */
function DispersionChart({
  rows,
  width,
  hovered,
  onHover,
}: {
  rows: DispersionRow[];
  width: number;
  hovered: string | null;
  onHover: (m: string | null) => void;
}) {
  const M = { top: 18, right: 108, left: 56 };
  const ROW_H = 30;
  const height = M.top + rows.length * ROW_H + 6;
  if (width <= 0) return null;

  const innerW = Math.max(40, width - M.left - M.right);
  const max = Math.max(...rows.map((r) => r.high), 1) * 1.05;
  const x = (v: number) => M.left + (v / max) * innerW;
  const tickStep = max > 8 ? 2 : 1;
  const ticks: number[] = [];
  // stop ticks short of the right rail so labels never collide with its captions
  for (let t = tickStep; t < max; t += tickStep) if (x(t) < width - M.right - 16) ticks.push(t);

  return (
    <>
      <svg width={width} height={height} className="block" role="img" aria-label="On-demand price dispersion by GPU model">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} y1={M.top - 4} x2={x(t)} y2={height - 4} stroke={BORDER.subtle} />
            <text x={x(t)} y={M.top - 8} textAnchor="middle" fontSize={10} fontFamily={FONT.sans} fill={INK.muted}>${t}</text>
          </g>
        ))}
        <text x={width - M.right + 44} y={M.top - 8} textAnchor="end" fontSize={10} fontFamily={FONT.sans} fill={INK.muted}>blended</text>
        <text x={width - 8} y={M.top - 8} textAnchor="end" fontSize={10} fontFamily={FONT.sans} fill={INK.muted}>spread</text>
        {rows.map((r, i) => {
          const cy = M.top + i * ROW_H + ROW_H / 2;
          const active = hovered === r.model;
          const dim = hovered !== null && !active;
          const mark = active ? colorFor(r.model) : CONTEXT;
          const spread = r.low > 0 ? r.high / r.low : null;
          return (
            <g
              key={r.model}
              opacity={dim ? 0.4 : 1}
              onPointerEnter={() => onHover(r.model)}
              onPointerLeave={() => onHover(null)}
              data-testid={`ni-disp-${r.model}`}
            >
              <title>
                {`${r.model} · $${r.current.toFixed(2)}/hr blended${r.est ? " (est.)" : ""} · observed $${r.low}-$${r.high}${spread ? ` · ${spread.toFixed(1)}x spread` : ""}`}
              </title>
              <rect x={0} y={cy - ROW_H / 2} width={width} height={ROW_H} fill="transparent" />
              <text x={M.left - 8} y={cy + 3.5} textAnchor="end" fontSize={11} fontWeight={600} fontFamily={FONT.sans} fill={active ? colorFor(r.model) : INK.primary}>{r.model}</text>
              <rect x={x(r.low)} y={cy - 2} width={Math.max(2, x(r.high) - x(r.low))} height={4} rx={2} fill={mark} opacity={0.35} />
              <circle cx={x(r.current)} cy={cy} r={active ? 5 : 4} fill={mark} />
              <text x={width - M.right + 44} y={cy + 3.5} textAnchor="end" fontSize={11} fontFamily={FONT.sans} fill={INK.secondary}>
                {fmtUsd(r.current)}
                {r.est && <tspan fontSize={9} fill={DATA_QUALITY.estimateFlag} dy={-3}>†</tspan>}
              </text>
              <text x={width - 8} y={cy + 3.5} textAnchor="end" fontSize={10} fontFamily={FONT.sans} fill={INK.muted}>
                {spread ? `${spread.toFixed(1)}×` : "—"}
              </text>
            </g>
          );
        })}
      </svg>
      <SrChartTable
        caption="On-demand GPU price dispersion ($/GPU/hr): observed low, blended price, observed high"
        columns={["Model", "Low", "Blended", "High"]}
        rows={rows.map((r) => [r.model, `$${r.low}`, `$${r.current.toFixed(2)}${r.est ? " est." : ""}`, `$${r.high}`])}
      />
    </>
  );
}

/**
 * Table sparkline with the same honesty treatment as the main chart:
 * per-series [min, max] domain with 10% padding, dashed interpolated spans,
 * hollow anchor dots and solid recorded dots. A single point renders as a
 * dot, not a fake line. Reads context gray until its row is hovered.
 */
function MiniSpark({ series, color }: { series: ChartSeries | undefined; color: string }) {
  const W = 104;
  const H = 22;
  if (!series || series.points.length === 0) {
    return <span className="text-[11px] text-ink-faint">no data</span>;
  }
  const pts = series.points;
  const geom = sparklineDomain(pts.map((p) => p.price));
  if (!geom) return <span className="text-[11px] text-ink-faint">no data</span>;
  const [d0, d1] = geom.domain;
  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t;
  const x = (t: number) => (t1 === t0 ? W / 2 : 2 + ((t - t0) / (t1 - t0)) * (W - 4));
  const y = (v: number) => H - 3 - ((v - d0) / (d1 - d0)) * (H - 6);

  return (
    <svg width={W} height={H} className="block" role="img" aria-label={`${series.model} price history sparkline`}>
      {series.spans.map((span, i) => (
        <polyline
          key={i}
          points={span.points.map((p) => `${x(p.t)},${y(p.price)}`).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth={1.4}
          strokeOpacity={span.quality === "observed" ? 1 : 0.55}
          strokeDasharray={span.quality === "observed" ? undefined : "3 3"}
          strokeLinecap="round"
        />
      ))}
      {pts.map((p) => (
        <circle
          key={p.t}
          cx={x(p.t)}
          cy={y(p.price)}
          r={p.kind === "anchor" ? 2 : 1.3}
          fill={p.kind === "anchor" ? SURFACE.base : color}
          stroke={color}
          strokeWidth={p.kind === "anchor" ? 1 : 0}
        />
      ))}
    </svg>
  );
}

function SortHeader({ label, k, cur, onClick }: { label: string; k: SortKey; cur: SortKey; dir: "asc" | "desc"; onClick: (k: SortKey) => void }) {
  const active = cur === k;
  return (
    <button
      onClick={() => onClick(k)}
      className={`inline-flex items-center gap-1 transition-colors hover:text-ink ${active ? "text-brand-ink" : ""}`}
      data-testid={`ni-sort-${k}`}
    >
      {label}
      <ArrowUpDown className="h-3 w-3" style={{ opacity: active ? 1 : 0.3 }} />
    </button>
  );
}
