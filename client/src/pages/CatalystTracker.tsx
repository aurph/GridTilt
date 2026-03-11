import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Clock, TrendingUp, Info } from "lucide-react";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Catalyst {
  id: number;
  date: string;
  title: string;
  category: "Earnings" | "Regulatory" | "Policy" | "Market";
  thesisImpact: string;
  tickers: string[];
}

const CATEGORY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  Earnings:   { bg: "bg-[#1E90FF]/10",  text: "text-[#1E90FF]",  border: "border-[#1E90FF]/25" },
  Regulatory: { bg: "bg-[#F0A500]/10",  text: "text-[#F0A500]",  border: "border-[#F0A500]/25" },
  Policy:     { bg: "bg-purple-500/10", text: "text-purple-400",  border: "border-purple-500/25" },
  Market:     { bg: "bg-[#F07800]/10",  text: "text-[#F07800]",  border: "border-[#F07800]/25" },
};

const TICKER_COLORS: Record<string, string> = {
  NVDA: "#76b900", TSM: "#e5143d", CEG: "#005a8b", VST: "#ef4444",
  CCJ: "#6366f1", NXE: "#8b5cf6", GE: "#0088ce", ETN: "#e4002b",
  MSFT: "#00a4ef", GOOGL: "#4285f4", AMZN: "#ff9900", META: "#0866ff",
  OKLO: "#F0A500", NLR: "#22c55e", URA: "#a855f7", TSLA: "#cc0000",
  NEE: "#009900", ETR: "#005587",
};

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DateBadge({ dateStr }: { dateStr: string }) {
  const days = daysUntil(dateStr);
  const isPast = days < 0;
  const isImminent = days >= 0 && days <= 7;
  const isSoon = days > 7 && days <= 21;

  let colorClass = "text-muted-foreground border-card-border bg-muted/30";
  if (isPast) colorClass = "text-muted-foreground/50 border-border/30 bg-muted/20";
  else if (isImminent) colorClass = "text-[#F07800] border-[#F07800]/30 bg-[#F07800]/10";
  else if (isSoon) colorClass = "text-[#F0A500] border-[#F0A500]/25 bg-[#F0A500]/8";

  return (
    <div className={`flex flex-col items-center rounded-md border px-3 py-2 min-w-[72px] ${colorClass}`}>
      <span className="text-xs font-bold font-mono leading-none">
        {isPast ? "PAST" : days === 0 ? "TODAY" : `${days}d`}
      </span>
      <span className="text-[10px] mt-0.5 opacity-80">{formatDate(dateStr)}</span>
    </div>
  );
}

const FILTER_OPTIONS = ["All", "Earnings", "Regulatory", "Policy", "Market"] as const;
type FilterOption = typeof FILTER_OPTIONS[number];

