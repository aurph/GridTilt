import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RTooltip } from "recharts";
import { useToast } from "@/hooks/use-toast";
import { PageShell, Provenance, PullStat, RuleSection } from "@/components/editorial";
import { SEMANTIC } from "@/lib/tokens";
import { tooltipContentStyle, tooltipItemStyle } from "@/lib/chart-theme";

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

const SECTOR_LABELS: Record<string, string> = {
  compute: "Compute", nuclear: "Nuclear Power", uranium: "Uranium & Fuel Cycle",
  powerHardware: "Power Hardware", utilities: "Utilities", dataCenters: "Data Center REITs",
  construction: "Construction & EPC", etfsBenchmarks: "ETF Benchmarks",
};

const SECTOR_SLUG_MAP: Record<string, string> = {
  compute: "compute", nuclear: "nuclear-power", uranium: "uranium",
  powerHardware: "power-hardware", utilities: "utilities", dataCenters: "data-center-reits",
  construction: "construction-epc", etfsBenchmarks: "etf-benchmarks",
};

/** Signed percent with a true minus sign, never a hyphen. */
function fmtSignedPct(v: number): string {
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`;
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

  if (isLoading) {
    return (
      <PageShell>
        <div className="pt-7 sm:pt-9 space-y-6">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </PageShell>
    );
  }

  if (isError || !data) {
    return (
      <PageShell>
        <div className="pt-7 sm:pt-9">
          <Link href="/stack" className="text-[12.5px] font-semibold text-ink no-underline hover:text-brand-ink" data-testid="link-back-stack">
            ← The Stack
          </Link>
          <h1 className="mt-5 font-serif font-medium text-[30px] sm:text-[34px] leading-[1.05] tracking-tight text-ink">
            Ticker not found
          </h1>
          <p className="mt-3 max-w-[68ch] text-[15px] leading-relaxed text-ink-secondary">
            {upperTicker} is not tracked on GridTilt. Browse{" "}
            <Link href="/stack" className="text-ink no-underline hover:text-brand-ink">The Stack</Link>{" "}
            to see every tracked equity.
          </p>
        </div>
      </PageShell>
    );
  }

  const hasLiveChg = typeof data.stockData?.changePercent === "number" && Number.isFinite(data.stockData.changePercent);
  const isUp = hasLiveChg && (data.stockData!.changePercent as number) >= 0;
  const isStale = !!data.stockData?.stale;
  const chartData = data.stockData?.sparkline?.map((v, i) => ({ i, price: v })) || [];
  const sectorSlug = SECTOR_SLUG_MAP[data.layerKey] || data.layerKey;
  const sectorLabel = SECTOR_LABELS[data.layerKey] || data.layerKey;

  function handleShare() {
    const url = `https://gridtilt.com/stock/${data!.ticker}`;
    const text = `${data!.name} ($${data!.ticker}) scores ${data!.thesisScore}/100 on the AI power thesis. ${data!.primarySegment} sector. See the full analysis on @gridtilt: ${url}`;
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "Copied to clipboard", description: "Share text copied" });
    });
  }

  return (
    <PageShell>
      <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-7 sm:pt-9 text-[12.5px] text-ink-muted" data-testid="breadcrumb">
        <Link href="/" className="text-[12.5px] text-ink no-underline hover:text-brand-ink">GridTilt</Link>
        <span>·</span>
        <Link href="/stack" className="text-[12.5px] text-ink no-underline hover:text-brand-ink">The Stack</Link>
        <span>·</span>
        <Link href={`/sector/${sectorSlug}`} className="text-[12.5px] text-ink no-underline hover:text-brand-ink">{sectorLabel}</Link>
        <span>·</span>
        <span className="text-ink font-medium">{data.ticker}</span>
      </nav>

      {/* Reference-entry lead: serif name over a plain classification line */}
      <div className="mt-4 pb-4 border-b border-rule mb-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="font-serif font-medium text-[30px] sm:text-[34px] leading-[1.05] tracking-tight text-ink" data-testid="stock-heading">
              {data.name}
            </h1>
            <p className="mt-1.5 text-[13.5px] text-ink-muted">
              {data.ticker} · {data.primarySegment} · {sectorLabel}
            </p>
          </div>
          <div className="flex items-center gap-4 pb-1">
            <button
              onClick={handleShare}
              className="text-[12.5px] font-semibold text-brand-ink hover:text-ink transition-colors"
              data-testid="button-share"
            >
              Share
            </button>
            <a
              href={`https://x.com/intent/tweet?text=${encodeURIComponent(`$${data.ticker} scores ${data.thesisScore}/100 on the AI power thesis. ${data.primarySegment} sector.`)}&url=${encodeURIComponent(`https://gridtilt.com/stock/${data.ticker}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12.5px] font-semibold text-ink no-underline hover:text-brand-ink"
              data-testid="link-share-x"
            >
              Share on X
            </a>
          </div>
        </div>
      </div>

      {/* Key figures */}
      {data.stockData && (
        <div className="flex flex-wrap gap-x-10 gap-y-5 pb-5 border-b border-rule" data-testid="key-metrics">
          <PullStat
            testId="stock-price"
            label="Price"
            value={`$${data.stockData.price.toFixed(2)}`}
            delta={
              hasLiveChg ? (
                <span
                  className={`text-[13px] font-semibold tnum ${isUp ? "text-positive" : "text-negative"}`}
                  data-testid="stock-change"
                >
                  {fmtSignedPct(data.stockData.changePercent as number)}
                </span>
              ) : (
                <span className="text-[13px] text-ink-muted" data-testid="stock-stale">
                  {isStale ? "delayed" : "--"}
                </span>
              )
            }
            note={
              hasLiveChg && data.stockData.change != null
                ? `${isUp ? "+" : "−"}$${Math.abs(data.stockData.change).toFixed(2)} today`
                : isStale
                  ? "Quote delayed"
                  : undefined
            }
          />
          <PullStat label="Market cap" value={data.stockData.marketCapDisplay || "--"} />
          <PullStat label="P/E ratio" value={data.stockData.pe != null ? data.stockData.pe.toFixed(1) : "--"} />
          <PullStat
            label="Revenue growth"
            value={
              data.stockData.revenueGrowth != null
                ? `${data.stockData.revenueGrowth >= 0 ? "+" : "−"}${Math.abs(data.stockData.revenueGrowth).toFixed(1)}%`
                : "--"
            }
            note="year over year"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-10">
        <div className="lg:col-span-2">
          <RuleSection
            head="Thesis alignment"
            aside={
              <span className="text-[13px] font-semibold text-ink tnum" data-testid="thesis-score">
                {data.thesisScore}/100
              </span>
            }
            testId="thesis-score-card"
          >
            <p className="max-w-[68ch] text-[14px] leading-relaxed text-ink-secondary">{data.explanation}</p>
            <div className="mt-4 grid grid-cols-5 gap-3">
              {Object.entries(data.sectors).map(([key, val]) => (
                <div key={key}>
                  <div className="h-1.5 bg-paper-shade mb-1.5">
                    <div className="h-full bg-brand" style={{ width: `${val}%` }} />
                  </div>
                  <p className="text-[12px] leading-tight text-ink-muted">{key}</p>
                  <p className="text-[12.5px] font-semibold text-ink tnum">{val}</p>
                </div>
              ))}
            </div>
          </RuleSection>

          {chartData.length > 0 && (
            <RuleSection head="Price history" testId="price-chart">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <XAxis dataKey="i" hide />
                  <YAxis domain={["auto", "auto"]} hide />
                  <RTooltip
                    contentStyle={tooltipContentStyle}
                    labelStyle={{ display: "none" }}
                    itemStyle={tooltipItemStyle}
                    formatter={(val: number) => [`$${val.toFixed(2)}`, "Price"]}
                  />
                  <Line type="monotone" dataKey="price" stroke={isUp ? SEMANTIC.positiveDeep : SEMANTIC.negativeDeep} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <Provenance source="Yahoo Finance" extra="quotes may be delayed" />
            </RuleSection>
          )}

          {data.relatedCatalysts.length > 0 && (
            <RuleSection head="Upcoming catalysts" testId="stock-catalysts">
              <ul>
                {data.relatedCatalysts.map((c) => (
                  <li key={c.id} className="flex items-start gap-4 py-2.5 border-b border-rule last:border-b-0">
                    <span className="w-24 flex-shrink-0 text-[12.5px] text-ink-muted tnum">{c.date}</span>
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium leading-snug text-ink">{c.title}</p>
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted">{c.thesisImpact.slice(0, 150)}...</p>
                    </div>
                  </li>
                ))}
              </ul>
              <Provenance source="GridTilt catalyst registry" />
            </RuleSection>
          )}
        </div>

        <div>
          <RuleSection head="Sector" testId="sector-context">
            <Link
              href={`/sector/${sectorSlug}`}
              className="text-[13.5px] font-medium text-ink no-underline hover:text-brand-ink"
              data-testid="link-sector"
            >
              {sectorLabel} →
            </Link>
          </RuleSection>

          {data.relatedTickers.length > 0 && (
            <RuleSection head="Related stocks" testId="related-stocks">
              <ul>
                {data.relatedTickers.map((t) => (
                  <li key={t} className="border-b border-rule last:border-b-0">
                    <Link
                      href={`/stock/${t}`}
                      className="block py-2 text-[13.5px] text-ink no-underline hover:text-brand-ink"
                      data-testid={`link-related-${t}`}
                    >
                      {t}
                    </Link>
                  </li>
                ))}
              </ul>
            </RuleSection>
          )}

          <RuleSection head="Tools">
            <ul>
              <li className="border-b border-rule">
                <Link href="/stack" className="block py-2 text-[13.5px] text-ink no-underline hover:text-brand-ink" data-testid="link-tool-stack">
                  The Stack
                </Link>
              </li>
              <li className="border-b border-rule">
                <Link href="/portfolio" className="block py-2 text-[13.5px] text-ink no-underline hover:text-brand-ink" data-testid="link-tool-portfolio">
                  Portfolio Overlay
                </Link>
              </li>
              <li>
                <Link href="/catalysts" className="block py-2 text-[13.5px] text-ink no-underline hover:text-brand-ink" data-testid="link-tool-catalysts">
                  Catalyst Tracker
                </Link>
              </li>
            </ul>
          </RuleSection>
        </div>
      </div>
    </PageShell>
  );
}
