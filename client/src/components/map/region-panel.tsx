/**
 * One grid region, explained: what it is, what it is carrying right now, how
 * stressed NERC rates it, what is being built inside it and the decisions on
 * the record there. Opens over the map (a drawer on desktop, a bottom sheet on
 * a phone); it is not a page. The full page for a region is /region/<id>,
 * which renders this same content.
 *
 * Every figure reads from data the site already keeps and says where it came
 * from and when. Nothing here is typed in: an empty source shows an honest
 * line, never a placeholder.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ArrowRight, X } from "lucide-react";
import { FuelMixBars } from "@/components/GridLiveCard";
import { LayerSwatch } from "@/components/map/map-controls";
import { RISK_COLOR } from "@/components/map/region-layer";
import { SourceFooter } from "@/components/SourceFooter";
import { Skeleton } from "@/components/ui/skeleton";
import { BOUNDARY_NOTE, BOUNDARY_SOURCE, gridRegion, type GridRegionId } from "@/data/grid-regions";
import { NERC_LTRA, type NercArea } from "@/data/nerc-reserve-margins";
import { STATE_GRID } from "@/data/state-grid";
import { fmtGW, fmtPeriodET, useGridLive } from "@/lib/grid-live";
import { regionDeals, regionForState, regionNercAreas, regionRiskLevel, regionRiskText, type DealLike, type RegionStats } from "@/lib/grid-regions";
import type { MapLayer } from "@/lib/map-layers";
import { longDay, statePageLinks, type PublishedStatePage } from "@/lib/state-pages";

/** Counts a number up from zero once it arrives. Still under reduced motion. */
function useCountUp(target: number | null, ms = 700): number | null {
  const [value, setValue] = useState<number | null>(null);
  const from = useRef<number | null>(null);
  useEffect(() => {
    if (target === null) {
      setValue(null);
      from.current = null;
      return;
    }
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || from.current === target) {
      setValue(target);
      from.current = target;
      return;
    }
    from.current = target;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      setValue(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

function Section({ title, children, testid }: { title: string; children: ReactNode; testid: string }) {
  return (
    <section className="border-t border-subtle px-4 py-3.5" data-testid={testid}>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">{title}</h3>
      {children}
    </section>
  );
}

/** One NERC area: its anticipated margin against its own reference level. */
function MarginGauge({ area }: { area: NercArea }) {
  const scale = Math.max(60, Math.ceil((area.margin + 6) / 10) * 10);
  const color = RISK_COLOR[area.risk];
  return (
    <div data-testid={`margin-gauge-${area.key}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-white/85">{area.label}</span>
        <span className="rounded px-1.5 py-0.5 text-10 font-semibold" style={{ color, backgroundColor: `${color}26` }}>
          {area.risk}
        </span>
      </div>
      <div className="relative mt-1.5 h-2 rounded-full bg-white/[0.07]" role="img" aria-label={`${area.label}: reserve margin ${area.margin.toFixed(1)} percent, reference ${area.reference} percent`}>
        <div className="gt-grow absolute inset-y-0 left-0 rounded-full" style={{ width: `${(area.margin / scale) * 100}%`, backgroundColor: color, opacity: 0.85 }} />
        <div className="absolute -inset-y-1 w-px bg-white/80" style={{ left: `${(area.reference / scale) * 100}%` }} />
      </div>
      <p className="mt-1 font-mono text-10 tabular-nums text-white/50">
        {area.margin.toFixed(1)}% margin, {area.season}
        <span className="text-white/35"> · reference {area.reference}%{area.referenceDefault ? " (NERC default)" : ""}</span>
      </p>
      {area.outlook && <p className="text-10 text-white/40">Later years: {area.outlook}</p>}
    </div>
  );
}

interface StateDetail {
  slug: string;
  name: string;
  documents?: Array<{ date: string; jurisdiction?: string; title: string }>;
}

export interface RegionPanelSources {
  /** "v2026.11.02", when the sites layer has loaded. */
  sitesVersion?: string;
  /** "2026-09", when the plants layer has loaded. */
  plantsMonth?: string;
  /** The size floor of the plants file, in MW. */
  plantsFloorMw?: number;
}

/** "49 MW" or "28.6 GW": a megawatt total at the scale it reads best. */
function power(mw: number): string {
  return mw >= 1000 ? `${fmtGW(mw)} GW` : `${Math.round(mw).toLocaleString("en-US")} MW`;
}

export function RegionContent({
  id,
  stats,
  sources,
  onShowLayer,
}: {
  id: GridRegionId;
  /** What sits inside the region's boundary; null while the layers load. */
  stats: RegionStats | null;
  sources?: RegionPanelSources;
  /** Shows one layer of this region on the map. Absent where there is no map to filter. */
  onShowLayer?: (layer: MapLayer) => void;
}) {
  const region = gridRegion(id);
  const { live, isLoading: liveLoading } = useGridLive();
  const demand = live?.demand[region.liveKey] ?? null;
  const mix = live?.mixByOperator?.[region.liveKey] ?? null;
  const gw = useCountUp(demand ? demand.latestMw / 1000 : null);

  const { data: deals } = useQuery<{ rows: DealLike[]; lastRefreshed?: string | null }>({ queryKey: ["/api/deals/metrics"] });
  const signed = regionDeals(deals?.rows, id);

  const { data: queue } = useQuery<{
    headline?: { pjmReopenedGW?: number; pjmReopenedProjects?: number; pjmReopenedAsOf?: string; ercotLargeLoadGW?: number; ercotLargeLoadAsOf?: string; queueOverallSourceUrl?: string };
  }>({ queryKey: ["/api/queue"] });
  const q = queue?.headline;

  const { data: statePages, isError: statePagesFailed } = useQuery<PublishedStatePage[]>({ queryKey: ["/api/state-pages"] });
  const states = statePageLinks(statePages, STATE_GRID).filter((s) => regionForState(s.code) === id);
  const details = useQueries({
    queries: states.map((s) => ({ queryKey: [`/api/state-pages/${s.slug}`] })),
  }) as Array<{ data?: StateDetail }>;
  const index = new Map((statePages ?? []).map((p) => [p.slug, p]));

  const areas = regionNercAreas(id);
  const risk = regionRiskLevel(id);

  return (
    <div data-testid={`region-content-${id}`}>
      <div className="px-4 pb-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: region.color }}>
          {region.kind === "market" ? "Market operator" : "No market operator"}
          <span className="font-normal text-white/40"> · {region.interconnection === "Texas" ? "the Texas grid" : `${region.interconnection} grid`}</span>
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-white/80">{region.description}</p>
        <p className="mt-2 text-[11px] leading-snug text-white/45">
          <span className="text-white/60">Covers:</span> {region.states}.
        </p>
        <p className="mt-1 text-10 text-white/35">
          As described by{" "}
          {[region.about, ...(region.also ?? [])].map((s, i, all) => (
            <span key={s.url + s.label}>
              {i > 0 && (i === all.length - 1 ? " and " : ", ")}
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-white/60">
                {s.label}
              </a>
            </span>
          ))}
          , read {longDay(region.checked)}.
        </p>
      </div>

      <Section title="Right now" testid="region-now">
        {liveLoading ? (
          <Skeleton className="h-9 w-40" />
        ) : demand ? (
          <>
            <p className="font-mono text-[26px] font-bold leading-none tabular-nums text-white" data-testid="region-demand">
              {gw === null ? "" : fmtGW(gw * 1000)} <span className="text-[13px] font-normal text-white/50">GW of demand</span>
            </p>
            <p className="mt-1 text-[11px] text-white/45">
              {fmtPeriodET(demand.latestPeriodUtc)} · 7-day peak {fmtGW(demand.peakMw)} GW
              {demand.composed && <span> · a sum, not one operator</span>}
            </p>
            {mix && (
              <div className="gt-grow-rows mt-3" data-testid="region-mix">
                <p className="mb-1 text-[11px] text-white/45">
                  What was generating at {fmtPeriodET(mix.periodUtc)} ({fmtGW(mix.totalMw, 0)} GW)
                </p>
                <FuelMixBars fuels={mix.fuels} limit={6} />
              </div>
            )}
            <SourceFooter
              className="mt-2"
              source="EIA Hourly Electric Grid Monitor"
              href={live?.sourceUrl}
              cadence={demand.composed ? demand.note : "hourly; fuel data posts later than demand"}
              stale={live?.stale ?? false}
              testid="region-live-source"
            />
          </>
        ) : (
          <p className="text-xs text-white/50" data-testid="region-demand-unavailable">
            Live demand for this region is not available right now. The latest hourly figures are on{" "}
            <a href="https://www.eia.gov/electricity/gridmonitor/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              EIA's grid monitor
            </a>
            .
          </p>
        )}
      </Section>

      <Section title="Stress" testid="region-stress">
        <p className="mb-2.5 text-[11px] leading-snug text-white/50">
          A reserve margin is the spare generating capacity an area expects above its peak demand. NERC rates each area against its own reference level, and
          also weighs extreme weather.
        </p>
        <div className="mb-2 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: RISK_COLOR[risk] }} />
          <span className="text-xs font-semibold text-white/90" data-testid="region-risk">
            NERC risk, 2026: {regionRiskText(id)}
          </span>
        </div>
        <div className="space-y-3">
          {areas.map((a) => (
            <MarginGauge key={a.key} area={a} />
          ))}
        </div>
        {region.nercNote && <p className="mt-2 text-10 leading-snug text-white/40">{region.nercNote}</p>}
        <SourceFooter className="mt-2" source={NERC_LTRA.label} href={NERC_LTRA.url} testid="region-stress-source" />
      </Section>

      <Section title="What is being built here" testid="region-built">
        {stats ? (
          <div className="-mx-2">
            {/* A layer still loading shows a placeholder, never a zero. */}
            <BuiltRow layer="campuses" label="Tracked campuses" count={stats.campuses?.count ?? null} onShow={onShowLayer}>
              {!stats.campuses
                ? undefined
                : stats.campuses.built400 > 0
                  ? `${fmtGW(stats.campuses.builtMw400)} GW built or building at the ${stats.campuses.built400} of 400 MW and up${
                      stats.campuses.count400 > stats.campuses.built400 ? `; ${stats.campuses.count400 - stats.campuses.built400} more announced` : ""
                    }`
                  : stats.campuses.count400 > 0
                    ? `none of 400 MW and up built or building yet; ${stats.campuses.count400} announced`
                    : stats.campuses.count > 0
                      ? "none of 400 MW and up"
                      : undefined}
            </BuiltRow>
            <BuiltRow layer="sites" label="Data center sites" count={stats.sites} onShow={onShowLayer}>
              locations only; size is not published
            </BuiltRow>
            <BuiltRow layer="clusters" label="AI clusters" count={stats.clusters?.count ?? null} onShow={onShowLayer}>
              {stats.clusters && stats.clusters.count > 0 ? `${power(stats.clusters.plannedMw)} planned, an estimate for most` : undefined}
            </BuiltRow>
            <BuiltRow layer="plants" label="Power plants" count={stats.plants?.count ?? null} onShow={onShowLayer}>
              {stats.plants && stats.plants.count > 0
                ? `${power(stats.plants.mw)} nameplate${sources?.plantsFloorMw ? `, plants of ${sources.plantsFloorMw} MW and up plus all nuclear` : ""}`
                : undefined}
            </BuiltRow>
            <Link
              href="/grid?tab=deals"
              className="flex items-baseline gap-2.5 rounded px-2 py-1.5 no-underline transition-colors hover:bg-white/[0.06]"
              data-testid="region-built-deals"
            >
              <span className="w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="text-xs text-white/85">Signed power agreements</span>
                  {signed ? (
                    <span className="ml-auto font-mono text-[13px] font-bold tabular-nums text-white">{signed.count}</span>
                  ) : (
                    <Skeleton className="ml-auto h-4 w-8" aria-label="loading" />
                  )}
                </span>
                {signed && signed.count > 0 && (
                  <span className="block text-10 leading-snug text-white/45">
                    {signed.mw > 0 ? `${signed.mw.toLocaleString("en-US")} MW` : "capacity not disclosed"}
                    {signed.mw > 0 && signed.undisclosed > 0 ? `, ${signed.undisclosed} undisclosed` : ""}
                  </span>
                )}
              </span>
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        )}
        {id === "pjm" && typeof q?.pjmReopenedGW === "number" && (
          <p className="mt-2 text-[11px] leading-snug text-white/55" data-testid="region-queue">
            Waiting to connect: <span className="font-mono text-white/85">{q.pjmReopenedGW} GW</span>
            {q.pjmReopenedProjects ? ` across ${q.pjmReopenedProjects} projects` : ""} in PJM's reopened queue. <span className="text-white/35">{q.pjmReopenedAsOf}</span>
          </p>
        )}
        {id === "ercot" && typeof q?.ercotLargeLoadGW === "number" && (
          <p className="mt-2 text-[11px] leading-snug text-white/55" data-testid="region-queue">
            Asking to connect: <span className="font-mono text-white/85">{q.ercotLargeLoadGW} GW</span> of large-load requests, mostly data centers.{" "}
            <span className="text-white/35">{q.ercotLargeLoadAsOf}</span>
          </p>
        )}
        <SourceFooter
          className="mt-2"
          source="GridTilt registries"
          href="/data-status"
          cadence={[
            sources?.sitesVersion ? `sites: PNNL IM3 atlas ${sources.sitesVersion}, © OpenStreetMap contributors` : null,
            sources?.plantsMonth ? `plants: EIA-860M ${sources.plantsMonth}` : null,
            "plants are placed by the balancing authority each reports to EIA, everything else by the region as drawn",
          ]
            .filter(Boolean)
            .join(" · ")}
          testid="region-built-source"
        />
      </Section>

      <Section title="Decisions on the record" testid="region-decisions">
        {!statePages ? (
          statePagesFailed ? (
            <p className="text-xs text-white/50">The record of public decisions did not load. Reload the page to try again.</p>
          ) : (
            <Skeleton className="h-10 w-full" />
          )
        ) : states.length === 0 ? (
          <p className="text-xs text-white/50">GridTilt does not keep a dated record of public decisions for a state in this region yet.</p>
        ) : (
          <div className="space-y-3">
            {states.map((s, i) => {
              const row = index.get(s.slug);
              const docs = [...(details[i]?.data?.documents ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 2);
              return (
                <div key={s.slug} data-testid={`region-state-${s.slug}`}>
                  <Link href={s.href} className="group flex items-baseline gap-2 no-underline">
                    <span className="text-[13px] font-semibold text-white/90 group-hover:text-brand">{s.name}</span>
                    {typeof row?.decisions === "number" && (
                      <span className="text-[11px] text-white/45">
                        {row.decisions} dated {row.decisions === 1 ? "decision" : "decisions"}
                      </span>
                    )}
                    <ArrowRight className="ml-auto h-3 w-3 text-white/40 group-hover:text-brand" aria-hidden />
                  </Link>
                  {docs.map((d) => (
                    <p key={`${d.date}-${d.title}`} className="mt-1 text-[11px] leading-snug text-white/55">
                      <span className="font-mono text-10 tabular-nums text-white/40">{longDay(d.date)}</span> {d.title}
                    </p>
                  ))}
                  {row?.nextDate && (
                    <p className="mt-1 text-[11px] leading-snug text-white/55">
                      <span className="text-white/40">Next public date:</span> <span className="font-mono text-10 tabular-nums">{longDay(row.nextDate.date)}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <p className="border-t border-subtle px-4 py-3 text-10 leading-snug text-white/35" data-testid="region-boundary-note">
        {BOUNDARY_NOTE} Lines:{" "}
        <a href={BOUNDARY_SOURCE.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-white/60">
          {BOUNDARY_SOURCE.label}
        </a>
        .
      </p>
    </div>
  );
}

function BuiltRow({
  layer,
  label,
  count,
  onShow,
  children,
}: {
  layer: MapLayer;
  label: string;
  /** Null while the layer loads. */
  count: number | null;
  onShow?: (layer: MapLayer) => void;
  children?: ReactNode;
}) {
  // Name and count on one line, the detail under them: a long detail never squeezes the name.
  const body = (
    <>
      <LayerSwatch layer={layer} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="text-xs text-white/85">{label}</span>
          {count === null ? (
            <Skeleton className="ml-auto h-4 w-8" aria-label="loading" />
          ) : (
            <span className="ml-auto font-mono text-[13px] font-bold tabular-nums text-white">{count.toLocaleString("en-US")}</span>
          )}
        </span>
        {children && <span className="block text-10 leading-snug text-white/45">{children}</span>}
      </span>
    </>
  );
  if (!onShow) {
    return (
      <div className="flex items-baseline gap-2.5 px-2 py-1.5" data-testid={`region-built-${layer}`}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onShow(layer)}
      title={`Show only this region's ${label.toLowerCase()} on the map`}
      className="flex w-full items-baseline gap-2.5 rounded px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06]"
      data-testid={`region-built-${layer}`}
    >
      {body}
    </button>
  );
}

/** The drawer over the map. The content is RegionContent; this is its frame. */
export function RegionPanel({
  id,
  stats,
  sources,
  onClose,
  onShowLayer,
}: {
  id: GridRegionId;
  stats: RegionStats | null;
  sources?: RegionPanelSources;
  onClose: () => void;
  onShowLayer: (layer: MapLayer) => void;
}) {
  const region = gridRegion(id);
  const scroller = useRef<HTMLDivElement>(null);
  // Phone: the sheet can be folded down to its title, so the map behind it can be read and moved.
  const [folded, setFolded] = useState(false);
  const dragFrom = useRef<number | null>(null);
  // A new region starts at its top, unfolded.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    setFolded(false);
  }, [id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      key={id}
      className={`gt-panel-in pointer-events-auto absolute inset-x-0 bottom-0 z-[1050] flex flex-col rounded-t-xl border border-subtle bg-surface-raised shadow-2xl sm:inset-x-auto sm:bottom-3 sm:right-3 sm:top-3 sm:max-h-none sm:w-[372px] sm:rounded-lg ${
        folded ? "max-h-[92px] sm:max-h-none" : "max-h-[68%]"
      }`}
      aria-label={`${region.fullName}`}
      data-testid="region-panel"
    >
      {/* The handle: tap to fold or unfold, or drag it down and up. */}
      <button
        type="button"
        className="flex h-6 w-full shrink-0 touch-none items-center justify-center sm:hidden"
        aria-expanded={!folded}
        aria-label={folded ? `Show ${region.name}` : `Fold ${region.name} down to see the map`}
        onPointerDown={(e) => {
          dragFrom.current = e.clientY;
        }}
        onPointerUp={(e) => {
          const moved = dragFrom.current === null ? 0 : e.clientY - dragFrom.current;
          dragFrom.current = null;
          // A drag sets the state it points at; a tap flips it.
          setFolded(Math.abs(moved) > 12 ? moved > 0 : !folded);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setFolded(!folded);
          }
        }}
        data-testid="region-panel-handle"
      >
        <span className="block h-1 w-9 rounded-full bg-white/25" aria-hidden />
      </button>
      <div className="flex shrink-0 items-start gap-3 px-4 pb-2 pt-3">
        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: region.color }} aria-hidden />
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold leading-tight tracking-tight text-white" data-testid="region-panel-title">
            {region.name}
          </h2>
          {region.fullName !== region.name && <p className="text-[11px] text-white/45">{region.fullName}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 ml-auto rounded p-2 text-white/50 hover:bg-white/10 hover:text-white"
          aria-label="Close region"
          data-testid="region-panel-close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {/* Phone: room under the last line, so it scrolls clear of the site's floating bar. */}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-20 sm:pb-0">
        <RegionContent id={id} stats={stats} sources={sources} onShowLayer={onShowLayer} />
        <div className="border-t border-subtle px-4 py-3">
          <Link href={`/region/${id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand no-underline hover:text-brand-2" data-testid="region-panel-page">
            The full {region.name} page <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </div>
    </aside>
  );
}
