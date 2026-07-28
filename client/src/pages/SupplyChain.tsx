import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import * as d3 from "d3";
import {
  Zap, Mountain, Cable, Server, X,
  Atom, Wrench, Hammer, Gem, Flame, Radiation, Gauge, Sun, FlaskConical,
  Plug, HardHat, Snowflake, ToggleRight, Building, Battery,
  Cloud, Warehouse, Cpu, Pickaxe, Workflow, GitBranch, Clock,
  MemoryStick, Network, Users, RotateCw,
} from "lucide-react";
import { AsOf } from "@/components/Freshness";
import { SiBitcoin } from "react-icons/si";
import { BRAND, FONT, INK, SURFACE, SEMANTIC, DATA_QUALITY, CHART_CHROME } from "@/lib/tokens";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
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
  MemoryStick, Network, Users,
  Bitcoin: SiBitcoin,
};

interface StockData {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  stale?: boolean;
}

type BottleneckStatus = 'Flowing' | 'Tightening' | 'Bottlenecked';

interface StageApiData {
  key: string;
  avgChange: number;
  stocks: StockData[];
  bottleneckStatus?: BottleneckStatus;
  bottleneckDetail?: string;
  keyMetric?: string;
}

interface StageMeta {
  status: BottleneckStatus;
  detail: string;
  keyMetric: string;
}

// Map server stage key (camelCase) to client stage id (kebab-case)
const STAGE_KEY_MAP: Record<string, string> = {
  rawMaterials: 'raw-materials',
  generation: 'generation',
  transmission: 'transmission',
  distribution: 'distribution',
  endUse: 'end-use',
};

const STATUS_COLOR: Record<BottleneckStatus, string> = {
  Flowing: SEMANTIC.positiveDeep,
  Tightening: SEMANTIC.warning,
  Bottlenecked: SEMANTIC.negativeDeep,
};

