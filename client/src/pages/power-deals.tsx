import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AsOf, ErrorState, SrChartTable } from "@/components/Freshness";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
} from "recharts";
import { Handshake, ArrowUpDown } from "lucide-react";
import { BORDER, BRAND, CATEGORY_COLORS, FONT, INK, SEMANTIC, SERIES, STATUS_COLORS } from "@/lib/tokens";
import { axisProps, gridProps, tooltipContentStyle } from "@/lib/chart-theme";

interface Bucket { key: string; count: number; mw: number; }
interface DealRow {
  id: string;
  name: string;
  sponsor: string;
  offtaker: string;
  offtakerRaw: string;
  type: string;
  capacityMW: number;
  iso: string | null;
  state: string | null;
  status: string;
  online: string | null;
  sources: string[];
  notes: string | null;
}
interface DealMetrics {
  dealCount: number;
  totalContractedMW: number;
  topBuyer: string | null;
  byOfftaker: Bucket[];
  byType: Bucket[];
  byStatus: Bucket[];
  rows: DealRow[];
  lastRefreshed: string | null;
}

// Energy types from CATEGORY_COLORS; hybrid/geothermal have no token
// category, so they take free SERIES slots (distinct from co-occurring types;
// hybrid matches Queue's slot).
const TYPE_COLOR: Record<string, string> = {
  nuclear: CATEGORY_COLORS.nuclear,
  solar: CATEGORY_COLORS.solar,
  wind: CATEGORY_COLORS.wind,
  gas: CATEGORY_COLORS.gas,
  hybrid: SERIES[5], // series slot 6
  hydro: CATEGORY_COLORS.hydro,
  geothermal: SERIES[4], // series slot 5
};
const typeColor = (t: string) => TYPE_COLOR[t] ?? INK.muted;

const STATUS_COLOR: Record<string, string> = {
  operational: STATUS_COLORS.operational,
  active: SEMANTIC.warning,
  announced: STATUS_COLORS.announced,
};

const gw = (mw: number) => (mw / 1000).toFixed(mw >= 10_000 ? 0 : 1);

type SortKey = "capacityMW" | "name" | "offtaker" | "type" | "online";

