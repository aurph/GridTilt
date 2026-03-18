import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Mountain, Zap, Cable, Network, Server,
  ChevronDown, ChevronUp, TrendingUp, TrendingDown,
  Atom, CircleDot, Wrench, Cog, Radiation, Flame, Sun, FlaskConical,
  Plug, Construction, Snowflake, Building2,
  Monitor, BarChart3, Cpu, Pickaxe,
} from "lucide-react";
import { supplyChainConfig, type StageConfig, type BottleneckStatus } from "@/data/supply-chain-config";

const STAGE_ICONS: Record<string, typeof Mountain> = {
  Mountain, Zap, Cable, Network, Server,
};

const SUB_ICONS: Record<string, typeof Mountain> = {
  Atom, CircleDot, Wrench, Cog, Radiation, Flame, Sun, FlaskConical,
  Zap, Plug, Construction, Snowflake, Building2,
  Monitor, BarChart3, Cpu, Pickaxe,
};

const BOTTLENECK_COLORS: Record<BottleneckStatus, string> = {
  flowing: "#22C55E",
  tightening: "#F0A500",
  bottlenecked: "#EF4444",
};

const BOTTLENECK_LABELS: Record<BottleneckStatus, string> = {
  flowing: "Flowing",
  tightening: "Tightening",
  bottlenecked: "Bottlenecked",
};

interface StockData {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

interface StageApiData {
  key: string;
  avgChange: number;
  stocks: StockData[];
}

function ConnectionLines({ stageRefs }: { stageRefs: React.RefObject<(HTMLDivElement | null)[]> }) {
  const [paths, setPaths] = useState<{ d: string; color: string }[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const recalc = () => {
      const refs = stageRefs.current;
      if (!refs || !containerRef.current) return;
      const container = containerRef.current.parentElement;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();

      const newPaths: { d: string; color: string }[] = [];
      for (let i = 0; i < refs.length - 1; i++) {
        const from = refs[i];
        const to = refs[i + 1];
        if (!from || !to) continue;

        const fromRect = from.getBoundingClientRect();
        const toRect = to.getBoundingClientRect();

        const isFromLeft = i % 2 === 0;

        let sx: number, sy: number, ex: number, ey: number;

        if (isFromLeft) {
          sx = fromRect.right - containerRect.left;
          sy = fromRect.bottom - containerRect.top - 40;
          ex = toRect.left - containerRect.left + 40;
          ey = toRect.top - containerRect.top + 20;
        } else {
          sx = fromRect.left - containerRect.left + 40;
          sy = fromRect.bottom - containerRect.top - 40;
          ex = toRect.right - containerRect.left;
          ey = toRect.top - containerRect.top + 20;
        }

        const midY = (sy + ey) / 2;
        const d = `M ${sx} ${sy} C ${sx} ${midY}, ${ex} ${midY}, ${ex} ${ey}`;

        const targetStage = supplyChainConfig.stages[i + 1];
        const color = BOTTLENECK_COLORS[targetStage.bottleneck.status];
        newPaths.push({ d, color });
      }
      setPaths(newPaths);
    };

    containerRef.current = svgRef.current?.parentElement as HTMLDivElement;
    recalc();
    const timer = setTimeout(recalc, 600);
    window.addEventListener("resize", recalc);

    const refs = stageRefs.current;
    let ro: ResizeObserver | null = null;
    if (refs) {
      ro = new ResizeObserver(() => recalc());
      refs.forEach((el) => { if (el) ro!.observe(el); });
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", recalc);
      if (ro) ro.disconnect();
    };
  }, [stageRefs]);

  return (
    <svg
      ref={svgRef}
      className="connection-overlay"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      {paths.map((path, i) => (
        <g key={i}>
          <path
            d={path.d}
            stroke={path.color}
            strokeWidth={2.5}
            fill="none"
            strokeDasharray="8 4"
            opacity={0.25}
          />
          {[0, 1, 2].map((j) => (
            <circle key={j} r="4" fill={path.color} opacity={0.6}>
              <animateMotion
                dur="3s"
                repeatCount="indefinite"
                path={path.d}
                begin={`${j * 1}s`}
              />
            </circle>
          ))}
        </g>
      ))}
    </svg>
  );
}

