import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ExternalLink, TrendingUp, TrendingDown, AlertTriangle, Share2, Clock } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RTooltip } from "recharts";
import { useToast } from "@/hooks/use-toast";
import { SEMANTIC } from "@/lib/tokens";
import { axisProps, tooltipContentStyle, seriesAnimation } from "@/lib/chart-theme";

interface StockInfo {
  ticker: string;
  name: string;
  primarySegment: string;
  sectors: Record<string, number>;
  explanation: string;
  thesisScore: number;
  layerKey: string;
  stockData: {
    price: number;
    change: number | null;
    changePercent: number | null;
    pe: number | null;
    revenueGrowth: number | null;
    marketCapDisplay: string;
    sparkline: number[];
    stale?: boolean;
  } | null;
  relatedTickers: string[];
  relatedCatalysts: Array<{ id: number; date: string; title: string; category: string; thesisImpact: string }>;
}

// All 13 STACK_TICKERS layers (server/routes.ts) get a human label + a
// SectorPage slug here. Layers missing from this map used to fall back to
// their raw camelCase key (e.g. "rawMaterialsMining") in both the badge and
// the sector link, which 404'd on SectorPage - about 30 of the 100 tracked
// tickers live in the five layers added below.
const SECTOR_LABELS: Record<string, string> = {
  compute: "Compute", nuclear: "Nuclear Power", uranium: "Uranium & Fuel Cycle",
  powerHardware: "Power Hardware", utilities: "Utilities", dataCenters: "Data Center REITs",
  construction: "Construction & EPC", etfsBenchmarks: "ETF Benchmarks",
  rawMaterialsMining: "Raw Materials & Mining", rawMaterialsNatGas: "Natural Gas",
  renewableGeneration: "Renewable Generation", transmissionGrid: "Transmission & Grid Hardware",
  cryptoAIDC: "Crypto & AI Hosting",
};

const SECTOR_SLUG_MAP: Record<string, string> = {
  compute: "compute", nuclear: "nuclear-power", uranium: "uranium",
  powerHardware: "power-hardware", utilities: "utilities", dataCenters: "data-center-reits",
  construction: "construction-epc", etfsBenchmarks: "etf-benchmarks",
  rawMaterialsMining: "raw-materials-mining", rawMaterialsNatGas: "natural-gas",
  renewableGeneration: "renewable-generation", transmissionGrid: "transmission-grid-hardware",
  cryptoAIDC: "crypto-ai-hosting",
};

interface StackData {
  [key: string]: Array<{
    ticker: string; name: string; price: number; change: number;
    changePercent: number | null; pe: number | null; revenueGrowth: number | null;
    marketCapDisplay?: string;
  }>;
}

