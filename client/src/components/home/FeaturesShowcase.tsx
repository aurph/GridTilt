import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { geoAlbersUsa, geoPath } from "d3";
import type { FeatureCollection } from "geojson";
import { ArrowRight } from "lucide-react";
import { heatColor, heatTextColor } from "@/lib/stack-transforms";
import { STAGE_LABELS, supplyNodes } from "@/data/supply-chain-config";
import statesGeoRaw from "@/data/us-states.geo.json";
import { Skeleton } from "@/components/ui/skeleton";
import { filterTrackedFacilities } from "@/lib/real-gauges";
import { electricityData } from "@/data/electricity-demand";

/**
 * Module directory: six cards, each carrying a LIVE micro-preview drawn from
 * the app's real data. No decorative pseudo-data anywhere. If data has not
 * loaded, a quiet skeleton stands in; nothing is ever invented.
 */

// -- Preview 1: real sector heat strip (/api/sector-pulse) ------------------
interface SectorPulse { sector: string; label: string; avgChange: number; }

function SectorHeatStrip() {
  const { data } = useQuery<SectorPulse[]>({ queryKey: ["/api/sector-pulse"] });
  if (!data) return <PreviewSkeleton />;
  const rows = [...data].sort((a, b) => b.avgChange - a.avgChange);
  return (
    <div className="grid h-full grid-cols-4 grid-rows-3 gap-1" data-testid="preview-heat">
      {rows.slice(0, 12).map((s) => (
        <div
          key={s.sector}
          className="flex flex-col items-center justify-center overflow-hidden rounded-[3px] px-0.5"
          style={{ background: heatColor(s.avgChange) }}
          title={`${s.label} ${s.avgChange >= 0 ? "+" : ""}${s.avgChange.toFixed(2)}%`}
        >
          <span className="w-full truncate text-center text-[8px] font-medium leading-tight" style={{ color: heatTextColor(s.avgChange), opacity: 0.85 }}>
            {s.label}
          </span>
          <span className="font-mono text-[9px] font-bold tabular-nums leading-tight" style={{ color: heatTextColor(s.avgChange) }}>
            {s.avgChange >= 0 ? "+" : ""}{s.avgChange.toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  );
}

// -- Preview 2: the real US map (d3 Albers + real facility coordinates) -----
interface Facility { lat: number; lng: number; status: string; powerMW: number; }
const STATES = statesGeoRaw as unknown as FeatureCollection;
const CONTINENTAL: FeatureCollection = {
  type: "FeatureCollection",
  features: STATES.features.filter((f) => !["Alaska", "Hawaii", "Puerto Rico"].includes((f.properties as { name?: string })?.name ?? "")),
};
const MAP_W = 300, MAP_H = 180;
const PROJECTION = geoAlbersUsa().fitSize([MAP_W, MAP_H], CONTINENTAL);
const STATE_PATHS = CONTINENTAL.features.map((f) => geoPath(PROJECTION)(f) ?? "");
const STATUS_OPACITY: Record<string, number> = { operational: 0.95, construction: 0.6, announced: 0.32 };

function RealUSMap() {
  const { data } = useQuery<Facility[]>({ queryKey: ["/api/datacenters"] });
  const dots = useMemo(() => {
    if (!data) return null;
    return filterTrackedFacilities(data).map((f, i) => {
      const p = PROJECTION([f.lng, f.lat]);
      if (!p) return null;
      return { x: p[0], y: p[1], o: STATUS_OPACITY[f.status] ?? 0.3, i };
    }).filter(Boolean) as { x: number; y: number; o: number; i: number }[];
  }, [data]);
  if (!dots) return <PreviewSkeleton />;
  return (
    <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="h-full w-full" data-testid="preview-map" aria-hidden>
      <g fill="none" stroke="#3a3a3a" strokeWidth="0.6">
        {STATE_PATHS.map((d, i) => <path key={i} d={d} />)}
      </g>
      <g fill="#F07800">
        {dots.map((d) => <circle key={d.i} cx={d.x} cy={d.y} r={2.3} fillOpacity={d.o} />)}
      </g>
    </svg>
  );
}

// -- Preview 3: the real supply chain (derived from the config) -------------
const STAGE_SECURITY_COUNT = STAGE_LABELS.map((st) => ({
  ...st,
  count: new Set(supplyNodes.filter((n) => n.stage === st.id).flatMap((n) => n.companies.map((c) => c.ticker))).size,
}));
const BOTTLENECK_INDEX = STAGE_SECURITY_COUNT.reduce((max, s, i, a) => (s.count > a[max].count ? i : max), 0);

function SupplyChainMini() {
  const n = STAGE_SECURITY_COUNT.length;
  return (
    <svg viewBox="0 0 300 120" className="h-full w-full" data-testid="preview-chain" aria-hidden>
      <line x1="30" y1="55" x2="270" y2="55" stroke="#2a2a2a" strokeWidth="1" />
      {STAGE_SECURITY_COUNT.map((s, i) => {
        const x = 30 + (i * 240) / (n - 1);
        const hot = i === BOTTLENECK_INDEX;
        return (
          <g key={s.id}>
            <rect x={x - 11} y={44} width={22} height={22} rx={3}
              fill={hot ? "#F07800" : "#161616"} stroke={hot ? "#F07800" : "#3a3a3a"} strokeWidth="1" />
            <text x={x} y={58} textAnchor="middle" className="fill-white font-mono" fontSize="9" fontWeight="700">{s.count}</text>
            <text x={x} y={84} textAnchor="middle" fill={hot ? "#F0A500" : "#8a8a85"} fontSize="7.5" fontWeight="600">
              {s.name.split(" ")[0]}
            </text>
          </g>
        );
      })}
      <text x="150" y="106" textAnchor="middle" fill="#8a8a85" fontSize="8">securities tracked per stage</text>
    </svg>
  );
}

// -- Preview 4: the real next catalysts (/api/catalysts/all) ----------------
interface CatalystItem {
  id: string; date: string; sortDate: string; ticker?: string; company?: string; title?: string; type: string;
  /** Month windows and estimates carry a label instead of a day (see server catalyst-lifecycle.ts). */
  dateLabel?: string; exactDay?: boolean;
}
function fmtDay(d: string): string {
  return new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function CatalystRows() {
  const { data } = useQuery<{ items: CatalystItem[] }>({ queryKey: ["/api/catalysts/all"] });
  if (!data) return <PreviewSkeleton />;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const next = [...data.items]
    // Catalysts arrive already filtered to upcoming by the server's rule.
    .filter((c) => c.type === "catalyst" || new Date(`${c.sortDate.slice(0, 10)}T12:00:00`) >= today)
    .sort((a, b) => a.sortDate.localeCompare(b.sortDate))
    .slice(0, 4);
  return (
    <div className="flex h-full flex-col justify-center gap-1.5" data-testid="preview-catalysts">
      {next.map((c) => (
        <div key={c.id} className="flex items-center gap-2.5">
          <span className="w-11 shrink-0 font-mono text-[10px] tabular-nums text-brand">
            {c.type === "catalyst" && c.exactDay === false && c.dateLabel ? c.dateLabel : fmtDay(c.sortDate)}
          </span>
          <span className="truncate text-[11px] text-foreground">
            {c.ticker ? <span className="font-semibold">{c.ticker}</span> : null}{" "}
            <span className="text-muted-foreground">{c.type === "earnings" ? "earnings" : c.title}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// -- Preview 5: real portfolio axes, honestly empty -------------------------
const SEGMENTS = ["Compute", "Infra", "Power", "Cooling", "Grid"];
function PortfolioPentagon() {
  const cx = 60, cy = 55, r = 40;
  const pts = SEGMENTS.map((_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / SEGMENTS.length;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  });
  return (
    <svg viewBox="0 0 240 110" className="h-full w-full" data-testid="preview-radar" aria-hidden>
      <polygon points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#3a3a3a" strokeWidth="1" />
      {pts.map((p, i) => <line key={i} x1={cx} y1={cy} x2={p[0]} y2={p[1]} stroke="#2a2a2a" strokeWidth="0.75" />)}
      {pts.map((p, i) => (
        <text key={i} x={p[0] + (p[0] > cx ? 4 : p[0] < cx ? -4 : 0)} y={p[1] + (p[1] > cy ? 8 : -3)}
          textAnchor={p[0] > cx + 2 ? "start" : p[0] < cx - 2 ? "end" : "middle"} fill="#8a8a85" fontSize="8">
          {SEGMENTS[i]}
        </text>
      ))}
      <text x="180" y="52" textAnchor="middle" fill="#8a8a85" fontSize="9.5">Enter tickers</text>
      <text x="180" y="66" textAnchor="middle" fill="#5c5c58" fontSize="8">to compare sectors</text>
    </svg>
  );
}

// -- Preview 6: the measured US demand curve ---------------------------------
// The same EIA series as the landing and Overview charts. It used to end in a
// dashed "2030 proj." line to 6,210 TWh that no source supported.
const DEMAND = electricityData
  .filter((d): d is typeof d & { demand: number } => d.demand !== null)
  .map((d) => ({ year: Number(d.year), twh: d.demand }));
function DemandSparkline() {
  const W = 260, H = 96, PAD = 6;
  if (DEMAND.length < 2) return <PreviewSkeleton />;
  const xs = DEMAND.map((d) => d.year);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const vs = DEMAND.map((d) => d.twh);
  const minV = Math.min(...vs), maxV = Math.max(...vs);
  const px = (y: number) => PAD + ((y - minX) / (maxX - minX)) * (W - 2 * PAD);
  const py = (v: number) => H - PAD - ((v - minV) / (maxV - minV)) * (H - 2 * PAD);
  const pts = DEMAND.map((d) => `${px(d.year)},${py(d.twh)}`).join(" ");
  const last = DEMAND[DEMAND.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" data-testid="preview-demand" aria-hidden>
      <polyline points={pts} fill="none" stroke="#8a8a85" strokeWidth="1.5" />
      <circle cx={px(last.year)} cy={py(last.twh)} r="2.5" fill="#F07800" />
      <text x={px(minX)} y={H - 1} fill="#5c5c58" fontSize="8">{minX}</text>
      <text x={px(maxX)} y={H - 1} textAnchor="end" fill="#8a8a85" fontSize="8">{maxX}</text>
    </svg>
  );
}

function PreviewSkeleton() {
  return <Skeleton className="h-full w-full rounded-[3px]" />;
}

interface Module { number: string; name: string; caption: string; cta: string; route: string; preview: () => JSX.Element; }
const MODULES: Module[] = [
  { number: "01", name: "Equity Heatmap", caption: "One hundred public companies behind the buildout, priced live.", cta: "Open the heatmap", route: "/stack", preview: SectorHeatStrip },
  // Caption is filled in from /api/datacenters at render; see facilityCaption.
  // A hardcoded count cannot survive here: the datacenter ingester appends new
  // facilities every 6 hours, which is how this card came to claim 33 while the
  // map directly beneath it plotted 58.
  { number: "02", name: "Power Map", caption: "", cta: "Open the map", route: "/power-map", preview: RealUSMap },
  { number: "03", name: "Supply Chain Flow", caption: "Where the buildout can get stuck, mapped to the companies exposed.", cta: "Trace the chain", route: "/stack?view=flow", preview: SupplyChainMini },
  { number: "04", name: "Catalyst Tracker", caption: "Earnings dates, rule changes, and policy votes. One calendar.", cta: "See what's next", route: "/catalysts", preview: CatalystRows },
  { number: "05", name: "Analyze: Baskets", caption: "Compare how GridTilt classifies a set of tickers across five sectors.", cta: "Compare tickers", route: "/analyze?tab=portfolio", preview: PortfolioPentagon },
  { number: "06", name: "Analyze: Scenario", caption: "Set your own growth and build assumptions and see the 2030 arithmetic.", cta: "Run a scenario", route: "/analyze?tab=scenario", preview: DemandSparkline },
];

/**
 * Live caption for the Power Map card. Shares the /api/datacenters query key with
 * RealUSMap and applies the same >= 400 MW floor, so the sentence, the dots and
 * the Power Map itself report one count. No number while the request is in flight.
 */
function useFacilityCaption(): string {
  const { data } = useQuery<Facility[]>({ queryKey: ["/api/datacenters"] });
  const suffix = "plotted by operator and grid region.";
  if (!data) return `Tracked facilities, ${suffix}`;
  return `${filterTrackedFacilities(data).length} tracked facilities, ${suffix}`;
}

export function FeaturesShowcase() {
  const facilityCaption = useFacilityCaption();
  return (
    <section className="border-b border-border bg-background" data-testid="home-features">
      <div className="mx-auto max-w-[1200px] px-6 py-16 sm:py-20">
        <h2 className="text-[28px] font-bold leading-tight tracking-tight text-foreground sm:text-[36px]">
          Six places to start.
        </h2>
        <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground">
          Each shows a different slice of the buildout, live. Pick the one closest to what you already follow.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => {
            const Preview = m.preview;
            return (
              <Link
                key={m.number}
                href={m.route}
                className="group flex flex-col rounded-md border border-border bg-card p-5 no-underline transition-colors hover:border-brand/50"
                data-testid={`feature-card-${m.number}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-[17px] font-semibold text-foreground">{m.name}</h3>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground/50">{m.number}</span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                  {m.caption || facilityCaption}
                </p>
                <div className="my-4 h-[120px] w-full rounded border border-border/60 bg-background/60 p-2.5">
                  <Preview />
                </div>
                <span className="mt-auto flex items-center gap-1.5 text-[13px] font-semibold text-brand">
                  {m.cta}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
