import { useState, useCallback, useEffect, useMemo, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ReactFlow,
  Background,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  useReactFlow,
  ReactFlowProvider,
  getBezierPath,
  type EdgeProps,
  BaseEdge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Mountain, Zap, Cable, Network, Server,
  ChevronDown, ChevronUp, TrendingUp, TrendingDown, X as XIcon, ArrowRight,
} from "lucide-react";
import { supplyChainConfig, type StageConfig, type BottleneckStatus } from "@/data/supply-chain-config";

const STAGE_ICONS: Record<string, typeof Mountain> = {
  Mountain, Zap, Cable, Network, Server,
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

function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const status = (data?.bottleneckStatus as BottleneckStatus) || "tightening";
  const color = BOTTLENECK_COLORS[status];
  const strokeWidth = status === "bottlenecked" ? 3 : 2;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{ stroke: color, strokeWidth, opacity: 0.35 }}
      />
      <BaseEdge
        id={`${id}-dash`}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: strokeWidth - 0.5,
          strokeDasharray: "6 8",
          strokeDashoffset: 0,
          opacity: 0.5,
          animation: "flowDash 1.5s linear infinite",
        }}
      />
      {[0, 1, 2].map((i) => (
        <circle key={i} r="3" fill={color} opacity="0.7">
          <animateMotion
            dur="3s"
            repeatCount="indefinite"
            begin={`${i * 1}s`}
            path={edgePath}
          />
        </circle>
      ))}
    </>
  );
}

