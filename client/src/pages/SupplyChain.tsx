import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import * as d3 from "d3";
import {
  Zap, Mountain, Cable, Server, X,
  Atom, Wrench, Hammer, Gem, Flame, Radiation, Gauge, Sun, FlaskConical,
  Plug, HardHat, Snowflake, ToggleRight, Building, Battery,
  Cloud, Warehouse, Cpu, Pickaxe, Workflow, GitBranch,
} from "lucide-react";
import {
  supplyNodes,
  supplyLinks,
  STAGE_COLORS,
  STAGE_LABELS,
  type SupplyNode,
  type SupplyLink,
} from "@/data/supply-chain-config";

const ICON_MAP: Record<string, any> = {
  Mountain, Zap, Cable, Server, GitBranch,
  Atom, Wrench, Hammer, Gem, Flame, Radiation, Gauge, Sun, FlaskConical,
  Plug, HardHat, Snowflake, ToggleRight, Building, Battery,
  Cloud, Warehouse, Cpu, Pickaxe, Workflow,
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

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  stage: string;
  stageIndex: number;
  icon: string;
  companies: { ticker: string; name: string }[];
  description: string;
  keyMetric?: { value: string; label: string };
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  label?: string;
}

const GRAPH_W = 1200;
const GRAPH_H = 800;

const connectionCounts: Record<string, number> = {};
supplyLinks.forEach((l) => {
  connectionCounts[l.source] = (connectionCounts[l.source] || 0) + 1;
  connectionCounts[l.target] = (connectionCounts[l.target] || 0) + 1;
});

function getNodeRadius(nodeId: string): number {
  const count = connectionCounts[nodeId] || 2;
  return Math.min(42, Math.max(28, 24 + count * 1.5));
}

