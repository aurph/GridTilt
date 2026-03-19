import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Zap, Mountain, Cable, Server, X,
  Atom, Circle, Wrench, Gem, Flame, Radiation, Gauge, Sun, FlaskConical,
  Plug, HardHat, Snowflake, ToggleRight, Building, Battery,
  Cloud, Landmark, Cpu, Pickaxe, GitBranch,
  TrendingUp, TrendingDown, ChevronRight,
} from "lucide-react";
import { STAGE_CONFIGS, subSystems, type SubSystem } from "@/data/supply-chain-config";

const ICON_MAP: Record<string, typeof Zap> = {
  Mountain, Zap, Cable, Server, GitBranch,
  Atom, Circle, Wrench, Gem, Flame, Radiation, Gauge, Sun, FlaskConical,
  Plug, HardHat, Snowflake, ToggleRight, Building, Battery,
  Cloud, Landmark, Cpu, Pickaxe,
};

const BOTTLENECK_COLORS: Record<string, string> = {
  flowing: "#22C55E",
  tightening: "#F0A500",
  bottlenecked: "#EF4444",
};

const BOTTLENECK_LABELS: Record<string, string> = {
  flowing: "FLOWING",
  tightening: "TIGHT",
  bottlenecked: "CRITICAL",
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

function ConnectorLines({
  rootRef,
  systemRefs,
  subsystemRefs,
  activeStage,
  activeSubsystem,
}: {
  rootRef: React.RefObject<HTMLDivElement | null>;
  systemRefs: React.RefObject<Record<string, HTMLDivElement | null>>;
  subsystemRefs: React.RefObject<Record<string, HTMLDivElement | null>>;
  activeStage: string | null;
  activeSubsystem: string | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number; active: boolean; level: number }[]>([]);

  const recalc = useCallback(() => {
    const svg = svgRef.current;
    const root = rootRef.current;
    if (!svg || !root) return;
    const containerRect = svg.getBoundingClientRect();
    const newLines: typeof lines = [];

    const rootRect = root.getBoundingClientRect();
    const rootCx = rootRect.left + rootRect.width / 2 - containerRect.left;
    const rootBy = rootRect.bottom - containerRect.top;

    STAGE_CONFIGS.forEach((stage) => {
      const sysEl = systemRefs.current?.[stage.id];
      if (!sysEl) return;
      const sysRect = sysEl.getBoundingClientRect();
      const sysCx = sysRect.left + sysRect.width / 2 - containerRect.left;
      const sysTy = sysRect.top - containerRect.top;
      const sysBx = sysRect.bottom - containerRect.top;

      const isActive = activeStage === stage.id;
      newLines.push({ x1: rootCx, y1: rootBy, x2: sysCx, y2: sysTy, active: isActive, level: 0 });

      const stageSubs = subSystems.filter(s => s.parentStage === stage.id);
      stageSubs.forEach((sub) => {
        const subEl = subsystemRefs.current?.[sub.id];
        if (!subEl) return;
        const subRect = subEl.getBoundingClientRect();
        const subCx = subRect.left + subRect.width / 2 - containerRect.left;
        const subTy = subRect.top - containerRect.top;
        const isSubActive = activeSubsystem === sub.id;
        newLines.push({ x1: sysCx, y1: sysBx, x2: subCx, y2: subTy, active: isSubActive || isActive, level: 1 });
      });
    });

    setLines(newLines);
  }, [rootRef, systemRefs, subsystemRefs, activeStage, activeSubsystem]);

  useEffect(() => {
    recalc();
    const t1 = setTimeout(recalc, 100);
    const t2 = setTimeout(recalc, 500);
    const t3 = setTimeout(recalc, 700);
    window.addEventListener("resize", recalc);

    const ro = new ResizeObserver(() => recalc());
    if (rootRef.current) ro.observe(rootRef.current);
    Object.values(systemRefs.current || {}).forEach(el => { if (el) ro.observe(el); });
    Object.values(subsystemRefs.current || {}).forEach(el => { if (el) ro.observe(el); });

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      window.removeEventListener("resize", recalc);
      ro.disconnect();
    };
  }, [recalc]);

  return (
    <svg ref={svgRef} className="sc-connector-svg" data-testid="sc-connectors">
      {lines.map((l, i) => (
        <line
          key={i}
          x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke={l.active ? "rgba(240,120,0,0.45)" : "rgba(255,255,255,0.06)"}
          strokeWidth={l.active ? 1.5 : 1}
        />
      ))}
    </svg>
  );
}

