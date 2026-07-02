import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { Info, BarChart3, Search, Loader2, AlertCircle, Plus, Share2, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BORDER, BRAND, CATEGORY_COLORS, CHART_CHROME, INK, SEMANTIC, SERIES } from "@/lib/tokens";

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
      <div className="bg-card border border-card-border rounded-lg p-2 text-xs shadow-xl">
        <p className="text-foreground font-medium">{payload[0]?.payload?.axis}</p>
        <p className="text-muted-foreground">Score: <span className="text-foreground font-mono">{payload[0]?.value?.toFixed(0)}/100</span></p>
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
      <span className="text-xs font-bold font-mono text-foreground z-10">{score}</span>
    </div>
  );
}

export default function PortfolioOverlay() {
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
    window.history.replaceState(null, "", `/portfolio?tickers=${encoded}`);
    mutate(tickers);
  };

  const handleShare = async () => {
    const tickers = inputValue
      .split(/[,\s]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (tickers.length === 0) return;
    const encoded = encodeURIComponent(tickers.join(","));
    const url = `${window.location.origin}/portfolio?tickers=${encoded}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Link copied", description: "Share URL copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: url, variant: "destructive" });
    }
  };

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

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="grid-bg border-b border-border px-6 py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Portfolio Overlay</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Measure portfolio concentration across five AI power supply chain segments: compute, nuclear, uranium, utilities, and infrastructure.
            </p>
          </div>
          <UITooltip>
            <TooltipTrigger>
              <Badge className="bg-brand-2/15 text-brand-2 border-brand-2/30 cursor-help">
                <Info className="h-3 w-3 mr-1" />
                Scoring Methodology
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs leading-relaxed">Weighted composite: Compute 30%, Infrastructure 25%, Power 25%, Cooling 10%, Grid 10%. Above 70 = direct revenue exposure. 40-70 = meaningful indirect exposure.</p>
            </TooltipContent>
          </UITooltip>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {/* Input section */}
        <Card className="p-5 border-card-border">
          <label className="text-sm font-medium text-foreground mb-3 block">Enter Your Tickers</label>
          <div className="flex gap-2 flex-wrap">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="NVDA, CEG, EQIX, AMD, CCJ, VRT..."
              className="flex-1 min-w-0 font-mono"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              data-testid="input-tickers"
            />
            <Button onClick={handleSubmit} disabled={isPending || !inputValue.trim()} data-testid="button-score-portfolio">
              {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Score Portfolio
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
            <div className="mt-3 flex items-center gap-2 text-negative text-xs">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-4">
            <p className="text-xs text-muted-foreground mb-2">Example portfolios:</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PORTFOLIOS.map((ex) => (
                <Button
                  key={ex.label}
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs"
                  onClick={() => setInputValue(ex.tickers)}
                  data-testid={`example-${ex.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {ex.label}
                </Button>
              ))}
            </div>
          </div>
        </Card>

        {isPending && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              {Array(4).fill(null).map((_, i) => (
                <Card key={i} className="p-4 border-card-border">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-14 w-14 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-40" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            <Skeleton className="h-80 w-full rounded-lg" />
          </div>
        )}

        {results && !isPending && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Stock list */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {results.length} Holdings Scored
                </h2>
                {avgScore !== null && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Portfolio Avg</p>
                    <p className="text-lg font-bold font-mono text-brand-2">{avgScore}<span className="text-sm text-muted-foreground">/100</span></p>
                  </div>
                )}
              </div>

              {results
                .sort((a, b) => b.score - a.score)
                .map((r) => (
                  <Card key={r.ticker} className="p-4 border-card-border" data-testid={`portfolio-card-${r.ticker}`}>
                    <div className="flex items-center gap-3">
                      <ScoreRing score={r.score} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-bold text-sm text-foreground font-mono">{r.ticker}</span>
                          <Badge
                            className="text-xs px-1.5 py-0"
                            style={{
                              backgroundColor: `${SEGMENT_COLORS[r.primarySegment] ?? INK.faint}20`,
                              color: SEGMENT_COLORS[r.primarySegment] ?? INK.muted,
                            }}
                          >
                            {r.primarySegment}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{r.name}</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{r.explanation}</p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-5 gap-1">
                      {Object.entries(r.sectors).map(([seg, val]) => (
                        <div key={seg} className="text-center">
                          <div className="bg-muted/30 rounded-full h-1 mb-1">
                            <div
                              className="h-1 rounded-full"
                              style={{ width: `${val}%`, backgroundColor: SEGMENT_COLORS[seg] ?? INK.faint }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">{seg.slice(0, 3)}</p>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
            </div>

            {/* Radar chart */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Portfolio Exposure Radar</h2>
                  <UITooltip>
                    <TooltipTrigger>
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">Average exposure per segment. Balanced = multi-segment coverage. Concentrated = stronger directional bet.</p>
                    </TooltipContent>
                  </UITooltip>
                </div>
              </div>
              <Card className="p-5 border-card-border">
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={radarData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                    <PolarGrid stroke={CHART_CHROME.grid} />
                    <PolarAngleAxis dataKey="axis" tick={{ fill: CHART_CHROME.tick, fontSize: 12 }} />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 100]}
                      tick={{ fill: CHART_CHROME.axis, fontSize: 10 }}
                      tickCount={4}
                    />
                    <Tooltip content={<CustomRadarTooltip />} />
                    <Radar
                      name="Exposure"
                      dataKey="value"
                      stroke={BRAND.secondary}
                      fill={BRAND.secondary}
                      fillOpacity={0.12}
                      strokeWidth={2}
                    />
                  </RadarChart>
                </ResponsiveContainer>

                <div className="flex flex-wrap gap-3 justify-center mt-2">
                  {Object.entries(SEGMENT_COLORS).map(([seg, color]) => (
                    <div key={seg} className="flex items-center gap-1.5 text-xs">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-muted-foreground">{seg}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-4 border-card-border bg-muted/10">
                <div className="flex items-start gap-2">
                  <BarChart3 className="h-4 w-4 text-brand-2 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-1">Score interpretation</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      0-100 scale. Above 70 = direct revenue exposure. 40-70 = meaningful indirect exposure. Below 40 = minimal positioning.
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {!results && !isPending && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm font-medium text-muted-foreground">Enter your tickers above to score your portfolio</p>
            <p className="text-xs text-muted-foreground mt-1">Supports US-listed equities and ETFs</p>
          </div>
        )}
      </div>
    </div>
  );
}
