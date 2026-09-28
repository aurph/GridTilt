import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AsOf, ErrorState, SrChartTable } from "@/components/Freshness";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
} from "recharts";
import { Handshake, ArrowUpDown, ChevronDown } from "lucide-react";
import { BORDER, BRAND, CATEGORY_COLORS, FONT, INK, SERIES, STATUS_COLORS } from "@/lib/tokens";
import { seriesMotion, axisProps, gridProps, tooltipContentStyle } from "@/lib/chart-theme";

// Payload of /api/deals/metrics (server/deals.ts). Every figure is scoped to one
// agreement status; nothing here adds statuses together.
interface Bucket { key: string; count: number; mw: number; undisclosed: number; upToMW?: number; }
type FirmnessKey = "signed" | "framework" | "option" | "preliminary" | "portfolio" | "unreviewed";
interface DealRow {
  id: string;
  name: string;
  sponsor: string;
  offtaker: string;
  offtakerRaw: string;
  type: string;
  capacityMW: number | null;
  iso: string | null;
  state: string | null;
  status: string;
  online: string | null;
  sources: string[];
  notes: string | null;
  firmness: FirmnessKey;
  firmnessSource: string | null;
  reviewed: string | null;
  asset: string | null;
  upTo: boolean;
  aggregate: boolean;
  includes: string[];
}
interface DealMetrics {
  rowCount: number;
  signed: Bucket;
  frameworksAndOptions: Bucket;
  byFirmness: Bucket[];
  signedByBuyer: Bucket[];
  signedByType: Bucket[];
  signedByAsset: Bucket[];
  topSignedBuyer: string | null;
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
  utility: SERIES[9], // slate - grid supply, matches the grid=cool convention
  // fusion (and any future one-off type) deliberately falls through to muted:
  // the palette is at capacity, so rare types read as "other" and the label
  // carries identity. Type words wear ink tokens; only the dot is colored.
};
const typeColor = (t: string) => TYPE_COLOR[t] ?? INK.muted;

// Status words wear ink tokens for contrast; the dot carries the hue.
const FIRMNESS: Record<FirmnessKey, { label: string; dot: string; hollow?: boolean }> = {
  signed: { label: "signed", dot: STATUS_COLORS.operational },
  framework: { label: "framework", dot: STATUS_COLORS.construction },
  option: { label: "option", dot: STATUS_COLORS.construction },
  preliminary: { label: "LOI / non-binding", dot: INK.muted },
  portfolio: { label: "company total", dot: INK.faint, hollow: true },
  unreviewed: { label: "not reviewed", dot: INK.faint, hollow: true },
};

const ASSET_LABEL: Record<string, string> = {
  existing: "existing plant",
  restart: "plant restart",
  uprate: "uprate of an existing plant",
  "new-build": "new build",
  mixed: "existing and new",
};

const gw = (mw: number) => (mw / 1000).toFixed(mw >= 10_000 ? 0 : 1);
/** Below 1 GW in MW: 50 MW printed as "0.1 GW" read as twice its size. */
const sizeText = (mw: number) => (mw >= 1000 ? `${gw(mw)} GW` : `${Math.round(mw)} MW`);
/** A row's capacity as disclosed: a ceiling reads "up to", a secret reads "undisclosed". */
const capacityText = (r: DealRow) =>
  r.capacityMW === null ? "undisclosed" : `${r.upTo ? "up to " : ""}${sizeText(r.capacityMW)}`;
const hostOf = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
};

type SortKey = "capacityMW" | "name" | "offtaker" | "type" | "firmness" | "online";
const FIRMNESS_RANK: Record<FirmnessKey, number> = { signed: 0, framework: 1, option: 2, preliminary: 3, portfolio: 4, unreviewed: 5 };