function NetworkGraph({
  activeNode,
  onSelectNode,
  entrancePhase,
}: {
  activeNode: string | null;
  onSelectNode: (id: string | null) => void;
  entrancePhase: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const positionsReady = useRef(false);
  const [, forceRender] = useState(0);

  const connectedSet = useMemo(() => {
    if (!activeNode) return null;
    const s = new Set<string>();
    s.add(activeNode);
    supplyLinks.forEach((l) => {
      if (l.source === activeNode || l.target === activeNode) {
        s.add(l.source);
        s.add(l.target);
      }
    });
    return s;
  }, [activeNode]);

  const connectedLinkSet = useMemo(() => {
    if (!activeNode) return null;
    const s = new Set<number>();
    supplyLinks.forEach((l, i) => {
      if (l.source === activeNode || l.target === activeNode) s.add(i);
    });
    return s;
  }, [activeNode]);

  useEffect(() => {
    const nodes: SimNode[] = supplyNodes.map((n) => ({
      ...n,
      x: undefined as unknown as number,
      y: undefined as unknown as number,
    }));
    const links: SimLink[] = supplyLinks.map((l) => ({
      source: l.source,
      target: l.target,
      label: l.label,
    }));

    nodesRef.current = nodes;
    linksRef.current = links;

    const stageX = [0.1, 0.3, 0.5, 0.7, 0.9];

    const simulation = d3.forceSimulation<SimNode>(nodes)
      .force('x', d3.forceX<SimNode>((d) => stageX[d.stageIndex] * GRAPH_W).strength(0.85))
      .force('y', d3.forceY<SimNode>(GRAPH_H / 2).strength(0.05))
      .force('collide', d3.forceCollide<SimNode>((d) => getNodeRadius(d.id) + 32))
      .force('link', d3.forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(140).strength(0.25))
      .force('charge', d3.forceManyBody<SimNode>().strength(-250))
      .stop();

    for (let i = 0; i < 350; i++) simulation.tick();

    positionsReady.current = true;
    forceRender((v) => v + 1);

    return () => { simulation.stop(); };
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 3])
      .on('zoom', (event) => {
        if (gRef.current) {
          gRef.current.setAttribute('transform', event.transform.toString());
        }
      });

    d3.select(svg).call(zoom);

    d3.select(svg).on('dblclick.zoom', () => {
      d3.select(svg).transition().duration(500).call(zoom.transform, d3.zoomIdentity);
    });

    return () => { d3.select(svg).on('.zoom', null); };
  }, []);

  if (!positionsReady.current) return null;

  const nodes = nodesRef.current;
  const links = linksRef.current;

  return (
    <svg
      ref={svgRef}
      className="sc-graph-svg"
      viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
      preserveAspectRatio="xMidYMid meet"
      data-testid="sc-network-graph"
    >
      <g ref={gRef}>
        {STAGE_LABELS.map((s) => {
          const stageX = [0.1, 0.3, 0.5, 0.7, 0.9];
          return (
            <text
              key={s.id}
              x={stageX[s.index] * GRAPH_W}
              y={24}
              textAnchor="middle"
              className="sc-stage-label"
              data-testid={`stage-label-${s.id}`}
            >
              {s.name}
            </text>
          );
        })}

        {[0.2, 0.4, 0.6, 0.8].map((frac) => (
          <line
            key={frac}
            x1={frac * GRAPH_W}
            y1={36}
            x2={frac * GRAPH_W}
            y2={GRAPH_H - 10}
            stroke="rgba(255,255,255,0.03)"
            strokeWidth={1}
          />
        ))}

        {links.map((link, i) => {
          const src = link.source as SimNode;
          const tgt = link.target as SimNode;
          if (!src.x || !tgt.x) return null;

          const isHighlighted = connectedLinkSet?.has(i);
          const isDimmed = connectedLinkSet && !isHighlighted;

          const midX = (src.x + tgt.x) / 2;
          const path = `M ${src.x} ${src.y} C ${midX} ${src.y}, ${midX} ${tgt.y}, ${tgt.x} ${tgt.y}`;

          const isGSU = link.label === 'GSU';
          const opacity = isDimmed ? 0.03 : isHighlighted ? 0.5 : 0.1;
          const width = isHighlighted ? 2.5 : isGSU ? 2 : 1.2;

          const delay = entrancePhase >= 2
            ? Math.min(src.stageIndex, tgt.stageIndex) * 0.08 + 0.3
            : 99;

          return (
            <path
              key={i}
              d={path}
              fill="none"
              stroke={`rgba(240,120,0,${opacity})`}
              strokeWidth={width}
              className={entrancePhase >= 2 ? "sc-link-enter" : "sc-link-hidden"}
              style={{ animationDelay: `${delay}s` }}
              data-testid={`link-${i}`}
            />
          );
        })}

        {nodes.map((node) => {
          const color = STAGE_COLORS[node.stage] || '#F07800';
          const isActive = activeNode === node.id;
          const isConnected = connectedSet?.has(node.id);
          const isDimmed = connectedSet && !isConnected;

          const nodeOpacity = isDimmed ? 0.15 : 1;
          const strokeColor = isActive
            ? color
            : isConnected
              ? color
              : 'rgba(240,120,0,0.15)';
          const strokeWidth = isActive ? 3 : isConnected ? 2 : 1.5;
          const fillColor = isActive
            ? `rgba(${hexToRgb(color)},0.12)`
            : '#1C1B18';
          const filterVal = isActive
            ? `drop-shadow(0 0 12px ${color})`
            : isConnected
              ? `drop-shadow(0 0 6px ${color})`
              : 'none';

          const enterDelay = entrancePhase >= 1
            ? node.stageIndex * 0.1
            : 99;

          const IconComp = ICON_MAP[node.icon] || Zap;
          const r = getNodeRadius(node.id);
          const iconSize = Math.round(r * 0.5);

          return (
            <g
              key={node.id}
              transform={`translate(${node.x},${node.y})`}
              style={{ opacity: nodeOpacity, cursor: 'pointer', transition: 'opacity 0.3s' }}
              onClick={(e) => { e.stopPropagation(); onSelectNode(isActive ? null : node.id); }}
              className={entrancePhase >= 1 ? "sc-node-enter" : "sc-node-hidden"}
              data-testid={`node-${node.id}`}
            >
              <circle
                r={r}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                style={{ filter: filterVal, transition: 'all 0.25s ease', animationDelay: `${enterDelay}s` }}
              />
              <foreignObject x={-iconSize / 2} y={-iconSize / 2} width={iconSize} height={iconSize} style={{ overflow: 'visible' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: iconSize, height: iconSize }}>
                  <IconComp
                    size={iconSize}
                    strokeWidth={2}
                    color={isActive || isConnected ? color : '#888'}
                    style={{ transition: 'color 0.25s' }}
                  />
                </div>
              </foreignObject>
              <text
                y={r + 14}
                textAnchor="middle"
                className="sc-node-label"
                fill="white"
              >
                {node.name}
              </text>
              <text
                y={r + 26}
                textAnchor="middle"
                className="sc-node-sublabel"
                fill="#666"
              >
                {node.companies.length} co.
              </text>
            </g>
          );
        })}

        {activeNode && links.map((link, i) => {
          if (!connectedLinkSet?.has(i)) return null;
          const src = link.source as SimNode;
          const tgt = link.target as SimNode;
          if (!src.x || !tgt.x || !link.label) return null;

          const mx = (src.x + tgt.x) / 2;
          const my = (src.y! + tgt.y!) / 2;

          return (
            <g key={`label-${i}`} transform={`translate(${mx},${my})`}>
              <rect
                x={-link.label.length * 3.2 - 6}
                y={-8}
                width={link.label.length * 6.4 + 12}
                height={16}
                rx={3}
                fill="rgba(14,14,12,0.9)"
                stroke="rgba(240,120,0,0.15)"
                strokeWidth={0.5}
              />
              <text
                textAnchor="middle"
                dy={4}
                className="sc-link-label"
              >
                {link.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

function DetailPanel({
  node,
  stockMap,
  onClose,
  onNavigate,
  onSelectNode,
}: {
  node: SupplyNode;
  stockMap: Record<string, StockData>;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onSelectNode: (id: string) => void;
}) {
  const stageColor = STAGE_COLORS[node.stage] || '#F07800';
  const Icon = ICON_MAP[node.icon] || Zap;

  const upstreamLinks = supplyLinks.filter((l) => l.target === node.id);
  const downstreamLinks = supplyLinks.filter((l) => l.source === node.id);

  const upstreamNodes = upstreamLinks.map((l) => {
    const n = supplyNodes.find((sn) => sn.id === l.source);
    return { id: l.source, name: n?.name || l.source, label: l.label };
  });
  const downstreamNodes = downstreamLinks.map((l) => {
    const n = supplyNodes.find((sn) => sn.id === l.target);
    return { id: l.target, name: n?.name || l.target, label: l.label };
  });

  return (
    <div className="sc-detail-panel" data-testid={`detail-${node.id}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <Icon style={{ width: 18, height: 18, color: stageColor }} />
          <div>
            <span className="sc-mono text-[15px] font-bold text-white">{node.name}</span>
            <span className="text-[11px] ml-2 uppercase" style={{ color: '#555' }}>
              {STAGE_LABELS.find((s) => s.id === node.stage)?.name}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="text-[#555] hover:text-white transition-colors" data-testid="close-detail">
          <X style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {node.keyMetric && (
        <div className="sc-mono text-[11px] mb-2" style={{ color: stageColor }}>
          {node.keyMetric.label}: {node.keyMetric.value}
        </div>
      )}

      <div className="sc-divider mb-3" />

      <p className="text-[12px] leading-[1.6] mb-4" style={{ color: '#999' }}>{node.description}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {upstreamNodes.length > 0 && (
          <div>
            <div className="sc-section-label" style={{ color: '#D4A843' }}>RECEIVES FROM</div>
            <div className="flex flex-wrap gap-1">
              {upstreamNodes.map((u, i) => (
                <span
                  key={i}
                  className="sc-flow-tag sc-flow-tag-clickable"
                  onClick={() => onSelectNode(u.id)}
                  data-testid={`upstream-${i}`}
                >
                  {u.name}
                  {u.label && <span className="text-[#555]"> ({u.label})</span>}
                </span>
              ))}
            </div>
          </div>
        )}
        {downstreamNodes.length > 0 && (
          <div>
            <div className="sc-section-label" style={{ color: '#F0A500' }}>FEEDS INTO</div>
            <div className="flex flex-wrap gap-1">
              {downstreamNodes.map((d, i) => (
                <span
                  key={i}
                  className="sc-flow-tag sc-flow-tag-clickable"
                  onClick={() => onSelectNode(d.id)}
                  data-testid={`downstream-${i}`}
                >
                  {d.name}
                  {d.label && <span className="text-[#555]"> ({d.label})</span>}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="sc-section-label">SECURITIES</div>
      <div className="sc-stock-table">
        <div className="sc-stock-header">
          <span className="sc-stock-col-ticker">TICKER</span>
          <span className="sc-stock-col-name">NAME</span>
          <span className="sc-stock-col-price">PRICE</span>
          <span className="sc-stock-col-chg">CHG%</span>
        </div>
        {node.companies.map((c) => {
          const stock = stockMap[c.ticker];
          const chg = stock?.changePercent;
          const price = stock?.price;
          const hasLiveChg = typeof chg === "number" && Number.isFinite(chg);
          const chgColor = !hasLiveChg
            ? "text-[#555]"
            : chg! >= 0
              ? "text-[#22C55E]"
              : "text-[#EF4444]";
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
              <span className={`sc-stock-col-chg sc-mono font-medium ${chgColor}`}>
                {hasLiveChg ? `${chg! >= 0 ? "+" : ""}${chg!.toFixed(2)}%` : "--"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SupplyChain() {
  const [, navigate] = useLocation();
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [entrancePhase, setEntrancePhase] = useState(0);

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

  const totalCompanies = useMemo(() => {
    const all = new Set<string>();
    supplyNodes.forEach((n) => n.companies.forEach((c) => all.add(c.ticker)));
    return all.size;
  }, []);

  useEffect(() => {
    const t1 = setTimeout(() => setEntrancePhase(1), 100);
    const t2 = setTimeout(() => setEntrancePhase(2), 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const activeNodeData = activeNode ? supplyNodes.find((n) => n.id === activeNode) : null;

  return (
    <div className="sc-page" data-testid="supply-chain-page" onClick={() => setActiveNode(null)}>
      <div className="sc-topbar" data-testid="sc-summary-bar">
        <div className="sc-topbar-left">
          <span className="sc-mono text-[13px] font-bold" style={{ color: "#F07800" }}>SUPPLY CHAIN</span>
          <span className="sc-topbar-sep">|</span>
          <span className="sc-mono text-[11px] text-white">AI Power Infrastructure</span>
        </div>
        <div className="sc-topbar-right">
          <span className="sc-mono text-[10px]" style={{ color: "#555" }}>NODES</span>
          <span className="sc-mono text-[11px] text-white">{supplyNodes.length}</span>
          <span className="sc-topbar-sep">|</span>
          <span className="sc-mono text-[10px]" style={{ color: "#555" }}>CONNECTIONS</span>
          <span className="sc-mono text-[11px] text-white">{supplyLinks.length}</span>
          <span className="sc-topbar-sep">|</span>
          <span className="sc-mono text-[10px]" style={{ color: "#555" }}>SECURITIES</span>
          <span className="sc-mono text-[11px] text-white">{totalCompanies}</span>
        </div>
      </div>

      <div className="sc-graph-container" onClick={(e) => e.stopPropagation()}>
        <NetworkGraph
          activeNode={activeNode}
          onSelectNode={setActiveNode}
          entrancePhase={entrancePhase}
        />
        <div className="sc-graph-hint">
          <span className="text-[10px]" style={{ color: '#444' }}>Scroll to zoom. Drag to pan. Double-click to reset. Click a node to explore.</span>
        </div>
      </div>

      {activeNodeData && (
        <div onClick={(e) => e.stopPropagation()}>
          <DetailPanel
            node={activeNodeData}
            stockMap={stockMap}
            onClose={() => setActiveNode(null)}
            onNavigate={navigate}
            onSelectNode={setActiveNode}
          />
        </div>
      )}
    </div>
  );
}
