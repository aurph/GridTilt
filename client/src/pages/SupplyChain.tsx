import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ChevronRight, AlertTriangle, CheckCircle2, XCircle,
  TrendingUp, TrendingDown, ArrowRight, Loader2,
} from "lucide-react";

interface StockItem {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  marketCapDisplay: string;
}

interface Stage {
  key: string;
  name: string;
  tagline: string;
  color: string;
  companyCount: number;
  avgChange: number;
  bottleneckStatus: "Flowing" | "Tightening" | "Bottlenecked";
  bottleneckDetail: string;
  keyMetric: string;
  stocks: StockItem[];
}

interface SupplyChainData {
  stages: Stage[];
  tightestBottleneck: string;
}

function BottleneckBadge({ status }: { status: Stage["bottleneckStatus"] }) {
  const config = {
    Flowing: { icon: CheckCircle2, bg: "bg-green-500/15", text: "text-green-400", border: "border-green-500/20" },
    Tightening: { icon: AlertTriangle, bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/20" },
    Bottlenecked: { icon: XCircle, bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/20" },
  }[status];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${config.bg} ${config.text} border ${config.border}`} data-testid={`badge-bottleneck-${status.toLowerCase()}`}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

function StockCard({ stock }: { stock: StockItem }) {
  const isUp = stock.changePercent >= 0;
  return (
    <Link href={`/stock/${stock.ticker}`}>
      <div
        className="bg-[#151520]/80 border border-white/[0.06] rounded-lg px-3 py-2.5 hover:border-[#F07800]/30 hover:bg-[#1A1A2E]/80 transition-all duration-200 cursor-pointer group"
        data-testid={`stock-card-${stock.ticker}`}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold text-white tracking-wide">{stock.ticker}</span>
          <span className={`text-[10px] font-mono font-semibold ${isUp ? "text-green-400" : "text-red-400"}`}>
            {isUp ? "+" : ""}{stock.changePercent.toFixed(2)}%
          </span>
        </div>
        <div className="text-[10px] text-white/40 truncate mb-1 leading-tight">{stock.name}</div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-white/70">${stock.price.toFixed(2)}</span>
          {stock.marketCapDisplay && (
            <span className="text-[9px] text-white/30 font-mono">{stock.marketCapDisplay}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function FlowConnector({ fromColor, toColor, status }: { fromColor: string; toColor: string; status: Stage["bottleneckStatus"] }) {
  const lineColor = status === "Bottlenecked" ? "#ef4444" : status === "Tightening" ? "#F0A500" : "#22c55e";
  return (
    <div className="hidden lg:flex items-center justify-center w-12 flex-shrink-0 relative" data-testid="flow-connector">
      <svg width="48" height="40" viewBox="0 0 48 40" className="overflow-visible">
        <defs>
          <linearGradient id={`grad-${fromColor}-${toColor}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={fromColor} stopOpacity="0.6" />
            <stop offset="100%" stopColor={toColor} stopOpacity="0.6" />
          </linearGradient>
        </defs>
        <line x1="0" y1="20" x2="48" y2="20" stroke={lineColor} strokeWidth="2" strokeDasharray="6 4" className="flow-line" />
        <polygon points="40,14 48,20 40,26" fill={lineColor} opacity="0.8" />
      </svg>
    </div>
  );
}

function StageSkeleton() {
  return (
    <div className="flex-1 min-w-[200px] bg-[#0d0d14] border border-white/[0.06] rounded-xl p-4 animate-pulse">
      <div className="h-4 w-24 bg-white/10 rounded mb-2" />
      <div className="h-3 w-32 bg-white/5 rounded mb-3" />
      <div className="h-6 w-20 bg-white/10 rounded mb-2" />
      <div className="h-3 w-28 bg-white/5 rounded" />
    </div>
  );
}

function StageNode({ stage, isExpanded, onToggle }: { stage: Stage; isExpanded: boolean; onToggle: () => void }) {
  const isUp = stage.avgChange >= 0;

  return (
    <div
      className={`flex-1 min-w-[180px] rounded-xl border transition-all duration-300 cursor-pointer ${
        isExpanded
          ? "bg-[#0d0d14] border-white/[0.12] shadow-2xl"
          : "bg-[#0d0d14]/80 border-white/[0.06] hover:border-white/[0.12] hover:shadow-lg"
      }`}
      style={{
        boxShadow: isExpanded ? `0 0 40px ${stage.color}15, 0 8px 32px rgba(0,0,0,0.5)` : undefined,
      }}
      onClick={onToggle}
      data-testid={`stage-${stage.key}`}
    >
      <div className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color, boxShadow: `0 0 8px ${stage.color}60` }} />
          <h3 className="text-sm font-bold text-white tracking-tight">{stage.name}</h3>
        </div>
        <p className="text-[10px] text-white/40 mb-3 font-mono uppercase tracking-wider">{stage.tagline}</p>

        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-white/50 font-mono">{stage.companyCount} companies</span>
          <span className={`text-xs font-mono font-bold flex items-center gap-0.5 ${isUp ? "text-green-400" : "text-red-400"}`}>
            {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {isUp ? "+" : ""}{stage.avgChange.toFixed(2)}%
          </span>
        </div>

        <div className="flex items-center justify-between">
          <BottleneckBadge status={stage.bottleneckStatus} />
          <ChevronRight className={`h-3.5 w-3.5 text-white/30 transition-transform duration-300 ${isExpanded ? "rotate-90" : ""}`} />
        </div>

        <div className="mt-2 pt-2 border-t border-white/[0.06]">
          <div className="text-[10px] text-white/30 font-mono uppercase tracking-wider mb-0.5">Key Metric</div>
          <div className="text-xs font-mono font-semibold" style={{ color: stage.color }}>{stage.keyMetric}</div>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-white/[0.06] p-4 animate-in slide-in-from-top-2 duration-300" onClick={(e) => e.stopPropagation()}>
          <div className="mb-3">
            <p className="text-xs text-white/60 leading-relaxed">{stage.bottleneckDetail}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {stage.stocks.map((stock) => (
              <StockCard key={stock.ticker} stock={stock} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SupplyChain() {
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<SupplyChainData>({
    queryKey: ["/api/supply-chain"],
    refetchInterval: 5 * 60 * 1000,
  });

  const totalCompanies = data?.stages.reduce((s, st) => s + st.companyCount, 0) ?? 0;
  const tightestBottleneck = data?.tightestBottleneck ?? "Transmission";
  const tightestStage = data?.stages.find((s) => s.name === tightestBottleneck);

  return (
    <div className="h-full overflow-y-auto" data-testid="supply-chain-page">
      <style>{`
        @keyframes flow-dash {
          to { stroke-dashoffset: -20; }
        }
        .flow-line {
          animation: flow-dash 1.5s linear infinite;
        }
      `}</style>

      <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight mb-1">
            Supply Chain Tracker
          </h1>
          <p className="text-xs text-white/40 font-mono">
            5 stages / {totalCompanies} companies tracked / Tightest bottleneck:{" "}
            <span className="text-red-400 font-semibold">{tightestBottleneck}</span>
            {tightestStage && (
              <span className="text-white/30"> ({tightestStage.keyMetric})</span>
            )}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-400" data-testid="error-message">
            Failed to load supply chain data. Please try again.
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col lg:flex-row gap-3 items-stretch">
            {[1, 2, 3, 4, 5].map((i) => (
              <StageSkeleton key={i} />
            ))}
          </div>
        ) : data ? (
          <>
            <div className="flex flex-col lg:flex-row gap-0 items-stretch" data-testid="supply-chain-flow">
              {data.stages.map((stage, i) => (
                <div key={stage.key} className="flex flex-col lg:flex-row items-stretch flex-1 min-w-0">
                  <StageNode
                    stage={stage}
                    isExpanded={expandedStage === stage.key}
                    onToggle={() => setExpandedStage(expandedStage === stage.key ? null : stage.key)}
                  />
                  {i < data.stages.length - 1 && (
                    <>
                      <FlowConnector
                        fromColor={stage.color}
                        toColor={data.stages[i + 1].color}
                        status={stage.bottleneckStatus}
                      />
                      <div className="lg:hidden flex justify-center py-1">
                        <ArrowRight className="h-4 w-4 text-white/20 rotate-90" />
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-[#0d0d14]/60 border border-white/[0.04] rounded-lg p-4 mt-4">
              <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-white/40">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-green-400" />
                  Flowing: No major constraint
                </span>
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-orange-400" />
                  Tightening: Lead times growing
                </span>
                <span className="flex items-center gap-1.5">
                  <XCircle className="h-3 w-3 text-red-400" />
                  Bottlenecked: Multi-year backlogs
                </span>
              </div>
            </div>

            <div className="text-xs text-white/30 mt-2">
              <Link href="/trade" className="text-[#F07800]/70 hover:text-[#F07800] transition-colors">
                Model the demand scenarios with the Thesis Calculator <ArrowRight className="h-3 w-3 inline" />
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
