import { useState, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { apiRequest } from "@/lib/queryClient";
import { Search, Loader2, AlertCircle, Plus, Share2, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SrChartTable } from "@/components/Freshness";
import { PageShell, Provenance, PullStat, RuleSection } from "@/components/editorial";
import { BORDER, CATEGORY_COLORS, CHART_CHROME, FONT, INK, SEMANTIC, SERIES } from "@/lib/tokens";
import { HIGHLIGHT } from "@/lib/chart-theme";

interface PortfolioResult {
  ticker: string;
  name: string;
  score: number;
  sectors: {
    Compute: number;
    Infrastructure: number;
    Power: number;
    Cooling: number;
    Grid: number;
  };
  primarySegment: string;
  explanation: string;
}

interface RadarDataPoint {
  axis: string;
  value: number;
  fullMark: number;
}

// One per segment; all tracked in The Stack (/stack), so every suggestion
// resolves to a real /stock/:ticker page.
const STACK_EXAMPLE_TICKERS = ["NVDA", "CEG", "VRT", "CCJ", "EQIX", "PWR"];

const EXAMPLE_PORTFOLIOS = [
  { label: "AI Bull", tickers: "NVDA, CEG, EQIX, AMD, CCJ" },
  { label: "Tech Giant", tickers: "MSFT, GOOGL, AMZN, META, AAPL" },
  { label: "Utility Mix", tickers: "NEE, CEG, VST, ETR, XLU" },
];

const SEGMENT_COLORS: Record<string, string> = {
  Compute: CATEGORY_COLORS.compute,
  Infrastructure: CATEGORY_COLORS.construction,
  Power: CATEGORY_COLORS.power,
  Cooling: SERIES[2], // series slot 3 - no category token for cooling
  Grid: CATEGORY_COLORS.grid,
};

const CustomRadarTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-popover border border-rule rounded-sm p-2.5 shadow-md text-[12.5px]">
        <p className="text-ink font-medium">{payload[0]?.payload?.axis}</p>
        <p className="text-ink-secondary tnum">Score: {payload[0]?.value?.toFixed(0)}/100</p>
      </div>
    );
  }
  return null;
};

function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? SEMANTIC.positive : score >= 40 ? SEMANTIC.warning : INK.faint;
  return (
    <div className="relative flex h-14 w-14 items-center justify-center flex-shrink-0">
      <svg viewBox="0 0 56 56" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="28" cy="28" r="22" fill="none" stroke={BORDER.subtle} strokeWidth="4" />
        <circle
          cx="28" cy="28" r="22"
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={`${(score / 100) * 138} 138`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <span className="text-[13px] font-semibold text-ink tnum z-10">{score}</span>
    </div>
  );
}