// `params` keeps this assignable to wouter's <Route component={...}> while the
// standalone /power-deals route lives on; `embedded` is the Power-tool tab mode.
export default function PowerDeals({ embedded = false }: { embedded?: boolean; params?: unknown }) {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<DealMetrics>({ queryKey: ["/api/deals/metrics"] });
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("capacityMW");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [open, setOpen] = useState<string | null>(null);

  const rows = data?.rows ?? [];
  // A row inside another listed row (a plant inside its framework, a tranche
  // inside its PPA): shown, labeled, and counted once in the parent.
  const parentOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) for (const id of r.includes) m.set(id, r.name);
    return m;
  }, [rows]);
  const bucket = (k: FirmnessKey) => data?.byFirmness.find((b) => b.key === k) ?? null;

  const byBuyer = useMemo(
    () => (data?.signedByBuyer ?? []).map((b) => ({ buyer: b.key, gw: +(b.mw / 1000).toFixed(1), count: b.count, undisclosed: b.undisclosed })),
    [data],
  );

  // Row counts per type. Mixing statuses is fine for a count, never for a sum.
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.type, (m.get(r.type) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [rows]);

  const visibleRows = useMemo(() => {
    const filtered = typeFilter ? rows.filter((r) => r.type === typeFilter) : rows;
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "capacityMW") cmp = (a.capacityMW ?? -1) - (b.capacityMW ?? -1);
      else if (sortKey === "firmness") cmp = FIRMNESS_RANK[a.firmness] - FIRMNESS_RANK[b.firmness];
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
    </div>
  );

  const introText =
    "Power agreements between AI or hyperscale buyers and generators: PPAs, utility supply agreements, " +
    "reactor restarts, frameworks and letters of intent. Each row says how binding it is. Each status " +
    "is totalled on its own; the totals are never added together.";

  // Embedded mode (Power tool, Deals tab): the host page owns the hero, so
  // render a slim intro row instead of the full-page header.
  const intro = embedded ? (
    <div className="flex flex-wrap items-start justify-between gap-3 px-1">
      <p className="text-muted-foreground text-xs leading-relaxed max-w-3xl">{introText}</p>
      {asOfChip}
    </div>
  ) : (
    <div className="border-b border-border px-4 sm:px-6 py-6 sm:py-8" data-testid="deals-header">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 mb-2">
            <Handshake className="h-5 w-5 text-brand" />
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">
              Power agreements
            </h1>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {introText} The data-center sites themselves live in{" "}
            <Link href="/compute-frontier" className="text-brand hover:text-brand-2">Compute Frontier</Link>.
          </p>
        </div>
        {asOfChip}
      </div>
    </div>
  );

  const signed = data?.signed;
  const frameworkMW = data?.frameworksAndOptions.mw ?? 0;
  const frameworkCount = data?.frameworksAndOptions.count ?? 0;
  const prelim = bucket("preliminary");
  const unreviewed = bucket("unreviewed");

  return (
    <div className={embedded ? "flex flex-col" : "flex flex-col h-full overflow-y-auto"}>
      {intro}

      <div className={embedded ? "flex-1 space-y-5 mt-3" : "flex-1 p-4 sm:p-6 space-y-5"}>
        {/* Headline tiles: one status each. They overlap and are never added. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="deals-tiles">
          <StatTile
            label="Signed"
            value={signed ? `${gw(signed.mw)} GW` : "—"}
            sub={signed ? `${signed.count} agreement${signed.count === 1 ? "" : "s"}${signed.undisclosed ? `, ${signed.undisclosed} size undisclosed` : ""}${signed.upToMW ? `, ${gw(signed.upToMW)} GW of it "up to"` : ""}` : undefined}
            loading={isLoading}
          />
          {/* Stated amounts, not ceilings: a framework can be a floor ("over
              10.5 GW") and a non-binding target is neither. */}
          <StatTile
            label="Frameworks and options"
            value={data ? (frameworkCount ? `${gw(frameworkMW)} GW` : "none") : "—"}
            sub={data && frameworkCount ? `${frameworkCount} agreement${frameworkCount === 1 ? "" : "s"}, as stated, not counted as signed` : undefined}
            loading={isLoading}
          />
          <StatTile
            label="LOIs and non-binding"
            value={data ? (prelim ? `${gw(prelim.mw)} GW` : "none") : "—"}
            sub={prelim ? `${prelim.count} agreement${prelim.count === 1 ? "" : "s"}, as stated, non-binding` : undefined}
            loading={isLoading}
          />
          <StatTile
            label="Not yet reviewed"
            value={data ? String(unreviewed?.count ?? 0) : "—"}
            sub={data ? `of ${data.rowCount} listed` : undefined}
            loading={isLoading}
          />
        </div>

        {/* Signed capacity by buyer */}
        <Card className="border-card-border p-3" data-testid="deals-buyers">
          <span className="text-[13px] font-semibold text-foreground">Signed capacity by buyer · GW</span>
          {isLoading ? (
            <Skeleton className="h-[300px] w-full mt-2" />
          ) : isError ? (
            <ErrorState label="The agreements dataset failed to load." onRetry={() => refetch()} className="h-[300px]" />
          ) : byBuyer.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">
              No agreement has been reviewed as signed yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, byBuyer.length * 32)}>
              <BarChart data={byBuyer} layout="vertical" margin={{ left: 8, right: 56, top: 8, bottom: 4 }}>
                <CartesianGrid {...gridProps} vertical={true} horizontal={false} />
                <XAxis {...axisProps} type="number" tickFormatter={(v) => `${v}`} />
                {/* interval 0: recharts otherwise drops every other buyer name, leaving unlabeled bars */}
                <YAxis {...axisProps} type="category" dataKey="buyer" width={140} interval={0} />
                <RTooltip
                  cursor={{ fill: BORDER.subtle }}
                  contentStyle={tooltipContentStyle}
                  formatter={(v: number, _n, p: any) => {
                    // An undisclosed size is counted but adds nothing to the GW.
                    const sized = p.payload.count - p.payload.undisclosed;
                    const more = p.payload.undisclosed ? `, plus ${p.payload.undisclosed} of undisclosed size` : "";
                    return [`${v} GW across ${sized} signed agreement${sized === 1 ? "" : "s"}${more}`, p.payload.buyer];
                  }}
                />
                <Bar {...seriesMotion()} dataKey="gw" fill={BRAND.primary} radius={[0, 3, 3, 0]} isAnimationActive={false}
                  label={{ position: "right", formatter: (v: number) => `${v}`, fill: INK.muted, fontSize: 10, fontFamily: FONT.mono }} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {byBuyer.length > 0 && (
            <SrChartTable
              caption="Signed capacity by buyer, in gigawatts"
              columns={["Buyer", "GW", "Signed agreements"]}
              rows={byBuyer.map((b) => [b.buyer, b.gw, b.count])}
            />
          )}
        </Card>

        {/* Energy type filter row */}
        {data && (
          <div className="flex flex-wrap items-center gap-1.5" data-testid="deals-type-filter">
            <button
              onClick={() => setTypeFilter(null)}
              aria-pressed={typeFilter === null}
              className={`px-2.5 py-1 rounded text-xs border transition-colors ${typeFilter === null ? "border-brand text-brand bg-brand/10" : "border-subtle text-muted-foreground hover:text-foreground"}`}
            >
              all types
            </button>
            {typeCounts.map(([type, count]) => {
              const on = typeFilter === type;
              return (
                <button
                  key={type}
                  onClick={() => setTypeFilter(on ? null : type)}
                  aria-pressed={on}
                  className="px-2.5 py-1 rounded text-xs border transition-colors"
                  style={{
                    borderColor: on ? typeColor(type) : BORDER.subtle,
                    color: on ? INK.primary : INK.muted,
                    background: on ? `${typeColor(type)}14` : "transparent",
                  }}
                >
                  <span className="inline-block h-2 w-2 rounded-full mr-1.5 align-middle" style={{ background: typeColor(type) }} />
                  {type} · {count}
                </button>
              );
            })}
          </div>
        )}

        {/* Agreements table */}
        <Card className="border-card-border overflow-hidden" data-testid="deals-table">
          <div className="px-4 py-2 bg-surface-base border-b border-border">
            <span className="text-[13px] font-semibold text-foreground">Agreements</span>
            <span className="text-10 text-muted-foreground/40 ml-2">{visibleRows.length} shown · open a row for terms and sources</span>
          </div>
          {isError ? (
            <ErrorState label="The agreements dataset failed to load." onRetry={() => refetch()} />
          ) : (
          <div className="overflow-x-auto">
          <div className="min-w-[760px]">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-surface-base border-b border-border text-[11px] text-muted-foreground">
            <SortHeader label="Buyer" k="offtaker" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-2" />
            <span className="col-span-3">Generator / project</span>
            <SortHeader label="Type" k="type" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-1" />
            <SortHeader label="Status" k="firmness" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-2" />
            <SortHeader label="Capacity" k="capacityMW" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-2 justify-end" />
            <SortHeader label="Online" k="online" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-2 justify-end" />
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">{Array(10).fill(null).map((_, i) => <Skeleton key={i} className="h-7" />)}</div>
          ) : (
            visibleRows.map((r) => {
              const isOpen = open === r.id;
              const f = FIRMNESS[r.firmness];
              return (
                <Fragment key={r.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : r.id)}
                    aria-expanded={isOpen}
                    aria-controls={`deal-detail-${r.id}`}
                    className="grid w-full grid-cols-12 gap-2 px-4 py-2.5 border-b border-border/30 text-left text-xs hover:bg-brand/5 items-center"
                    data-testid={`deal-row-${r.id}`}
                  >
                    <span className="col-span-2 min-w-0">
                      <span className="block font-semibold text-foreground truncate">{r.offtaker}</span>
                      {/* Phones see only the first columns without scrolling, so the
                          status and size ride along under the buyer. */}
                      <span className="sm:hidden block text-10 text-muted-foreground truncate">
                        {f.label} · {capacityText(r)}
                      </span>
                    </span>
                    <span className="col-span-3 text-muted-foreground truncate">{r.name} <span className="text-muted-foreground/40">· {r.sponsor}</span></span>
                    <span className="col-span-1 inline-flex items-center gap-1.5 min-w-0">
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: typeColor(r.type) }} />
                      <span className="text-muted-foreground truncate">{r.type}</span>
                    </span>
                    <span className="col-span-2 inline-flex items-center gap-1.5 min-w-0" data-testid={`deal-status-${r.id}`}>
                      <StatusDot color={f.dot} hollow={f.hollow} />
                      <span className="truncate" style={{ color: r.firmness === "unreviewed" ? INK.muted : INK.secondary }}>
                        {f.label}
                        {parentOf.get(r.id) && <span className="text-muted-foreground/60"> · part of another row</span>}
                      </span>
                    </span>
                    <span className="col-span-2 font-mono text-foreground text-right tabular-nums">{capacityText(r)}</span>
                    <span className="col-span-2 inline-flex items-center justify-end gap-1 font-mono text-muted-foreground tabular-nums text-11 min-w-0">
                      <span className="truncate">{r.online ?? "—"}</span>
                      <ChevronDown className={`h-3 w-3 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                    </span>
                  </button>
                  {isOpen && (
                    // Pinned to the visible width on phones: the row grid scrolls
                    // sideways, and the terms should not scroll away with it.
                    <div id={`deal-detail-${r.id}`} className="sticky left-0 w-[calc(100vw-2rem)] sm:w-auto px-4 py-3 border-b border-border/30 bg-surface-base text-11 text-muted-foreground space-y-1.5 break-words" data-testid={`deal-detail-${r.id}`}>
                      <div className="text-foreground">
                        {r.name} · {r.sponsor} → {r.offtakerRaw}
                        {r.state ? ` · ${r.state}` : ""}{r.iso ? ` (${r.iso})` : ""}
                      </div>
                      <div>
                        <span className="text-muted-foreground/60">Status: </span>
                        {r.firmness === "unreviewed" ? (
                          "not yet reviewed against a primary document"
                        ) : (
                          <>
                            {f.label}
                            {r.asset ? `, ${ASSET_LABEL[r.asset] ?? r.asset}` : ""}
                            {r.reviewed ? `, reviewed ${r.reviewed}` : ""}
                            {r.firmnessSource && (
                              <>
                                {" "}against{" "}
                                <a href={r.firmnessSource} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand-2">
                                  {hostOf(r.firmnessSource)}
                                </a>
                              </>
                            )}
                          </>
                        )}
                      </div>
                      {r.firmness === "portfolio" && <div>A company-wide total. The agreements inside it are listed separately and are not added to it.</div>}
                      {parentOf.get(r.id) && (
                        <div>Part of {parentOf.get(r.id)}: its MW is counted once, in that row.</div>
                      )}
                      {r.includes.length > 0 && r.firmness !== "portfolio" && (
                        <div>Includes {r.includes.map((id) => rows.find((x) => x.id === id)?.name ?? id).join(", ")}, listed separately and not added twice.</div>
                      )}
                      {r.notes && <p className="text-muted-foreground/80">{r.notes}</p>}
                      {r.sources.length > 0 && (
                        <div className="text-10 text-muted-foreground/60">
                          <span className="text-muted-foreground/50">Sources: </span>
                          {r.sources.map((s, i) => (
                            <span key={i}>
                              {i > 0 ? " · " : ""}
                              {s.startsWith("https://") ? (
                                <a href={s} target="_blank" rel="noopener noreferrer" className="hover:text-brand">{hostOf(s)}</a>
                              ) : s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Fragment>
              );
            })
          )}
          </div>
          </div>
          )}
        </Card>

        <p className="text-11 text-muted-foreground/60 leading-relaxed px-1">
          Signed means a definitive agreement or completed acquisition, checked against the company's own release on
          the date shown in the row. Frameworks, options and letters of intent show the amounts they state and are not
          added to the signed figure. Company-wide totals are listed but never added to the agreements inside them.
          Capacity is the contract or plant figure as disclosed, not new generation: many agreements buy the output of
          plants already running.
        </p>
      </div>
    </div>
  );
}

function StatusDot({ color, hollow }: { color: string; hollow?: boolean }) {
  return (
    <span
      aria-hidden
      className="h-2 w-2 rounded-full flex-shrink-0"
      style={hollow ? { border: `1px solid ${color}` } : { background: color }}
    />
  );
}

function StatTile({ label, value, sub, loading }: { label: string; value: string; sub?: string; loading: boolean }) {
  return (
    <Card className="border-card-border p-3">
      <div className="text-[11px] text-muted-foreground/60">{label}</div>
      {loading ? (
        <Skeleton className="h-6 w-16 mt-1" />
      ) : (
        <>
          <div className="text-lg font-semibold tabular-nums text-foreground mt-0.5 truncate">{value}</div>
          {sub && <div className="text-[11px] leading-snug text-muted-foreground/70">{sub}</div>}
        </>
      )}
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