function StageCard({
  stage,
  apiData,
  index,
  onNavigate,
  cardRef,
}: {
  stage: StageConfig;
  apiData: StageApiData | undefined;
  index: number;
  onNavigate: (path: string) => void;
  cardRef: (el: HTMLDivElement | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const IconComp = STAGE_ICONS[stage.icon] || Zap;
  const bottleneckColor = BOTTLENECK_COLORS[stage.bottleneck.status];

  const stocks = apiData?.stocks || [];
  const avgChange = apiData?.avgChange ?? 0;

  const stockMap = useMemo(() => {
    const m: Record<string, StockData> = {};
    stocks.forEach((s) => { m[s.ticker] = s; });
    return m;
  }, [stocks]);

  const displayCompanies = showAll ? stage.companies : stage.companies.slice(0, 12);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isLeft = index % 2 === 0;
  const isCentered = index === 4;

  return (
    <div
      ref={(el) => { (ref as React.MutableRefObject<HTMLDivElement | null>).current = el; cardRef(el); }}
      className={`stage-card-wrapper ${visible ? "stage-visible" : "stage-hidden"}`}
      style={{
        display: "flex",
        justifyContent: isCentered ? "center" : isLeft ? "flex-start" : "flex-end",
        animationDelay: `${index * 0.12}s`,
      }}
      data-testid={`stage-card-wrapper-${stage.id}`}
    >
      <div
        className="stage-card"
        style={{ "--stage-color": stage.accentColor } as React.CSSProperties}
        data-testid={`stage-node-${stage.id}`}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <IconComp
              className="flex-shrink-0"
              style={{ color: stage.accentColor, width: 24, height: 24 }}
            />
            <div>
              <span className="text-[18px] font-bold text-white leading-tight block">
                {stage.name}
              </span>
              <span className="text-[13px]" style={{ color: "#888" }}>
                {stage.tagline}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[12px] font-semibold px-2.5 py-1 rounded-md"
              style={{
                color: bottleneckColor,
                background: `${bottleneckColor}18`,
                border: `1px solid ${bottleneckColor}30`,
              }}
            >
              {BOTTLENECK_LABELS[stage.bottleneck.status]}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4 mb-4">
          {stage.subCategories.map((sub) => {
            const SubIcon = SUB_ICONS[sub.icon] || Cog;
            return (
              <div
                key={sub.label}
                className="sub-category-tile"
                data-testid={`subcategory-${sub.label.toLowerCase().replace(/\s/g, "-")}`}
              >
                <SubIcon style={{ width: 20, height: 20, color: stage.accentColor }} />
                <span className="text-[10px] mt-1" style={{ color: "#888" }}>{sub.label}</span>
              </div>
            );
          })}
        </div>

        <div className="mb-4">
          <div
            className="w-full rounded-full"
            style={{ height: 6, background: "#2A2925" }}
          >
            <div
              className="rounded-full"
              style={{
                height: 6,
                width: visible ? `${stage.bottleneck.barFill * 100}%` : "0%",
                background: bottleneckColor,
                transition: "width 0.8s ease-out",
                transitionDelay: `${index * 0.12 + 0.3}s`,
              }}
            />
          </div>
        </div>

        <p
          className="text-[13px] leading-relaxed mb-5"
          style={{
            color: "#bbb",
            borderLeft: `3px solid ${stage.accentColor}4D`,
            paddingLeft: 14,
          }}
        >
          {stage.description}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {stage.keyMetrics.map((m) => (
            <div
              key={m.label}
              className="flex-1 min-w-[120px] rounded-lg p-3"
              style={{ background: "#1C1B18", border: "1px solid rgba(255,255,255,0.04)" }}
            >
              <div className="text-[18px] font-bold text-white">{m.value}</div>
              <div className="text-[11px]" style={{ color: "#888" }}>{m.label}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mb-3">
          <span className="text-[13px]" style={{ color: "#aaa" }}>
            {stage.companies.length} companies tracked
          </span>
          <span
            className="text-[13px] font-mono flex items-center gap-1"
            style={{ color: avgChange >= 0 ? "#22C55E" : "#EF4444" }}
          >
            {avgChange >= 0 ? (
              <TrendingUp style={{ width: 13, height: 13 }} />
            ) : (
              <TrendingDown style={{ width: 13, height: 13 }} />
            )}
            {avgChange >= 0 ? "+" : ""}{avgChange.toFixed(2)}% today
          </span>
        </div>

        <button
          className="flex items-center gap-2 text-[13px] font-medium transition-colors w-full justify-center py-2.5 rounded-lg"
          style={{
            color: expanded ? "#888" : stage.accentColor,
            background: expanded ? "transparent" : `${stage.accentColor}12`,
            border: `1px solid ${expanded ? "rgba(255,255,255,0.06)" : `${stage.accentColor}25`}`,
          }}
          onClick={() => setExpanded(!expanded)}
          data-testid={`explore-${stage.id}`}
        >
          {expanded ? (
            <>
              <ChevronUp style={{ width: 14, height: 14 }} />
              Collapse
            </>
          ) : (
            <>
              <ChevronDown style={{ width: 14, height: 14 }} />
              Explore {stage.companies.length} companies
            </>
          )}
        </button>

        <div
          className="companies-expand"
          style={{
            maxHeight: expanded ? "600px" : "0px",
            opacity: expanded ? 1 : 0,
            overflow: "hidden",
            transition: "max-height 0.4s ease-out, opacity 0.3s ease-out",
          }}
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-4 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
            {displayCompanies.map((c) => {
              const sd = stockMap[c.ticker];
              const chg = sd?.changePercent ?? 0;
              return (
                <div
                  key={c.ticker}
                  className="stock-mini-card"
                  style={{ ["--accent" as string]: stage.accentColor }}
                  onClick={() => onNavigate(`/stock/${c.ticker}`)}
                  data-testid={`stock-card-${c.ticker}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-white">{c.ticker}</span>
                    <span
                      className="text-[12px] font-mono"
                      style={{ color: chg >= 0 ? "#22C55E" : "#EF4444" }}
                    >
                      {chg >= 0 ? "+" : ""}{chg.toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-[11px]" style={{ color: "#888" }}>{c.name}</div>
                  <div className="text-[10px]" style={{ color: "#666" }}>{c.subcategory}</div>
                </div>
              );
            })}
          </div>
          {stage.companies.length > 12 && !showAll && (
            <button
              className="text-[11px] mt-2 flex items-center gap-1 hover:text-white transition-colors"
              style={{ color: "#888" }}
              onClick={() => setShowAll(true)}
              data-testid={`show-all-${stage.id}`}
            >
              <ChevronDown style={{ width: 12, height: 12 }} />
              Show all {stage.companies.length} companies
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SupplyChain() {
  const [, navigate] = useLocation();
  const stageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const { data: apiResponse } = useQuery<{ stages: StageApiData[] }>({
    queryKey: ["/api/supply-chain"],
    refetchInterval: 5 * 60 * 1000,
  });

  const apiMap = useMemo(() => {
    const m: Record<string, StageApiData> = {};
    const keyToId: Record<string, string> = {
      rawMaterials: "raw-materials",
      generation: "generation",
      transmission: "transmission",
      distribution: "distribution",
      endUse: "end-use",
    };
    const stages = apiResponse?.stages || [];
    stages.forEach((s) => {
      const id = keyToId[s.key] || s.key;
      m[id] = s;
    });
    return m;
  }, [apiResponse]);

  const handleNavigate = useCallback(
    (path: string) => navigate(path),
    [navigate]
  );

  const totalCompanies = supplyChainConfig.stages.reduce(
    (sum, s) => sum + s.companies.length, 0
  );
  const tightest = supplyChainConfig.stages.reduce((worst, s) => {
    const rank = { flowing: 0, tightening: 1, bottlenecked: 2 };
    return rank[s.bottleneck.status] > rank[worst.bottleneck.status] ? s : worst;
  });

  return (
    <div className="h-full overflow-y-auto" data-testid="supply-chain-page">
      <div
        className="flex items-center gap-2 px-4 md:px-8 flex-wrap sticky top-0 z-10"
        style={{ height: 48, background: "#151513", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        data-testid="supply-chain-summary"
      >
        <span className="text-[16px] font-bold text-white">Supply Chain Tracker</span>
        <span className="text-[13px]" style={{ color: "#666" }}>·</span>
        <span className="text-[13px]" style={{ color: "#aaa" }}>5 stages</span>
        <span className="text-[13px]" style={{ color: "#666" }}>·</span>
        <span className="text-[13px]" style={{ color: "#aaa" }}>{totalCompanies} companies</span>
        <span className="text-[13px]" style={{ color: "#666" }}>·</span>
        <span className="text-[13px]" style={{ color: "#aaa" }}>
          Tightest bottleneck:{" "}
          <span style={{ color: BOTTLENECK_COLORS[tightest.bottleneck.status] }}>
            {tightest.name}
          </span>
        </span>
      </div>

      <div className="relative px-4 md:px-8 py-8 md:py-12 max-w-[1100px] mx-auto">
        <ConnectionLines stageRefs={stageRefs} />

        <div className="relative z-[2] space-y-16 md:space-y-20">
          {supplyChainConfig.stages.map((stage, i) => (
            <StageCard
              key={stage.id}
              stage={stage}
              apiData={apiMap[stage.id]}
              index={i}
              onNavigate={handleNavigate}
              cardRef={(el) => { stageRefs.current[i] = el; }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