/** Stage names ship as uppercase literals in the config; display them in title case. */
const stageTitle = (name: string) =>
  name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

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
// Rendered viewBox height only: the sim lays nodes out in the 800-unit canvas
// but the converged layout leaves the bottom ~80 units as guide-only dead
// space, so the visible crop trims it. Sim, drag, and zoom math untouched.
const VIEW_H = 720;

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
  stageMeta,
}: {
  activeNode: string | null;
  onSelectNode: (id: string | null) => void;
  entrancePhase: number;
  stageMeta: Record<string, StageMeta>;
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

    // After convergence, push apart labels that overlap. Label box ≈ width
    // proportional to character count, height ~24px (name + sublabel).
    // We only nudge along y to preserve stage-column structure.
    const CHAR_PX = 5.5;
    const LABEL_H = 26;
    const labelBox = (n: SimNode) => {
      const r = getNodeRadius(n.id);
      const w = Math.max(60, n.name.length * CHAR_PX);
      return {
        left:  (n.x ?? 0) - w / 2,
        right: (n.x ?? 0) + w / 2,
        top:    (n.y ?? 0) + r + 4,
        bottom: (n.y ?? 0) + r + 4 + LABEL_H,
      };
    };
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = labelBox(nodes[i]);
          const b = labelBox(nodes[j]);
          const hOverlap = a.left < b.right && a.right > b.left;
          const vOverlap = a.top < b.bottom && a.bottom > b.top;
          if (hOverlap && vOverlap) {
            const dy = (a.top + a.bottom) / 2 < (b.top + b.bottom) / 2 ? -6 : 6;
            nodes[i].y = (nodes[i].y ?? 0) + dy;
            nodes[j].y = (nodes[j].y ?? 0) - dy;
          }
        }
      }
    }

    positionsReady.current = true;
    forceRender((v) => v + 1);

    return () => { simulation.stop(); };
  }, []);

  // Drag handlers attached to each node group via React refs. Mutates the
  // node position directly, then schedules a re-render via requestAnimationFrame
  // so pointer-move bursts collapse to at most one re-render per frame.
  // Works with both mouse and touch because pointer events normalize both.
  const dragState = useRef<{ id: string | null; dx: number; dy: number }>({ id: null, dx: 0, dy: 0 });
  const dragRaf = useRef<number | null>(null);

  useEffect(() => () => {
    if (dragRaf.current !== null) cancelAnimationFrame(dragRaf.current);
  }, []);

  const onNodePointerDown = (id: string, e: React.PointerEvent<SVGGElement>) => {
    e.stopPropagation();
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    const ctm = (e.currentTarget.ownerSVGElement)?.getScreenCTM()?.inverse();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm);
    dragState.current = { id, dx: pt.x - (node.x ?? 0), dy: pt.y - (node.y ?? 0) };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onNodePointerMove = (e: React.PointerEvent<SVGGElement>) => {
    const { id, dx, dy } = dragState.current;
    if (!id) return;
    const ctm = (e.currentTarget.ownerSVGElement)?.getScreenCTM()?.inverse();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm);
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    node.x = pt.x - dx;
    node.y = pt.y - dy;
    if (dragRaf.current === null) {
      dragRaf.current = requestAnimationFrame(() => {
        dragRaf.current = null;
        forceRender((v) => v + 1);
      });
    }
  };

  const onNodePointerUp = (e: React.PointerEvent<SVGGElement>) => {
    if (dragState.current.id) {
      dragState.current = { id: null, dx: 0, dy: 0 };
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    }
  };

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

  if (!positionsReady.current) {
    // Layout simulation hasn't converged yet: hold the graph box open with a
    // shimmer so the container doesn't flash from empty to full.
    return <Skeleton className="sc-graph-svg" style={{ cursor: "default" }} data-testid="sc-graph-skeleton" />;
  }

  const nodes = nodesRef.current;
  const links = linksRef.current;

  return (
    <svg
      ref={svgRef}
      className="sc-graph-svg"
      viewBox={`0 0 ${GRAPH_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      data-testid="sc-network-graph"
    >
      <g ref={gRef}>
        {/* Stage column guides: the sim pins each node's x to its stage
            (forceX strength 0.85), so horizontal position IS the supply
            chain stage. These faint verticals make that encoding explicit. */}
        {[0.1, 0.3, 0.5, 0.7, 0.9].map((fx, i) => (
          <line
            key={`guide-${i}`}
            x1={fx * GRAPH_W}
            x2={fx * GRAPH_W}
            y1={56}
            y2={GRAPH_H - 16}
            stroke={CHART_CHROME.grid}
            strokeDasharray="2 6"
          />
        ))}
        {STAGE_LABELS.map((s) => {
          const stageX = [0.1, 0.3, 0.5, 0.7, 0.9];
          const x = stageX[s.index] * GRAPH_W;
          const meta = stageMeta[s.id];
          const pillColor = meta ? STATUS_COLOR[meta.status] : null;
          const tip = meta
            ? `${meta.status}: ${meta.detail}${meta.keyMetric ? ` (${meta.keyMetric})` : ''}`
            : undefined;
          return (
            <g key={s.id} data-testid={`stage-label-${s.id}`}>
              <text
                x={x}
                y={24}
                textAnchor="middle"
                className="sc-stage-label"
                style={{ fontFamily: FONT.sans, letterSpacing: "0.02em" }}
              >
                {stageTitle(s.name)}
              </text>
              {meta && (
                <g transform={`translate(${x}, 40)`}>
                  {tip && <title>{tip}</title>}
                  <rect
                    x={-46}
                    y={-9}
                    width={92}
                    height={18}
                    rx={9}
                    fill={`${pillColor}1A`}
                    stroke={`${pillColor}66`}
                    strokeWidth={1}
                  />
                  <circle cx={-32} cy={0} r={3.5} fill={pillColor!} />
                  <text
                    x={-22}
                    y={4}
                    className="sc-stage-pill-text"
                    style={{ fontFamily: FONT.sans, letterSpacing: "0.02em" }}
                    fill={pillColor!}
                  >
                    {meta.status}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {[0.2, 0.4, 0.6, 0.8].map((frac) => (
          <line
            key={frac}
            x1={frac * GRAPH_W}
            y1={36}
            x2={frac * GRAPH_W}
            y2={GRAPH_H - 10}
            stroke={CHART_CHROME.grid}
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
          // resting edges were near-invisible at 0.1; keep the dim/highlight contrast but let the chain read
          const opacity = isDimmed ? 0.05 : isHighlighted ? 0.55 : 0.22;
          const width = isHighlighted ? 2.5 : isGSU ? 2 : 1.2;

          const delay = entrancePhase >= 2
            ? Math.min(src.stageIndex, tgt.stageIndex) * 0.08 + 0.3
            : 99;

          return (
            <path
              key={i}
              d={path}
              fill="none"
              stroke={`rgba(${hexToRgb(BRAND.primary)},${opacity})`}
              strokeWidth={width}
              className={entrancePhase >= 2 ? "sc-link-enter" : "sc-link-hidden"}
              style={{ animationDelay: `${delay}s` }}
              data-testid={`link-${i}`}
            />
          );
        })}

        {nodes.map((node) => {
          const color = STAGE_COLORS[node.stage] || BRAND.primary;
          const isActive = activeNode === node.id;
          const isConnected = connectedSet?.has(node.id);
          const isDimmed = connectedSet && !isConnected;

          const nodeOpacity = isDimmed ? 0.15 : 1;
          // idle nodes keep their stage hue at reduced intensity - the legend
          // promises stage colors, so resting nodes must not all read gray
          const strokeColor = isActive
            ? color
            : isConnected
              ? color
              : `rgba(${hexToRgb(color)},0.5)`;
          const strokeWidth = isActive ? 3 : isConnected ? 2 : 1.5;
          const fillColor = isActive
            ? `rgba(${hexToRgb(color)},0.12)`
            : SURFACE.raised;
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
              role="button"
              tabIndex={0}
              aria-label={node.name}
              style={{ opacity: nodeOpacity, cursor: dragState.current.id === node.id ? 'grabbing' : 'grab', transition: 'opacity 0.3s', touchAction: 'none' }}
              onClick={(e) => { e.stopPropagation(); if (!dragState.current.id) onSelectNode(isActive ? null : node.id); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!dragState.current.id) onSelectNode(isActive ? null : node.id);
                }
              }}
              onPointerDown={(e) => onNodePointerDown(node.id, e)}
              onPointerMove={onNodePointerMove}
              onPointerUp={onNodePointerUp}
              onPointerCancel={onNodePointerUp}
              className={`sc-node-focusable ${entrancePhase >= 1 ? "sc-node-enter" : "sc-node-hidden"}`}
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
                    color={isActive || isConnected ? color : `rgba(${hexToRgb(color)},0.75)`}
                    style={{ transition: 'color 0.25s' }}
                  />
                </div>
              </foreignObject>
              <text
                y={r + 14}
                textAnchor="middle"
                className="sc-node-label"
                style={{ fontFamily: FONT.sans }}
                fill={INK.primary}
              >
                {node.name}
              </text>
              <text
                y={r + 26}
                textAnchor="middle"
                className="sc-node-sublabel"
                fill={INK.faint}
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
                fill={`rgba(${hexToRgb(SURFACE.base)},0.9)`}
                stroke={`rgba(${hexToRgb(BRAND.primary)},0.15)`}
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

// ─── Flow view — alternate Sankey-style layered diagram ─────────────────────
// Columns per stage, nodes stacked vertically with height proportional to
// connection count, bezier bands connecting source nodes to target nodes.
// Click a node to focus its connections.

function FlowView({
  activeNode,
  onSelectNode,
}: {
  activeNode: string | null;
  onSelectNode: (id: string | null) => void;
}) {
  const W = 1200;
  const H = 700;
  const COL_PAD = 60;
  const NODE_W = 14;
  const NODE_GAP = 6;

  const layout = useMemo(() => {
    // Bucket nodes by stage
    const byStage: Record<number, SupplyNode[]> = {};
    supplyNodes.forEach((n) => {
      (byStage[n.stageIndex] = byStage[n.stageIndex] || []).push(n);
    });

    // Sort within each stage by connection count (heavier nodes toward middle
    // to reduce visual crossing of bands).
    Object.values(byStage).forEach((arr) => {
      arr.sort((a, b) => (connectionCounts[b.id] ?? 0) - (connectionCounts[a.id] ?? 0));
    });

    // Compute y-position for each node within its stage column.
    const positions: Record<string, { x: number; y: number; h: number }> = {};
    const stageX = [0.08, 0.28, 0.5, 0.72, 0.92];
    const totalUsableH = H - 100;

    for (let s = 0; s <= 4; s++) {
      const stageNodes = byStage[s] || [];
      const totalConn = stageNodes.reduce((sum, n) => sum + (connectionCounts[n.id] ?? 1), 0);
      const gapsTotal = (stageNodes.length - 1) * NODE_GAP;
      const heightForNodes = totalUsableH - gapsTotal;
      let cursor = 60;
      stageNodes.forEach((n) => {
        const share = (connectionCounts[n.id] ?? 1) / Math.max(totalConn, 1);
        const h = Math.max(18, share * heightForNodes);
        positions[n.id] = { x: stageX[s] * W - NODE_W / 2, y: cursor, h };
        cursor += h + NODE_GAP;
      });
    }

    return { positions, byStage };
  }, []);

  const connectedSet = useMemo(() => {
    if (!activeNode) return null;
    const s = new Set<string>();
    s.add(activeNode);
    supplyLinks.forEach((l) => {
      if (l.source === activeNode || l.target === activeNode) {
        s.add(l.source); s.add(l.target);
      }
    });
    return s;
  }, [activeNode]);

  return (
    <svg
      className="sc-graph-svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      data-testid="sc-flow-view"
    >
      {/* Stage labels */}
      {STAGE_LABELS.map((s) => {
        const stageX = [0.08, 0.28, 0.5, 0.72, 0.92];
        const x = stageX[s.index] * W;
        return (
          <text key={s.id} x={x} y={28} textAnchor="middle" className="sc-stage-label" style={{ fontFamily: FONT.sans, letterSpacing: "0.02em" }}>
            {stageTitle(s.name)}
          </text>
        );
      })}

      {/* Bands */}
      {supplyLinks.map((link, i) => {
        const src = layout.positions[link.source];
        const tgt = layout.positions[link.target];
        if (!src || !tgt) return null;
        const x1 = src.x + NODE_W;
        const x2 = tgt.x;
        const y1 = src.y + src.h / 2;
        const y2 = tgt.y + tgt.h / 2;
        const midX = (x1 + x2) / 2;
        const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
        const isHighlighted = connectedSet?.has(link.source) && connectedSet?.has(link.target);
        const isDimmed = connectedSet && !isHighlighted;
        const opacity = isDimmed ? 0.04 : isHighlighted ? 0.45 : 0.15;
        return (
          <path
            key={i}
            d={path}
            fill="none"
            stroke={BRAND.primary}
            strokeWidth={3}
            strokeOpacity={opacity}
            data-testid={`flow-link-${i}`}
          />
        );
      })}

      {/* Node rectangles */}
      {supplyNodes.map((node) => {
        const pos = layout.positions[node.id];
        if (!pos) return null;
        const color = STAGE_COLORS[node.stage] || BRAND.primary;
        const isActive = activeNode === node.id;
        const isConnected = connectedSet?.has(node.id);
        const isDimmed = connectedSet && !isConnected;
        const opacity = isDimmed ? 0.3 : 1;
        return (
          <g
            key={node.id}
            opacity={opacity}
            role="button"
            tabIndex={0}
            aria-label={node.name}
            className="sc-node-focusable"
            style={{ cursor: 'pointer', transition: 'opacity 0.25s' }}
            onClick={(e) => { e.stopPropagation(); onSelectNode(isActive ? null : node.id); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onSelectNode(isActive ? null : node.id);
              }
            }}
            data-testid={`flow-node-${node.id}`}
          >
            <rect
              x={pos.x}
              y={pos.y}
              width={NODE_W}
              height={pos.h}
              fill={color}
              stroke={isActive ? INK.primary : color}
              strokeWidth={isActive ? 2 : 0}
              rx={2}
            />
            <text
              x={pos.x + NODE_W + 6}
              y={pos.y + pos.h / 2 + 3}
              className="sc-node-label"
              fill={isActive || isConnected ? INK.primary : INK.muted}
              style={{ pointerEvents: 'none', fontFamily: FONT.sans }}
            >
              {node.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
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
  const stageColor = STAGE_COLORS[node.stage] || BRAND.primary;
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
            <span className="text-15 font-semibold text-ink">{node.name}</span>
            <span className="text-11 ml-2" style={{ color: INK.faint }}>
              {stageTitle(STAGE_LABELS.find((s) => s.id === node.stage)?.name ?? "")}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="text-ink-faint hover:text-ink transition-colors" data-testid="close-detail">
          <X style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {node.keyMetric && (
        <div className="sc-mono text-11 mb-2" style={{ color: stageColor }}>
          {node.keyMetric.label}: {node.keyMetric.value}
        </div>
      )}

      <div className="sc-divider mb-3" />

      <p className="text-xs leading-[1.6] mb-4" style={{ color: INK.muted }}>{node.description}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {upstreamNodes.length > 0 && (
          <div>
            <div className="text-[11px] font-medium mb-2" style={{ color: DATA_QUALITY.estimateFlag }}>Receives from</div>
            <div className="flex flex-wrap gap-1">
              {upstreamNodes.map((u, i) => (
                <span
                  key={i}
                  className="sc-flow-tag sc-flow-tag-clickable"
                  onClick={() => onSelectNode(u.id)}
                  data-testid={`upstream-${i}`}
                >
                  {u.name}
                  {u.label && <span className="text-ink-faint"> ({u.label})</span>}
                </span>
              ))}
            </div>
          </div>
        )}
        {downstreamNodes.length > 0 && (
          <div>
            <div className="text-[11px] font-medium mb-2" style={{ color: BRAND.secondary }}>Feeds into</div>
            <div className="flex flex-wrap gap-1">
              {downstreamNodes.map((d, i) => (
                <span
                  key={i}
                  className="sc-flow-tag sc-flow-tag-clickable"
                  onClick={() => onSelectNode(d.id)}
                  data-testid={`downstream-${i}`}
                >
                  {d.name}
                  {d.label && <span className="text-ink-faint"> ({d.label})</span>}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="text-[11px] font-medium text-muted-foreground mb-2">Securities</div>
      <div className="sc-stock-table">
        <div className="sc-stock-header" style={{ fontFamily: FONT.sans, letterSpacing: "normal", fontSize: 10 }}>
          <span className="sc-stock-col-ticker">Ticker</span>
          <span className="sc-stock-col-name">Name</span>
          <span className="sc-stock-col-price">Price</span>
          <span className="sc-stock-col-chg">Chg %</span>
        </div>
        {node.companies.map((c) => {
          const stock = stockMap[c.ticker];
          const chg = stock?.changePercent;
          const price = stock?.price;
          const hasLiveChg = typeof chg === "number" && Number.isFinite(chg);
          const chgColor = !hasLiveChg
            ? "text-ink-faint"
            : chg! >= 0
              ? "text-positive"
              : "text-negative";
          return (
            <div
              key={c.ticker}
              className="sc-stock-row"
              onClick={() => onNavigate(`/stock/${c.ticker}`)}
              data-testid={`company-${c.ticker}`}
            >
              <span className="sc-stock-col-ticker sc-mono font-bold text-ink">{c.ticker}</span>
              <span className="sc-stock-col-name text-ink-faint truncate">{c.name}</span>
              <span className="sc-stock-col-price sc-mono text-ink-muted">{price ? `$${price.toFixed(2)}` : "--"}</span>
              <span className={`sc-stock-col-chg sc-mono font-medium ${chgColor} inline-flex items-center justify-end gap-1`}>
                {hasLiveChg ? `${chg! >= 0 ? "+" : ""}${chg!.toFixed(2)}%` : "--"}
                {stock?.stale && (
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="inline-flex items-center"
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`stale-indicator-${c.ticker}`}
                      >
                        <Clock className="h-3 w-3 text-brand-2/70" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="text-xs max-w-[220px]">
                      Live quote temporarily unavailable, retrying
                    </TooltipContent>
                  </UITooltip>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SupplyChain({ embedded = false }: { embedded?: boolean; params?: unknown }) {
  const [, navigate] = useLocation();
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"network" | "flow">(() => {
    try {
      const v = localStorage.getItem("gridtilt_sc_view");
      return v === "flow" ? "flow" : "network";
    } catch { return "network"; }
  });
  const setView = (m: "network" | "flow") => {
    setViewMode(m);
    try { localStorage.setItem("gridtilt_sc_view", m); } catch {}
  };
  const [entrancePhase, setEntrancePhase] = useState(0);

  const { data: apiData, isError, refetch, dataUpdatedAt } = useQuery<{ stages: StageApiData[] }>({
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

  const stageMeta = useMemo(() => {
    const m: Record<string, StageMeta> = {};
    apiData?.stages?.forEach((stage) => {
      const clientId = STAGE_KEY_MAP[stage.key];
      if (clientId && stage.bottleneckStatus) {
        m[clientId] = {
          status: stage.bottleneckStatus,
          detail: stage.bottleneckDetail ?? '',
          keyMetric: stage.keyMetric ?? '',
        };
      }
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
    // Embedded (Equities flow view): the host owns page scroll/padding.
    <div className={embedded ? "sc-page sc-page-embedded" : "sc-page"} data-testid="supply-chain-page" onClick={() => setActiveNode(null)}>
      <div className="sc-topbar" data-testid="sc-summary-bar">
        <div className="sc-topbar-left">
          <span className="text-13 font-semibold" style={{ color: BRAND.primary }}>Supply Chain</span>
          <span className="sc-topbar-sep">|</span>
          <span className="text-11 text-ink">AI Power Infrastructure</span>
        </div>
        <div className="sc-topbar-right">
          <span className="text-10" style={{ color: INK.faint }}>Nodes</span>
          <span className="sc-mono text-11 text-ink">{supplyNodes.length}</span>
          <span className="sc-topbar-sep">|</span>
          <span className="text-10" style={{ color: INK.faint }}>Connections</span>
          <span className="sc-mono text-11 text-ink">{supplyLinks.length}</span>
          <span className="sc-topbar-sep">|</span>
          <span className="text-10" style={{ color: INK.faint }}>Securities</span>
          <span className="sc-mono text-11 text-ink">{totalCompanies}</span>
          <span className="sc-topbar-sep">|</span>
          {isError ? (
            <button
              onClick={(e) => { e.stopPropagation(); refetch(); }}
              className="inline-flex items-center gap-1.5 rounded-sm border border-negative/40 bg-negative/10 px-1.5 py-0.5 text-10 text-negative hover:border-negative/70 transition-colors"
              title="Live quotes and bottleneck statuses failed to load - the chain diagram itself is unaffected. Click to retry."
              data-testid="sc-quotes-retry"
            >
              <RotateCw className="h-2.5 w-2.5" />
              quotes offline · retry
            </button>
          ) : (
            <AsOf updatedAt={dataUpdatedAt} intervalMs={5 * 60 * 1000} />
          )}
          <span className="sc-topbar-sep">|</span>
          <div className="sc-view-toggle" data-testid="sc-view-toggle" onClick={(e) => e.stopPropagation()}>
            <button
              className={`sc-view-btn ${viewMode === "network" ? "sc-view-btn-active" : ""}`}
              onClick={() => setView("network")}
              data-testid="view-network"
            >network</button>
            <button
              className={`sc-view-btn ${viewMode === "flow" ? "sc-view-btn-active" : ""}`}
              onClick={() => setView("flow")}
              data-testid="view-flow"
            >flow</button>
          </div>
        </div>
      </div>

      <div className="sc-graph-container" onClick={(e) => e.stopPropagation()}>
        {viewMode === "network" ? (
          <NetworkGraph
            activeNode={activeNode}
            onSelectNode={setActiveNode}
            entrancePhase={entrancePhase}
            stageMeta={stageMeta}
          />
        ) : (
          <FlowView
            activeNode={activeNode}
            onSelectNode={setActiveNode}
          />
        )}
      </div>

      <div className="sc-legend" style={{ fontFamily: FONT.sans }} data-testid="sc-legend" onClick={(e) => e.stopPropagation()}>
        {STAGE_LABELS.map((s) => (
          <span key={s.id}>
            <span className="sc-legend-swatch" style={{ background: STAGE_COLORS[s.id] }} />
            {stageTitle(s.name)}
          </span>
        ))}
        <span className="sc-legend-hint">x = supply chain stage · node size = connection count · click a node to explore. scroll to zoom. double-click to reset.</span>
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