export default function CatalystTracker() {
  const [activeFilter, setActiveFilter] = useState<FilterOption>("All");

  const { data: catalysts, isLoading } = useQuery<Catalyst[]>({
    queryKey: ["/api/catalysts"],
  });

  const filtered = catalysts?.filter(
    (c) => activeFilter === "All" || c.category === activeFilter
  ) ?? [];

  const upcoming = filtered.filter((c) => daysUntil(c.date) >= 0);
  const past = filtered.filter((c) => daysUntil(c.date) < 0);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="grid-bg border-b border-border px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-[#F0A500]/15 text-[#F0A500] border-[#F0A500]/30 text-xs font-mono tracking-wider">
                CURATED
              </Badge>
              <span className="text-xs text-muted-foreground tracking-wide">Manually maintained event calendar</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Catalyst Tracker</h1>
            <p className="text-muted-foreground text-sm mt-1 max-w-xl">
              Upcoming events with direct impact on the AI power thesis. Earnings, regulatory decisions, policy moments, and commodity market windows.
            </p>
          </div>
          <UITooltip>
            <TooltipTrigger>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-help">
                <Info className="h-3.5 w-3.5" />
                <span>How to update</span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs leading-relaxed">
                Catalysts are stored in <code className="font-mono text-[#F0A500]">server/data/catalysts.json</code>. Edit that file to add, remove, or update events without redeploying. Each entry has: date, title, category, thesisImpact, tickers.
              </p>
            </TooltipContent>
          </UITooltip>
        </div>

        {/* Category filter strip */}
        <div className="flex flex-wrap items-center gap-2 mt-5">
          {FILTER_OPTIONS.map((opt) => {
            const isActive = activeFilter === opt;
            const style = opt !== "All" ? CATEGORY_STYLES[opt] : null;
            return (
              <button
                key={opt}
                onClick={() => setActiveFilter(opt)}
                data-testid={`filter-${opt.toLowerCase()}`}
                className={`px-3 py-1 rounded-md text-xs font-medium border transition-all ${
                  isActive
                    ? style
                      ? `${style.bg} ${style.text} ${style.border}`
                      : "bg-[#F07800]/15 text-[#F07800] border-[#F07800]/30"
                    : "border-card-border text-muted-foreground hover:text-foreground bg-muted/20"
                }`}
              >
                {opt}
                {catalysts && opt !== "All" && (
                  <span className="ml-1.5 opacity-60">
                    {catalysts.filter((c) => c.category === opt).length}
                  </span>
                )}
                {catalysts && opt === "All" && (
                  <span className="ml-1.5 opacity-60">{catalysts.length}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {isLoading && (
          <div className="space-y-4">
            {Array(4).fill(null).map((_, i) => (
              <Card key={i} className="p-5 border-card-border">
                <div className="flex gap-4">
                  <Skeleton className="h-14 w-16 rounded-md flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-5/6" />
                    <div className="flex gap-1 pt-1">
                      {Array(4).fill(null).map((_, j) => (
                        <Skeleton key={j} className="h-5 w-12 rounded-full" />
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && upcoming.length === 0 && past.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground">No catalysts found for this filter</p>
          </div>
        )}

        {!isLoading && upcoming.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-3.5 w-3.5 text-[#F07800]" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Upcoming
              </h2>
              <span className="text-xs text-muted-foreground/50">({upcoming.length})</span>
            </div>
            <div className="space-y-3">
              {upcoming.map((catalyst) => (
                <CatalystCard key={catalyst.id} catalyst={catalyst} />
              ))}
            </div>
          </div>
        )}

        {!isLoading && past.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/50 px-2">
                Past Events
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-3 opacity-50">
              {past.map((catalyst) => (
                <CatalystCard key={catalyst.id} catalyst={catalyst} dimmed />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CatalystCard({ catalyst, dimmed }: { catalyst: Catalyst; dimmed?: boolean }) {
  const style = CATEGORY_STYLES[catalyst.category];

  return (
    <Card
      className={`p-5 border-card-border hover-elevate ${dimmed ? "opacity-60" : ""}`}
      data-testid={`catalyst-card-${catalyst.id}`}
    >
      <div className="flex gap-4">
        <DateBadge dateStr={catalyst.date} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
            <h3 className="font-semibold text-sm text-foreground leading-snug">{catalyst.title}</h3>
            <Badge
              className={`text-xs px-2 py-0.5 border flex-shrink-0 ${style.bg} ${style.text} ${style.border}`}
            >
              {catalyst.category}
            </Badge>
          </div>

          <div className="flex items-start gap-1.5 mb-3">
            <TrendingUp className="h-3 w-3 text-[#F0A500] mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {catalyst.thesisImpact}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {catalyst.tickers.map((t) => (
              <span
                key={t}
                className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border"
                style={{
                  color: TICKER_COLORS[t] ?? "#9ca3af",
                  backgroundColor: `${TICKER_COLORS[t] ?? "#9ca3af"}14`,
                  borderColor: `${TICKER_COLORS[t] ?? "#9ca3af"}30`,
                }}
                data-testid={`ticker-${t}-${catalyst.id}`}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