const StageNode = memo(function StageNode({ data }: NodeProps) {
  const stage = data.stage as StageConfig;
  const apiData = data.apiData as StageApiData | undefined;
  const expanded = data.expanded as boolean;
  const onToggle = data.onToggle as () => void;
  const onNavigate = data.onNavigate as (path: string) => void;
  const animIndex = data.animIndex as number;
  const isMobile = data.isMobile as boolean;

  const [showAll, setShowAll] = useState(false);
  const IconComp = STAGE_ICONS[stage.icon] || Zap;
  const bottleneckColor = BOTTLENECK_COLORS[stage.bottleneck.status];

  const stocks = apiData?.stocks || [];
  const avgChange = apiData?.avgChange ?? 0;
  const companyCount = stage.companies.length;

  const stockMap = useMemo(() => {
    const m: Record<string, StockData> = {};
    stocks.forEach((s) => { m[s.ticker] = s; });
    return m;
  }, [stocks]);

  const displayCompanies = showAll ? stage.companies : stage.companies.slice(0, 8);
  const hasMore = stage.companies.length > 8;

  const targetPos = isMobile ? Position.Top : Position.Left;
  const sourcePos = isMobile ? Position.Bottom : Position.Right;

  return (
    <div
      className="stage-node-wrapper"
      style={{
        animation: `fadeSlideIn 0.5s ease-out ${animIndex * 0.15}s both`,
      }}
    >
      <Handle type="target" position={targetPos} style={{ opacity: 0 }} />
      <Handle type="source" position={sourcePos} style={{ opacity: 0 }} />

      <div
        className="stage-node-card"
        style={{
          width: expanded ? 420 : 260,
          borderColor: expanded
            ? `${stage.accentColor}66`
            : "rgba(255,255,255,0.08)",
          boxShadow: expanded
            ? `0 0 30px ${stage.accentColor}20`
            : "none",
        }}
        data-testid={`stage-node-${stage.id}`}
      >
        <div className="flex items-center gap-2 mb-1">
          <IconComp
            className="flex-shrink-0"
            style={{ color: stage.accentColor, width: 18, height: 18 }}
          />
          <span className="text-[16px] font-bold text-white leading-tight">
            {stage.name}
          </span>
        </div>
        <p className="text-[12px] mb-3" style={{ color: "#888" }}>
          {stage.tagline}
        </p>

        <div className="mb-3">
          <div
            className="w-full rounded-full"
            style={{ height: 6, background: "#2A2A3E" }}
          >
            <div
              className="rounded-full bottleneck-bar-fill"
              style={{
                height: 6,
                width: `${stage.bottleneck.barFill * 100}%`,
                background: bottleneckColor,
                animation: `barGrow 0.8s ease-out ${animIndex * 0.15 + 0.3}s both`,
              }}
            />
          </div>
          <span
            className="text-[11px] font-medium mt-1 inline-block"
            style={{ color: bottleneckColor }}
          >
            {BOTTLENECK_LABELS[stage.bottleneck.status]}
          </span>
        </div>

        <div className="flex items-center justify-between mb-1">
          <span className="text-[12px]" style={{ color: "#aaa" }}>
            {companyCount} companies
          </span>
          <span
            className="text-[12px] font-mono flex items-center gap-1"
            style={{ color: avgChange >= 0 ? "#22C55E" : "#EF4444" }}
          >
            {avgChange >= 0 ? (
              <TrendingUp style={{ width: 12, height: 12 }} />
            ) : (
              <TrendingDown style={{ width: 12, height: 12 }} />
            )}
            {avgChange >= 0 ? "+" : ""}
            {avgChange.toFixed(2)}% today
          </span>
        </div>

        <p className="text-[13px] font-medium" style={{ color: "#F0A500" }}>
          {stage.keyMetrics[0]?.label}: {stage.keyMetrics[0]?.value}
        </p>

        {!expanded && (
          <div className="flex items-center gap-1 mt-3 text-[11px]" style={{ color: "#666" }}>
            <ChevronDown style={{ width: 12, height: 12 }} />
            Click to explore
          </div>
        )}

        {expanded && (
          <div
            className="mt-4 pt-4"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
            data-stop-toggle
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="text-[13px] leading-relaxed mb-4"
              style={{
                color: "#ccc",
                borderLeft: `3px solid ${stage.accentColor}4D`,
                paddingLeft: 12,
              }}
            >
              {stage.description}
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {stage.keyMetrics.map((m) => (
                <div
                  key={m.label}
                  className="flex-1 min-w-[100px] rounded-lg p-3"
                  style={{ background: "#222238" }}
                >
                  <div className="text-[18px] font-bold text-white">
                    {m.value}
                  </div>
                  <div className="text-[11px]" style={{ color: "#888" }}>
                    {m.label}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-1.5 max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
              {displayCompanies.map((c) => {
                const sd = stockMap[c.ticker];
                const chg = sd?.changePercent ?? 0;
                return (
                  <div
                    key={c.ticker}
                    className="stock-mini-card"
                    style={{
                      ["--accent" as string]: stage.accentColor,
                    }}
                    onClick={() => onNavigate(`/stock/${c.ticker}`)}
                    data-testid={`stock-card-${c.ticker}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-bold text-white">
                        {c.ticker}
                      </span>
                      <span
                        className="text-[12px] font-mono"
                        style={{ color: chg >= 0 ? "#22C55E" : "#EF4444" }}
                      >
                        {chg >= 0 ? "+" : ""}
                        {chg.toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-[11px]" style={{ color: "#888" }}>
                      {c.name}
                    </div>
                    <div className="text-[10px]" style={{ color: "#666" }}>
                      {c.subcategory}
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore && !showAll && (
              <button
                className="text-[11px] mt-2 flex items-center gap-1 hover:text-white transition-colors"
                style={{ color: "#888" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAll(true);
                }}
                data-testid={`show-all-${stage.id}`}
              >
                <ChevronDown style={{ width: 12, height: 12 }} />
                Show all {stage.companies.length} companies
              </button>
            )}

            <button
              className="flex items-center gap-1 mt-3 text-[11px] hover:text-white transition-colors"
              style={{ color: "#666" }}
              onClick={() => onToggle()}
              data-testid={`close-${stage.id}`}
            >
              <ChevronUp style={{ width: 12, height: 12 }} />
              Collapse
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

const nodeTypes = { stageNode: StageNode };
const edgeTypes = { animated: AnimatedEdge };

function getNodePositions(isMobile: boolean) {
  if (isMobile) {
    return supplyChainConfig.stages.map((s, i) => ({
      id: s.id,
      position: { x: 50, y: i * 340 },
    }));
  }
  return supplyChainConfig.stages.map((s, i) => ({
    id: s.id,
    position: { x: i * 340, y: 200 },
  }));
}

function SupplyChainFlow() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const { fitView } = useReactFlow();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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

  const handleToggle = useCallback(
    (stageId: string) => {
      setExpandedId((prev) => (prev === stageId ? null : stageId));
      setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50);
    },
    [fitView]
  );

  const handleNavigate = useCallback(
    (path: string) => navigate(path),
    [navigate]
  );

  const positions = getNodePositions(isMobile);

  const nodes: Node[] = supplyChainConfig.stages.map((stage, i) => ({
    id: stage.id,
    type: "stageNode",
    position: positions[i].position,
    data: {
      stage,
      apiData: apiMap[stage.id],
      expanded: expandedId === stage.id,
      onToggle: () => handleToggle(stage.id),
      onNavigate: handleNavigate,
      animIndex: i,
      isMobile,
    },
    draggable: false,
  }));

  const edges: Edge[] = [
    { id: "e1", source: "raw-materials", target: "generation" },
    { id: "e2", source: "generation", target: "transmission" },
    { id: "e3", source: "transmission", target: "distribution" },
    { id: "e4", source: "distribution", target: "end-use" },
  ].map((e, i) => {
    const targetStage = supplyChainConfig.stages[i + 1];
    return {
      ...e,
      type: "animated",
      data: { bottleneckStatus: targetStage.bottleneck.status },
    };
  });

  useEffect(() => {
    const timer = setTimeout(() => fitView({ padding: 0.15, duration: 600 }), 200);
    return () => clearTimeout(timer);
  }, [fitView, isMobile]);

  const totalCompanies = supplyChainConfig.stages.reduce(
    (sum, s) => sum + s.companies.length,
    0
  );
  const tightest = supplyChainConfig.stages.reduce((worst, s) => {
    const rank = { flowing: 0, tightening: 1, bottlenecked: 2 };
    return rank[s.bottleneck.status] > rank[worst.bottleneck.status] ? s : worst;
  });

  return (
    <div className="h-full flex flex-col" data-testid="supply-chain-page">
      <div
        className="flex items-center gap-2 px-4 flex-shrink-0 flex-wrap"
        style={{ height: 48, background: "#12121E" }}
        data-testid="supply-chain-summary"
      >
        <span className="text-[16px] font-bold text-white">
          Supply Chain Tracker
        </span>
        <span className="text-[13px]" style={{ color: "#666" }}>
          ·
        </span>
        <span className="text-[13px]" style={{ color: "#aaa" }}>
          5 stages
        </span>
        <span className="text-[13px]" style={{ color: "#666" }}>
          ·
        </span>
        <span className="text-[13px]" style={{ color: "#aaa" }}>
          {totalCompanies} companies
        </span>
        <span className="text-[13px]" style={{ color: "#666" }}>
          ·
        </span>
        <span className="text-[13px]" style={{ color: "#aaa" }}>
          Tightest bottleneck:{" "}
          <span style={{ color: BOTTLENECK_COLORS[tightest.bottleneck.status] }}>
            {tightest.name}
          </span>
        </span>
      </div>

      <div className="flex-1 min-h-0" style={{ minHeight: 500 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={(_event, node) => {
            const target = _event.target as HTMLElement;
            if (target.closest('[data-stop-toggle]')) return;
            handleToggle(node.id);
          }}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          panOnDrag
          zoomOnScroll
          zoomOnPinch
          minZoom={0.3}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
        >
          <Background color="#333" gap={20} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}

export default function SupplyChain() {
  return (
    <ReactFlowProvider>
      <SupplyChainFlow />
    </ReactFlowProvider>
  );
}