export default function StockPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const upperTicker = ticker?.toUpperCase() || "";
  const { toast } = useToast();

  const { data, isLoading, isError } = useQuery<StockInfo>({
    queryKey: ["/api/stock", upperTicker],
    queryFn: () => fetch(`/api/stock/${upperTicker}`).then((r) => {
      if (!r.ok) throw new Error("Not found");
      return r.json();
    }),
    enabled: !!upperTicker,
    refetchInterval: 900000,
  });

  // Same endpoint + queryKey SectorPage uses, so the cache is shared: prices
  // for the related-tickers row below cost nothing extra once either page
  // has loaded this session.
  const { data: stackData } = useQuery<StackData>({
    queryKey: ["/api/stack", "1D"],
    queryFn: () => fetch("/api/stack?timeframe=1D").then((r) => r.json()),
    refetchInterval: 900000,
  });

  if (isLoading) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6">
        <Link href="/stack" className="flex items-center gap-1 text-sm text-brand mb-6" data-testid="link-back-stack">
          <ArrowLeft className="h-4 w-4" /> Back to Equities
        </Link>
        <Card className="p-8 border-card-border text-center">
          <AlertTriangle className="h-8 w-8 text-negative mx-auto mb-3" />
          <h1 className="text-lg font-semibold mb-2">Ticker Not Found</h1>
          <p className="text-sm text-muted-foreground">
            ${upperTicker} is not tracked on GridTilt. <Link href="/stack" className="text-brand">Browse Equities</Link> to see all 100+ tracked equities.
          </p>
        </Card>
      </div>
    );
  }

  const hasLiveChg = typeof data.stockData?.changePercent === "number" && Number.isFinite(data.stockData.changePercent);
  const isUp = hasLiveChg && (data.stockData!.changePercent as number) >= 0;
  const isStale = !!data.stockData?.stale;
  const chartData = data.stockData?.sparkline?.map((v, i) => ({ i, price: v })) || [];
  const sectorLabel = SECTOR_LABELS[data.layerKey] || data.layerKey;
  const sectorSlug = SECTOR_SLUG_MAP[data.layerKey] || data.layerKey;

  const sectorStocks = stackData?.[data.layerKey] || [];
  const sectorAvgChange = sectorStocks.length > 0
    ? sectorStocks.reduce((s, st) => s + (st.changePercent || 0), 0) / sectorStocks.length
    : null;
  const relatedRows = new Map(sectorStocks.map((s) => [s.ticker, s]));

  function handleShare() {
    const url = `https://gridtilt.com/stock/${data!.ticker}`;
    const text = `${data!.name} ($${data!.ticker}) scores ${data!.thesisScore}/100 on the AI power thesis. ${data!.primarySegment} sector. See the full analysis on @gridtilt: ${url}`;
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "Copied to clipboard", description: "Share text copied" });
    });
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6 space-y-6">
      <nav className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="breadcrumb">
        <Link href="/" className="hover:text-foreground">GridTilt</Link>
        <span>/</span>
        <Link href="/stack" className="hover:text-foreground">Equities</Link>
        <span>/</span>
        <Link href={`/sector/${sectorSlug}`} className="hover:text-foreground">{sectorLabel}</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{data.ticker}</span>
      </nav>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold" data-testid="stock-heading">{data.name}</h1>
            <Badge className="text-sm font-mono bg-muted/50 text-muted-foreground">${data.ticker}</Badge>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge className="bg-brand/15 text-brand border-brand/25">{data.primarySegment}</Badge>
            {data.stockData && (
              <>
                <span className="text-xl font-bold font-mono" data-testid="stock-price">${data.stockData.price.toFixed(2)}</span>
                {hasLiveChg ? (
                  <Badge className={`font-mono ${isUp ? "bg-positive-deep/15 text-positive" : "bg-negative-deep/15 text-negative"}`} data-testid="stock-change">
                    {isUp ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                    {isUp ? "+" : ""}{(data.stockData.changePercent as number).toFixed(2)}%
                  </Badge>
                ) : (
                  <Badge className="font-mono bg-brand-2/15 text-brand-2 border-brand-2/30 inline-flex items-center gap-1" data-testid="stock-stale">
                    <Clock className="h-3 w-3" />
                    {isStale ? "delayed" : "--"}
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted/50 transition-colors"
            data-testid="button-share"
          >
            <Share2 className="h-3 w-3" /> Share
          </button>
          <a
            href={`https://x.com/intent/tweet?text=${encodeURIComponent(`$${data.ticker} scores ${data.thesisScore}/100 on the AI power thesis. ${data.primarySegment} sector.`)}&url=${encodeURIComponent(`https://gridtilt.com/stock/${data.ticker}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted/50 transition-colors"
            data-testid="link-share-x"
          >
            Share on X <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5 border-card-border" data-testid="thesis-score-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[13px] font-semibold text-foreground">Thesis Alignment Score</h2>
              <span className="text-3xl font-bold font-mono text-brand-2" data-testid="thesis-score">{data.thesisScore}/100</span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{data.explanation}</p>
            <div className="grid grid-cols-5 gap-3">
              {Object.entries(data.sectors).map(([key, val]) => (
                <div key={key} className="text-center">
                  <div className="h-2.5 rounded-full bg-muted/30 overflow-hidden mb-1">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${val}%` }} />
                  </div>
                  <p className="text-10 text-muted-foreground">{key}</p>
                  <p className="text-xs font-mono font-semibold">{val}</p>
                </div>
              ))}
            </div>
          </Card>

          {chartData.length > 0 && (
            <Card className="p-5 border-card-border" data-testid="price-chart">
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <h2 className="text-[13px] font-semibold text-foreground">Price History</h2>
                <span className="text-[11px] text-muted-foreground/70">past 2 days, 5-min closes</span>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  {/* Sparkline payload carries closes only (no timestamps), so the
                      x axis stays a bare baseline and the label above names the range. */}
                  <XAxis dataKey="i" {...axisProps} tick={false} height={6} />
                  <YAxis
                    {...axisProps}
                    domain={["auto", "auto"]}
                    width={52}
                    tickFormatter={(v: number) => (v >= 100 ? `${Math.round(v)}` : `${v.toFixed(2)}`)}
                  />
                  <RTooltip
                    contentStyle={tooltipContentStyle}
                    labelStyle={{ display: "none" }}
                    formatter={(val: number) => [`$${val.toFixed(2)}`, "Price"]}
                  />
                  <Line {...seriesAnimation} type="monotone" dataKey="price" stroke={isUp ? SEMANTIC.positiveDeep : SEMANTIC.negativeDeep} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}

          {data.relatedCatalysts.length > 0 && (
            <Card className="p-5 border-card-border" data-testid="stock-catalysts">
              <h2 className="text-[13px] font-semibold text-foreground mb-3">Upcoming Catalysts</h2>
              <div className="space-y-3">
                {data.relatedCatalysts.map((c) => (
                  <div key={c.id} className="flex items-start gap-3 text-sm">
                    <Badge className="text-10 font-mono bg-muted/40 text-muted-foreground flex-shrink-0">{c.date}</Badge>
                    <div>
                      <p className="font-medium text-foreground">{c.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{c.thesisImpact.slice(0, 150)}...</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {data.stockData && (
            <Card className="p-5 border-card-border" data-testid="key-metrics">
              <h2 className="text-[13px] font-semibold text-foreground mb-3">Key Metrics</h2>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Market Cap</span>
                  <span className="font-mono font-semibold">{data.stockData.marketCapDisplay || "N/A"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">P/E Ratio</span>
                  <span className="font-mono font-semibold">{data.stockData.pe?.toFixed(1) || "N/A"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Rev Growth YoY</span>
                  <span className={`font-mono font-semibold ${(data.stockData.revenueGrowth ?? 0) > 0 ? "text-positive" : "text-negative"}`}>
                    {data.stockData.revenueGrowth != null ? `${data.stockData.revenueGrowth > 0 ? "+" : ""}${data.stockData.revenueGrowth.toFixed(1)}%` : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Daily Change</span>
                  <span className={`font-mono font-semibold ${isUp ? "text-positive" : "text-negative"}`}>
                    {data.stockData.change != null ? `${data.stockData.change < 0 ? "-" : "+"}${Math.abs(data.stockData.change).toFixed(2)}` : "--"}
                  </span>
                </div>
              </div>
            </Card>
          )}

          {data.relatedTickers.length > 0 && (
            <Card className="p-5 border-card-border" data-testid="related-stocks">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <h2 className="text-[13px] font-semibold text-foreground">Related Stocks</h2>
                <Link href={`/sector/${sectorSlug}`} className="text-10 text-muted-foreground hover:text-brand whitespace-nowrap" data-testid="link-sector">
                  {sectorLabel} &rarr;
                </Link>
              </div>
              {sectorAvgChange !== null && (
                <p className="text-10 text-muted-foreground mb-3">
                  Sector avg today:{" "}
                  <span className={`font-mono font-semibold ${sectorAvgChange >= 0 ? "text-positive" : "text-negative"}`}>
                    {sectorAvgChange >= 0 ? "+" : ""}{sectorAvgChange.toFixed(2)}%
                  </span>{" "}
                  across {sectorStocks.length} tracked
                </p>
              )}
              <div>
                {data.relatedTickers.map((t) => {
                  const row = relatedRows.get(t);
                  const hasChg = typeof row?.changePercent === "number";
                  const rowUp = hasChg && (row!.changePercent as number) >= 0;
                  return (
                    <Link
                      key={t}
                      href={`/stock/${t}`}
                      className="flex items-center justify-between gap-3 py-2 border-b border-border/60 last:border-0 -mx-1 px-1 rounded hover:bg-muted/20 transition-colors"
                      data-testid={`link-related-${t}`}
                    >
                      <span className="min-w-0">
                        <span className="block font-mono text-sm font-semibold text-brand">${t}</span>
                        {row?.name && <span className="block text-10 text-muted-foreground truncate max-w-[150px]">{row.name}</span>}
                      </span>
                      {row ? (
                        <span className="text-right flex-shrink-0">
                          <span className="block font-mono text-sm font-semibold">${row.price.toFixed(2)}</span>
                          {hasChg ? (
                            <span className={`block text-10 font-mono ${rowUp ? "text-positive" : "text-negative"}`}>
                              {rowUp ? "+" : ""}{(row.changePercent as number).toFixed(2)}%
                            </span>
                          ) : (
                            <span className="block text-10 font-mono text-muted-foreground">--</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-10 text-muted-foreground flex-shrink-0">--</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