// `params` keeps this assignable to wouter's <Route component={...}> while the
// standalone /power-deals route lives on; `embedded` is the Power-tool tab mode.
export default function PowerDeals({ embedded = false }: { embedded?: boolean; params?: unknown }) {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<DealMetrics>({ queryKey: ["/api/deals/metrics"] });
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("capacityMW");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = data?.rows ?? [];

  const byBuyer = useMemo(
    () => (data?.byOfftaker ?? []).map((b) => ({ buyer: b.key, gw: +(b.mw / 1000).toFixed(2), count: b.count })),
    [data],
  );

  const visibleRows = useMemo(() => {
    const filtered = typeFilter ? rows.filter((r) => r.type === typeFilter) : rows;
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "capacityMW") cmp = a.capacityMW - b.capacityMW;
      else cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, typeFilter, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "capacityMW" ? "desc" : "asc"); }
  };

  // Shared by both intros: the freshness / headline chip column.
  const asOfChip = (
    <div className="text-11 text-muted-foreground/70 font-mono tracking-wide text-right space-y-0.5" data-testid="deals-sync">
      <div><AsOf updatedAt={dataUpdatedAt} intervalMs={900_000} /></div>
      {data?.lastRefreshed && <div className="text-muted-foreground/60">data as of {data.lastRefreshed}</div>}
      {data && <div>{data.dealCount} deals · {gw(data.totalContractedMW)} GW contracted</div>}
      {data?.topBuyer && <div>top buyer: <span className="text-brand">{data.topBuyer}</span></div>}
    </div>
  );

  // Embedded mode (Power tool, Deals tab): the host page owns the hero, so
  // render a slim intro row instead of the full-page header.
  const intro = embedded ? (
    <div className="flex flex-wrap items-start justify-between gap-3 px-1">
      <p className="text-muted-foreground text-xs leading-relaxed max-w-3xl">
        Corporate power procurement for AI: every named deal where a hyperscaler or AI company has contracted
        generation (a PPA, a reactor restart, an SMR option) to feed its compute. Capacity is the contracted
        figure; open a row for terms and sources.
      </p>
      {asOfChip}
    </div>
  ) : (
    <div className="grid-bg border-b border-border px-4 sm:px-6 py-6 sm:py-8" data-testid="deals-header">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 mb-2">
            <Handshake className="h-5 w-5 text-brand" />
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight" style={{ fontFamily: FONT.mono }}>
              AI Power Deals
            </h1>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Corporate power procurement for AI: every named deal where a hyperscaler or AI company has
            contracted generation (a PPA, a reactor restart, an SMR option) to feed its compute. The data-center
            sites themselves live in <Link href="/compute-frontier" className="text-brand hover:text-brand-2">Compute Frontier</Link>;
            this is the power behind them. Capacity is the contracted figure; open a row for terms and sources.
          </p>
        </div>
        {asOfChip}
      </div>
    </div>
  );

  return (
    <div className={embedded ? "flex flex-col" : "flex flex-col h-full overflow-y-auto"}>
      {intro}

      <div className={embedded ? "flex-1 space-y-5 mt-3" : "flex-1 p-4 sm:p-6 space-y-5"}>
        {/* Headline tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile label="Tracked deals" value={data ? String(data.dealCount) : "—"} loading={isLoading} />
          <StatTile label="Contracted power" value={data ? `${gw(data.totalContractedMW)} GW` : "—"} loading={isLoading} />
          <StatTile label="Top buyer" value={data?.topBuyer ?? "—"} loading={isLoading} />
          <StatTile label="Energy types" value={data ? String(data.byType.length) : "—"} loading={isLoading} />
        </div>

        {/* Contracted power by buyer */}
        <Card className="border-card-border p-3" data-testid="deals-buyers">
          <span className="text-11 font-mono uppercase tracking-wider text-muted-foreground">Contracted power by buyer · GW</span>
          {isLoading ? (
            <Skeleton className="h-[300px] w-full mt-2" />
          ) : isError ? (
            <ErrorState label="The deals dataset failed to load." onRetry={() => refetch()} className="h-[300px]" />
          ) : byBuyer.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-xs text-muted-foreground">No deals.</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, byBuyer.length * 32)}>
              <BarChart data={byBuyer} layout="vertical" margin={{ left: 8, right: 56, top: 8, bottom: 4 }}>
                <CartesianGrid {...gridProps} vertical={true} horizontal={false} />
                <XAxis {...axisProps} type="number" tickFormatter={(v) => `${v}`} />
                <YAxis {...axisProps} type="category" dataKey="buyer" width={140} />
                <RTooltip
                  cursor={{ fill: BORDER.subtle }}
                  contentStyle={tooltipContentStyle}
                  formatter={(v: number, _n, p: any) => [`${v} GW across ${p.payload.count} deal${p.payload.count === 1 ? "" : "s"}`, p.payload.buyer]}
                />
                <Bar dataKey="gw" fill={BRAND.primary} radius={[0, 3, 3, 0]} isAnimationActive={false}
                  label={{ position: "right", formatter: (v: number) => `${v}`, fill: INK.muted, fontSize: 10, fontFamily: FONT.mono }} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {byBuyer.length > 0 && (
            <SrChartTable
              caption="Contracted power by buyer, in gigawatts"
              columns={["Buyer", "GW"]}
              rows={byBuyer.map((b) => [b.buyer, b.gw])}
            />
          )}
        </Card>

        {/* Energy type filter row */}
        {data && (
          <div className="flex flex-wrap items-center gap-1.5" data-testid="deals-type-filter">
            <button
              onClick={() => setTypeFilter(null)}
              className={`px-2.5 py-1 rounded text-xs font-mono border transition-colors ${typeFilter === null ? "border-brand text-brand bg-brand/10" : "border-subtle text-muted-foreground hover:text-foreground"}`}
            >
              all types
            </button>
            {data.byType.map((b) => {
              const on = typeFilter === b.key;
              return (
                <button
                  key={b.key}
                  onClick={() => setTypeFilter(on ? null : b.key)}
                  className="px-2.5 py-1 rounded text-xs font-mono border transition-colors"
                  style={{
                    borderColor: on ? typeColor(b.key) : BORDER.subtle,
                    color: on ? typeColor(b.key) : INK.muted,
                    background: on ? `${typeColor(b.key)}14` : "transparent",
                  }}
                >
                  {b.key} · {gw(b.mw)} GW
                </button>
              );
            })}
          </div>
        )}

        {/* Deals table */}
        <Card className="border-card-border overflow-hidden" data-testid="deals-table">
          <div className="px-4 py-2 bg-surface-base border-b border-border">
            <span className="text-11 font-mono uppercase tracking-wider text-muted-foreground">Deals</span>
            <span className="text-10 font-mono text-muted-foreground/40 ml-2">{visibleRows.length} shown · hover for terms + sources</span>
          </div>
          {isError ? (
            <ErrorState label="The deals dataset failed to load." onRetry={() => refetch()} />
          ) : (
          <div className="overflow-x-auto">
          <div className="min-w-[680px]">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-surface-base border-b border-border text-10 font-mono uppercase tracking-wider text-muted-foreground">
            <SortHeader label="Buyer" k="offtaker" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-2" />
            <span className="col-span-4">Generator / project</span>
            <SortHeader label="Type" k="type" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-2" />
            <SortHeader label="Capacity" k="capacityMW" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-2 justify-end" />
            <SortHeader label="Online" k="online" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-2 justify-end" />
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">{Array(10).fill(null).map((_, i) => <Skeleton key={i} className="h-7" />)}</div>
          ) : (
            visibleRows.map((r) => (
              <UITooltip key={r.id}>
                <TooltipTrigger asChild>
                  <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-border/30 last:border-0 text-xs hover:bg-brand/5 cursor-help items-center" data-testid={`deal-row-${r.id}`}>
                    <span className="col-span-2 font-mono font-semibold text-foreground truncate">{r.offtaker}</span>
                    <span className="col-span-4 text-muted-foreground truncate">{r.name} <span className="text-muted-foreground/40">· {r.sponsor}</span></span>
                    <span className="col-span-2 font-mono">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: typeColor(r.type) }} />
                        <span style={{ color: typeColor(r.type) }}>{r.type}</span>
                      </span>
                    </span>
                    <span className="col-span-2 font-mono text-foreground text-right tabular-nums">{gw(r.capacityMW)} GW</span>
                    <span className="col-span-2 font-mono text-muted-foreground text-right tabular-nums text-11">{r.online ?? "—"}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-md p-3">
                  <div className="text-xs font-semibold mb-1 text-foreground">{r.name}</div>
                  <div className="text-11 text-muted-foreground mb-1.5">
                    <span style={{ color: typeColor(r.type) }}>{r.type}</span> · {gw(r.capacityMW)} GW · {r.sponsor} → {r.offtakerRaw}
                    {r.state ? ` · ${r.state}` : ""}{r.iso ? ` (${r.iso})` : ""} · <span style={{ color: STATUS_COLOR[r.status] ?? INK.muted }}>{r.status}</span>
                  </div>
                  {r.notes && <p className="text-11 text-muted-foreground/80 mb-1.5">{r.notes}</p>}
                  {r.sources.length > 0 && (
                    <div className="text-10 font-mono text-muted-foreground/60">
                      <span className="uppercase tracking-wider text-muted-foreground/50">sources: </span>{r.sources.join(" · ")}
                    </div>
                  )}
                </TooltipContent>
              </UITooltip>
            ))
          )}
          </div>
          </div>
          )}
        </Card>

        <p className="text-11 text-muted-foreground/60 leading-relaxed px-1">
          Deals are corporate power-purchase agreements, reactor restarts, and SMR options with a named AI / hyperscaler
          offtaker, drawn from <span className="font-mono">server/data/interconnection-queue.json</span>. Capacity is the
          contracted figure as disclosed; staged deals show their full target. Terms and sources are on each row.
        </p>
      </div>
    </div>
  );
}

function StatTile({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <Card className="border-card-border p-3">
      <div className="text-10 font-mono uppercase tracking-wider text-muted-foreground/60">{label}</div>
      {loading ? <Skeleton className="h-6 w-16 mt-1" /> : <div className="text-lg font-semibold text-foreground mt-0.5 truncate">{value}</div>}
    </Card>
  );
}

function SortHeader({ label, k, cur, dir, onClick, className = "" }: { label: string; k: SortKey; cur: SortKey; dir: "asc" | "desc"; onClick: (k: SortKey) => void; className?: string }) {
  const active = cur === k;
  return (
    <button onClick={() => onClick(k)} className={`flex items-center gap-1 hover:text-foreground transition-colors ${active ? "text-brand" : ""} ${className}`}>
      {label}
      <ArrowUpDown className="h-3 w-3" style={{ opacity: active ? 1 : 0.3 }} />
    </button>
  );
}