function DetailPanel({
  sub,
  parentStage,
  stockMap,
  onClose,
  onNavigate,
}: {
  sub: SubSystem;
  parentStage: typeof STAGE_CONFIGS[0];
  stockMap: Record<string, StockData>;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  const Icon = ICON_MAP[sub.icon] || Zap;
  return (
    <div className="sc-detail-panel" data-testid={`detail-${sub.id}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <Icon style={{ width: 18, height: 18, color: parentStage.accentColor }} />
          <div>
            <span className="sc-mono text-[15px] font-bold text-white">{sub.name}</span>
            <span className="text-[11px] ml-2" style={{ color: "#666" }}>{parentStage.name}</span>
          </div>
        </div>
        <button onClick={onClose} className="text-[#555] hover:text-white transition-colors" data-testid="close-detail">
          <X style={{ width: 16, height: 16 }} />
        </button>
      </div>

      <div className="sc-mono text-[11px] mb-3" style={{ color: parentStage.accentColor }}>{sub.oneLiner}</div>

      <div className="sc-divider mb-3" />

      <p className="text-[12px] leading-[1.6] mb-4" style={{ color: "#999" }}>{sub.description}</p>

      {sub.keyMetrics.length > 0 && (
        <div className="flex flex-wrap gap-4 mb-4">
          {sub.keyMetrics.map((m, i) => (
            <div key={i} data-testid={`metric-${sub.id}-${i}`}>
              <div className="sc-mono text-[14px] font-bold text-white">{m.value}</div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: "#555" }}>{m.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="sc-section-label">SECURITIES</div>
      <div className="sc-stock-table">
        <div className="sc-stock-header">
          <span className="sc-stock-col-ticker">TICKER</span>
          <span className="sc-stock-col-name">NAME</span>
          <span className="sc-stock-col-price">PRICE</span>
          <span className="sc-stock-col-chg">CHG%</span>
        </div>
        {sub.companies.map((c) => {
          const stock = stockMap[c.ticker];
          const chg = stock?.changePercent ?? 0;
          const price = stock?.price;
          return (
            <div
              key={c.ticker}
              className="sc-stock-row"
              onClick={() => onNavigate(`/stock/${c.ticker}`)}
              data-testid={`company-${c.ticker}`}
            >
              <span className="sc-stock-col-ticker sc-mono font-bold text-white">{c.ticker}</span>
              <span className="sc-stock-col-name text-[#777] truncate">{c.name}</span>
              <span className="sc-stock-col-price sc-mono text-[#aaa]">{price ? `$${price.toFixed(2)}` : "--"}</span>
              <span className={`sc-stock-col-chg sc-mono font-medium ${chg >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>
                {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SystemSummaryPanel({
  stage,
  subs,
  stockMap,
  onSelectSub,
  onClose,
}: {
  stage: typeof STAGE_CONFIGS[0];
  subs: SubSystem[];
  stockMap: Record<string, StockData>;
  onSelectSub: (id: string) => void;
  onClose: () => void;
}) {
  const allTickers = subs.flatMap(s => s.companies.map(c => c.ticker));
  const uniqueTickers = [...new Set(allTickers)];
  const stocks = uniqueTickers.map(t => stockMap[t]).filter(Boolean);
  const avgChange = stocks.length > 0 ? stocks.reduce((s, st) => s + st.changePercent, 0) / stocks.length : 0;

  return (
    <div className="sc-detail-panel" data-testid={`summary-${stage.id}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="sc-mono text-[15px] font-bold text-white">{stage.name}</span>
          <span className="text-[11px] ml-2" style={{ color: "#555" }}>{stage.tagline}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="sc-mono text-[12px] font-medium" style={{ color: avgChange >= 0 ? "#22C55E" : "#EF4444" }}>
            {avgChange >= 0 ? "+" : ""}{avgChange.toFixed(2)}%
          </span>
          <span className="text-[10px]" style={{ color: "#555" }}>{uniqueTickers.length} securities</span>
          <button onClick={onClose} className="text-[#555] hover:text-white transition-colors" data-testid="close-summary">
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </div>
      <div className="sc-divider mb-3" />
      <div className="sc-section-label">SUB-SYSTEMS</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {subs.map((sub) => {
          const Icon = ICON_MAP[sub.icon] || Zap;
          return (
            <div
              key={sub.id}
              className="sc-summary-sub"
              onClick={() => onSelectSub(sub.id)}
              data-testid={`summary-sub-${sub.id}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon style={{ width: 14, height: 14, color: stage.accentColor }} />
                <span className="sc-mono text-[12px] font-semibold text-white">{sub.name}</span>
              </div>
              <div className="text-[10px]" style={{ color: "#555" }}>{sub.companies.length} co. <ChevronRight style={{ width: 10, height: 10, display: "inline" }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SupplyChain() {
  const [, navigate] = useLocation();
  const [activeSubsystem, setActiveSubsystem] = useState<string | null>(null);
  const [activeStageSummary, setActiveStageSummary] = useState<string | null>(null);
  const [entranceLevel, setEntranceLevel] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const systemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const subsystemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const { data: apiData } = useQuery<{ stages: StageApiData[] }>({
    queryKey: ["/api/supply-chain"],
    refetchInterval: 5 * 60 * 1000,
  });

  const stockMap = useMemo(() => {
    const m: Record<string, StockData> = {};
    apiData?.stages?.forEach((stage) => {
      stage.stocks?.forEach((s) => { m[s.ticker] = s; });
    });
    return m;
  }, [apiData]);

  const stageAvgChanges = useMemo(() => {
    const m: Record<string, number> = {};
    apiData?.stages?.forEach((stage) => { m[stage.key] = stage.avgChange; });
    return m;
  }, [apiData]);

  const totalCompanies = useMemo(() => {
    const all = new Set<string>();
    subSystems.forEach(s => s.companies.forEach(c => all.add(c.ticker)));
    return all.size;
  }, []);

  useEffect(() => {
    const t1 = setTimeout(() => setEntranceLevel(1), 50);
    const t2 = setTimeout(() => setEntranceLevel(2), 250);
    const t3 = setTimeout(() => setEntranceLevel(3), 450);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const activeStageId = activeSubsystem
    ? subSystems.find(s => s.id === activeSubsystem)?.parentStage || null
    : activeStageSummary;

  const handleSubClick = (subId: string) => {
    if (activeSubsystem === subId) {
      setActiveSubsystem(null);
    } else {
      setActiveSubsystem(subId);
      setActiveStageSummary(null);
    }
  };

  const handleSystemClick = (stageId: string) => {
    if (activeStageSummary === stageId) {
      setActiveStageSummary(null);
    } else {
      setActiveStageSummary(stageId);
      setActiveSubsystem(null);
    }
  };

  const tightestBottleneck = STAGE_CONFIGS.reduce((a, b) => b.bottleneck.barFill > a.bottleneck.barFill ? b : a);

  const activeSub = activeSubsystem ? subSystems.find(s => s.id === activeSubsystem) : null;
  const activeParentStage = activeSub ? STAGE_CONFIGS.find(s => s.id === activeSub.parentStage) : null;
  const summaryStage = activeStageSummary ? STAGE_CONFIGS.find(s => s.id === activeStageSummary) : null;
  const summarySubs = summaryStage ? subSystems.filter(s => s.parentStage === summaryStage.id) : [];

  return (
    <div className="sc-page" data-testid="supply-chain-page">
      <div className="sc-topbar" data-testid="sc-summary-bar">
        <div className="sc-topbar-left">
          <span className="sc-mono text-[13px] font-bold" style={{ color: "#F07800" }}>SUPPLY CHAIN</span>
          <span className="sc-topbar-sep">|</span>
          <span className="sc-mono text-[11px] text-white">AI Power Infrastructure</span>
        </div>
        <div className="sc-topbar-right">
          <span className="sc-mono text-[10px]" style={{ color: "#555" }}>SYSTEMS</span>
          <span className="sc-mono text-[11px] text-white">5</span>
          <span className="sc-topbar-sep">|</span>
          <span className="sc-mono text-[10px]" style={{ color: "#555" }}>SECURITIES</span>
          <span className="sc-mono text-[11px] text-white">{totalCompanies}</span>
          <span className="sc-topbar-sep">|</span>
          <span className="sc-mono text-[10px]" style={{ color: "#555" }}>BOTTLENECK</span>
          <span className="sc-mono text-[11px]" style={{ color: "#EF4444" }} data-testid="tightest-bottleneck">{tightestBottleneck.name.toUpperCase()}</span>
        </div>
      </div>

      <div className="sc-tree">
        <ConnectorLines
          rootRef={rootRef}
          systemRefs={systemRefs}
          subsystemRefs={subsystemRefs}
          activeStage={activeStageId}
          activeSubsystem={activeSubsystem}
        />

        <div
          ref={rootRef}
          className={`sc-root ${entranceLevel >= 1 ? "sc-entered" : "sc-pre-enter"}`}
          data-testid="sc-root"
        >
          <Zap style={{ width: 16, height: 16, color: "#F07800" }} />
          <span className="sc-mono text-[13px] font-bold text-white">AI POWER SUPPLY CHAIN</span>
          <span className="sc-mono text-[10px]" style={{ color: "#555" }}>{totalCompanies} securities tracked</span>
        </div>

        <div className={`sc-systems-row ${entranceLevel >= 2 ? "sc-entered" : "sc-pre-enter"}`}>
          {STAGE_CONFIGS.map((stage, idx) => {
            const Icon = ICON_MAP[stage.icon] || Zap;
            const isActive = activeStageId === stage.id;
            const isDimmed = activeStageId !== null && !isActive;
            const avgChg = stageAvgChanges[stage.id] ?? 0;
            const bottleneckColor = BOTTLENECK_COLORS[stage.bottleneck.status];
            const stageSubs = subSystems.filter(s => s.parentStage === stage.id);
            const stageCompanyCount = new Set(stageSubs.flatMap(s => s.companies.map(c => c.ticker))).size;

            return (
              <div
                key={stage.id}
                ref={(el) => { systemRefs.current[stage.id] = el; }}
                className={`sc-system ${isActive ? "sc-system-active" : ""}`}
                style={{
                  "--system-color": stage.accentColor,
                  opacity: isDimmed ? 0.35 : 1,
                } as React.CSSProperties}
                onClick={() => handleSystemClick(stage.id)}
                data-testid={`system-${stage.id}`}
              >
                <div className="sc-system-header">
                  <div className="flex items-center gap-2">
                    <Icon style={{ width: 16, height: 16, color: stage.accentColor }} />
                    <span className="sc-mono text-[12px] font-bold text-white">{stage.name}</span>
                  </div>
                  <span className="sc-mono text-[9px] font-bold px-1.5 py-0.5" style={{ background: `${bottleneckColor}15`, color: bottleneckColor, borderRadius: 2 }} data-testid={`bottleneck-${stage.id}`}>
                    {BOTTLENECK_LABELS[stage.bottleneck.status]}
                  </span>
                </div>
                <div className="text-[10px]" style={{ color: "#555" }}>{stage.tagline}</div>
                <div className="sc-system-bar">
                  <div className="sc-system-bar-fill" style={{ width: `${stage.bottleneck.barFill * 100}%`, background: bottleneckColor }} />
                </div>
                <div className="sc-system-footer">
                  <span className="sc-mono text-[10px]" style={{ color: "#555" }}>{stageCompanyCount} co.</span>
                  <span className="sc-mono text-[10px] font-medium" style={{ color: avgChg >= 0 ? "#22C55E" : "#EF4444" }} data-testid={`avg-change-${stage.id}`}>
                    {avgChg >= 0 ? "+" : ""}{avgChg.toFixed(2)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className={`sc-subsystems-row ${entranceLevel >= 3 ? "sc-entered" : "sc-pre-enter"}`}>
          {STAGE_CONFIGS.map((stage) => {
            const stageSubs = subSystems.filter(s => s.parentStage === stage.id);
            const isStageActive = activeStageId === stage.id;
            const isDimmed = activeStageId !== null && !isStageActive;

            return (
              <div key={stage.id} className="sc-subsystem-cluster" style={{ opacity: isDimmed ? 0.35 : 1, transition: "opacity 0.3s ease" }}>
                {stageSubs.map((sub) => {
                  const Icon = ICON_MAP[sub.icon] || Zap;
                  const isSubActive = activeSubsystem === sub.id;
                  return (
                    <div
                      key={sub.id}
                      ref={(el) => { subsystemRefs.current[sub.id] = el; }}
                      className={`sc-subsystem ${isSubActive ? "sc-subsystem-active" : ""}`}
                      style={{ "--parent-color": stage.accentColor } as React.CSSProperties}
                      onClick={(e) => { e.stopPropagation(); handleSubClick(sub.id); }}
                      data-testid={`subsystem-${sub.id}`}
                    >
                      <Icon style={{ width: 20, height: 20, color: isSubActive ? stage.accentColor : "#666", transition: "color 0.2s" }} />
                      <span className="sc-subsystem-label">{sub.name}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {activeSub && activeParentStage && (
          <DetailPanel
            sub={activeSub}
            parentStage={activeParentStage}
            stockMap={stockMap}
            onClose={() => setActiveSubsystem(null)}
            onNavigate={navigate}
          />
        )}

        {summaryStage && !activeSubsystem && (
          <SystemSummaryPanel
            stage={summaryStage}
            subs={summarySubs}
            stockMap={stockMap}
            onSelectSub={(id) => { setActiveSubsystem(id); setActiveStageSummary(null); }}
            onClose={() => setActiveStageSummary(null)}
          />
        )}
      </div>
    </div>
  );
}