// `params` absorbs wouter's RouteComponentProps when mounted standalone via
// <Route component={...}>; only `embedded` is meaningful.
export default function PortfolioOverlay({ embedded = false }: { embedded?: boolean; params?: unknown }) {
  const [inputValue, setInputValue] = useState("");
  const [results, setResults] = useState<PortfolioResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const { mutate, isPending } = useMutation({
    mutationFn: async (tickers: string[]) => {
      const res = await apiRequest("POST", "/api/portfolio-score", { tickers });
      return res.json();
    },
    onSuccess: (data) => {
      setResults(data.results);
      setError(null);
    },
    onError: (err: any) => {
      setError(err.message ?? "Failed to score portfolio");
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tickerParam = params.get("tickers");
    if (tickerParam) {
      const decoded = decodeURIComponent(tickerParam);
      setInputValue(decoded);
      const tickers = decoded.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
      if (tickers.length > 0 && tickers.length <= 15) {
        mutate(tickers);
      }
    }
  }, []);

  const handleSubmit = () => {
    const tickers = inputValue
      .split(/[,\s]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (tickers.length === 0) return;
    if (tickers.length > 15) {
      setError("Maximum 15 tickers at once");
      return;
    }
    setError(null);
    const encoded = encodeURIComponent(tickers.join(","));
    // Embedded (Analyze tool): keep the host route in the URL bar instead of
    // rewriting it to /portfolio out from under the tab.
    const path = embedded ? window.location.pathname : "/portfolio";
    window.history.replaceState(null, "", `${path}?tickers=${encoded}`);
    mutate(tickers);
  };

  const handleShare = async () => {
    const tickers = inputValue
      .split(/[,\s]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (tickers.length === 0) return;
    const encoded = encodeURIComponent(tickers.join(","));
    const sharePath = embedded ? window.location.pathname : "/portfolio";
    const url = `${window.location.origin}${sharePath}?tickers=${encoded}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Link copied", description: "Share URL copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: url, variant: "destructive" });
    }
  };

  // Sort a copy: sorting `results` in place would mutate React state during render.
  const sortedResults = useMemo(
    () => (results ? [...results].sort((a, b) => b.score - a.score) : null),
    [results],
  );

  const radarData: RadarDataPoint[] = results
    ? ["Compute", "Infrastructure", "Power", "Cooling", "Grid"].map((axis) => ({
        axis,
        value: results.reduce((sum, r) => sum + (r.sectors as any)[axis], 0) / results.length,
        fullMark: 100,
      }))
    : [];

  const avgScore = results
    ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
    : null;

  const addTicker = (t: string) => {
    setInputValue((v) => {
      const existing = v.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
      if (existing.includes(t)) return v;
      return [...existing, t].join(", ");
    });
  };

  const body = (
    <div className="flex flex-col">
      <p className="text-[13.5px] leading-relaxed text-ink-secondary max-w-[68ch]">
        Measure portfolio concentration across five AI power supply chain segments: compute,
        infrastructure, power, cooling, and grid.
      </p>

      {/* Input worksheet */}
      <RuleSection head="Enter holdings" className="mt-6">
        <label htmlFor="portfolio-tickers" className="text-[13px] text-ink-secondary mb-2 block">
          Tickers
        </label>
        <div className="flex gap-2 flex-wrap">
          <Input
            id="portfolio-tickers"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="NVDA, CEG, EQIX, AMD, CCJ, VRT..."
            className="flex-1 min-w-0"
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            data-testid="input-tickers"
          />
          <Button onClick={handleSubmit} disabled={isPending || !inputValue.trim()} data-testid="button-score-portfolio">
            {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
            Score portfolio
          </Button>
          <Button
            variant="secondary"
            onClick={handleShare}
            disabled={!inputValue.trim()}
            data-testid="button-share-portfolio"
            title="Copy shareable link"
          >
            {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
          </Button>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 text-negative text-[12.5px]">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-4">
          <p className="text-[12.5px] text-ink-muted mb-2">Example portfolios</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PORTFOLIOS.map((ex) => (
              <Button
                key={ex.label}
                size="sm"
                variant="secondary"
                className="h-7 text-[12.5px]"
                onClick={() => setInputValue(ex.tickers)}
                data-testid={`example-${ex.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <Plus className="h-3 w-3 mr-1" />
                {ex.label}
              </Button>
            ))}
          </div>
        </div>
      </RuleSection>

      {isPending && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-8 mt-8">
          <div className="space-y-3">
            {Array(4).fill(null).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <Skeleton className="h-14 w-14 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
            ))}
          </div>
          <Skeleton className="h-80 w-full" />
        </div>
      )}

      {sortedResults && !isPending && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-8 mt-8">
          {/* Holdings list */}
          <RuleSection
            head="Holdings scored"
            aside={<span className="tnum">{sortedResults.length} holdings</span>}
            className="mt-0"
          >
            {avgScore !== null && (
              <div className="mb-4">
                <PullStat
                  label="Portfolio average"
                  value={`${avgScore}/100`}
                  note="Weighted composite: Compute 30%, Infrastructure 25%, Power 25%, Cooling 10%, Grid 10%. Above 70 = direct revenue exposure. 40-70 = meaningful indirect exposure."
                  testId="portfolio-average"
                />
              </div>
            )}

            <div className="border-t border-rule">
              {sortedResults.map((r) => (
                <div key={r.ticker} className="py-3 border-b border-rule" data-testid={`portfolio-card-${r.ticker}`}>
                  <div className="flex items-start gap-3">
                    <ScoreRing score={r.score} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <Link
                          href={`/stock/${r.ticker}`}
                          className="text-[14px] font-semibold text-ink no-underline hover:text-brand-ink"
                          data-testid={`link-stock-${r.ticker}`}
                        >
                          {r.ticker}
                        </Link>
                        <span className="text-[13px] text-ink-secondary truncate">{r.name}</span>
                        <span className="text-[12px] font-medium" style={{ color: SEGMENT_COLORS[r.primarySegment] ?? INK.muted }}>
                          {r.primarySegment}
                        </span>
                      </div>
                      <p className="text-[12.5px] text-ink-muted mt-1 leading-relaxed line-clamp-2">{r.explanation}</p>

                      <div className="mt-2 grid grid-cols-5 gap-2">
                        {Object.entries(r.sectors).map(([seg, val]) => (
                          <div key={seg}>
                            <div className="bg-paper-shade h-1">
                              <div
                                className="h-1"
                                style={{ width: `${val}%`, backgroundColor: SEGMENT_COLORS[seg] ?? INK.faint }}
                              />
                            </div>
                            <p className="text-[11px] text-ink-muted mt-0.5">{seg.slice(0, 3)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
              0-100 scale. Above 70 = direct revenue exposure. 40-70 = meaningful indirect exposure.
              Below 40 = minimal positioning.
            </p>
          </RuleSection>

          {/* Radar chart */}
          <RuleSection head="Exposure by segment" className="mt-0">
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                <PolarGrid stroke={CHART_CHROME.grid} />
                <PolarAngleAxis dataKey="axis" tick={{ fill: CHART_CHROME.tick, fontSize: 12, fontFamily: FONT.sans }} />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: CHART_CHROME.axis, fontSize: 10, fontFamily: FONT.sans }}
                  tickCount={4}
                />
                <Tooltip content={<CustomRadarTooltip />} />
                <Radar
                  name="Exposure"
                  dataKey="value"
                  stroke={HIGHLIGHT}
                  fill={HIGHLIGHT}
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
            <SrChartTable
              caption="Average portfolio exposure by supply chain segment, 0-100"
              columns={["Segment", "Average score"]}
              rows={radarData.map((d) => [d.axis, d.value.toFixed(0)])}
            />

            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
              {Object.entries(SEGMENT_COLORS).map(([seg, color]) => (
                <span key={seg} className="flex items-center gap-1.5 text-[12px] text-ink-secondary">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                  {seg}
                </span>
              ))}
            </div>

            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-muted border-t border-rule pt-2">
              Average exposure per segment. Balanced = multi-segment coverage. Concentrated =
              stronger directional bet.
            </p>
            <Provenance
              source="GridTilt segment scoring model"
              extra="weighted composite of your tickers against the tracked supply chain"
            />
          </RuleSection>
        </div>
      )}

      {!results && !isPending && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-[14px] text-ink-secondary">Enter your tickers above to score your portfolio</p>
          <p className="text-[12.5px] text-ink-muted mt-1">Supports US-listed equities and ETFs</p>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
            <span className="text-[12.5px] text-ink-muted">Try tickers from The Stack:</span>
            {STACK_EXAMPLE_TICKERS.map((t) => (
              <button
                key={t}
                onClick={() => addTicker(t)}
                className="text-[12.5px] font-semibold px-1.5 py-0.5 border border-rule text-brand-ink hover:border-rule-strong transition-colors"
                data-testid={`suggest-ticker-${t}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Standalone mount keeps its own shell; embedded (Analyze tab) inherits the
  // host page's PageShell and title.
  if (embedded) return body;
  return <PageShell><div className="pt-8">{body}</div></PageShell>;
}
