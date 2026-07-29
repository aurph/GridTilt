import { Link } from "wouter";
import type { ReactNode } from "react";

const HORIZ_PAD = "clamp(24px, 5vw, 96px)";

const MUTED = "#5A5854";
const ACCENT = "#F07800";

interface Module {
  number: string;
  name: string;
  caption: string;
  cta: string;
  diagram: ReactNode;
  route: string;
}

const MODULES: Module[] = [
  {
    number: "01",
    name: "Equities",
    caption: "One hundred public companies behind the buildout, priced live.",
    cta: "Open the stack",
    diagram: <StackDiagram />,
    route: "/stack",
  },
  {
    number: "02",
    name: "Power Map",
    caption: "Thirty-three tracked facilities, plotted by operator and grid region.",
    cta: "Open the map",
    diagram: <PowerMapDiagram />,
    route: "/power-map",
  },
  {
    number: "03",
    name: "Supply Chain Flow",
    caption: "Where the buildout can get stuck, mapped to the companies exposed. A view inside Equities.",
    cta: "Trace the chain",
    diagram: <SupplyChainDiagram />,
    route: "/stack?view=flow",
  },
  {
    number: "04",
    name: "Catalyst Tracker",
    caption: "Earnings dates, rule changes, and policy votes. One calendar.",
    cta: "See what's next",
    diagram: <CatalystDiagram />,
    route: "/catalysts",
  },
  {
    number: "05",
    name: "Analyze: Portfolio",
    caption: "Type a ticker. See how exposed it is to the power story.",
    cta: "Score a ticker",
    diagram: <OverlayDiagram />,
    route: "/analyze?tab=portfolio",
  },
  {
    number: "06",
    name: "Analyze: Scenario",
    caption: "Pick how fast demand grows. See what it does to the grid by 2030.",
    cta: "Run a scenario",
    diagram: <CalculatorDiagram />,
    route: "/analyze?tab=scenario",
  },
];

export function FeaturesShowcase() {
  return (
    <section
      id="stack"
      style={{
        position: "relative",
        paddingTop: "clamp(96px, 14vh, 160px)",
        paddingBottom: "clamp(96px, 14vh, 160px)",
      }}
      data-testid="home-features"
    >
      <div className="gt-rule-top" style={{ position: "absolute", top: 0, left: 0, right: 0 }} />
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          paddingLeft: HORIZ_PAD,
          paddingRight: HORIZ_PAD,
        }}
      >
        <div style={{ marginBottom: "clamp(56px, 9vh, 88px)", maxWidth: 900 }}>
          <h2 className="gt-section-heading" style={{ marginBottom: 24 }}>
            Six places to start.
          </h2>
          <p className="gt-section-dek">
            Each shows a different slice of the buildout. Pick the one closest to what you already follow.
          </p>
        </div>

        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          style={{ gap: "clamp(14px, 1.6vw, 22px)" }}
        >
          {MODULES.map((m) => (
            <Link
              key={m.number}
              href={m.route}
              className="gt-feature-card"
              data-testid={`feature-card-${m.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            >
              <div className="gt-feature-card__num">
                <span>{m.number}</span>
              </div>
              <h3 className="gt-feature-card__title">{m.name}</h3>
              <p className="gt-feature-card__caption">{m.caption}</p>
              <div className="gt-feature-card__preview">{m.diagram}</div>
              <span className="gt-feature-card__cta">
                <span>{m.cta}</span>
                <span aria-hidden>→</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Inline diagrams ─────────────────────────── */

const SVG_STYLE: React.CSSProperties = { width: "100%", height: "100%", display: "block" };

/** 01 — Equities. Stacked horizontal bars of varying width. One highlighted. */
function StackDiagram() {
  const bars = [
    { w: 138, accent: false },
    { w: 116, accent: false },
    { w: 96,  accent: true  },
    { w: 132, accent: false },
    { w: 80,  accent: false },
    { w: 108, accent: false },
    { w: 70,  accent: false },
    { w: 100, accent: false },
    { w: 86,  accent: false },
  ];
  return (
    <svg viewBox="0 0 160 90" style={SVG_STYLE} aria-hidden>
      {bars.map((b, i) => (
        <rect
          key={i}
          x={11}
          y={5 + i * 9}
          width={b.w}
          height={4}
          fill={b.accent ? ACCENT : MUTED}
          opacity={b.accent ? 1 : 0.55}
          rx={0.5}
        />
      ))}
    </svg>
  );
}

/** 02 — Power Map. Simplified US outline + orange dots at real-ish DC clusters. */
function PowerMapDiagram() {
  const dots = [
    { x: 32,  y: 50 },
    { x: 50,  y: 38 },
    { x: 70,  y: 56 },
    { x: 80,  y: 30 },
    { x: 95,  y: 38 },
    { x: 108, y: 52 },
    { x: 118, y: 36 },
    { x: 132, y: 30 },
  ];
  return (
    <svg viewBox="0 0 160 90" style={SVG_STYLE} aria-hidden>
      <path
        d="M 14 38 L 16 30 L 28 24 L 50 20 L 75 24 L 100 19 L 128 22 L 146 32 L 144 50 L 138 62 L 122 70 L 108 72 L 80 70 L 50 72 L 28 64 L 16 52 Z"
        stroke={MUTED}
        strokeWidth="0.8"
        fill="none"
        opacity={0.7}
      />
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={2.2} fill={ACCENT} />
      ))}
      <circle cx={118} cy={36} r={5} fill="none" stroke={ACCENT} strokeWidth="0.7" opacity={0.5} />
      <circle cx={70}  cy={56} r={5} fill="none" stroke={ACCENT} strokeWidth="0.7" opacity={0.5} />
    </svg>
  );
}

/** 03 — Supply Chain. Linear chain of nodes. Middle one is the bottleneck. */
function SupplyChainDiagram() {
  const nodes = [16, 36, 56, 76, 96, 116, 136];
  const bottleneckIdx = 3;
  return (
    <svg viewBox="0 0 160 90" style={SVG_STYLE} aria-hidden>
      <line x1={16} y1={45} x2={136} y2={45} stroke={MUTED} strokeWidth="0.8" opacity={0.7} />
      {nodes.map((x, i) => {
        const isAccent = i === bottleneckIdx;
        return (
          <g key={i}>
            <rect
              x={x - 4.5}
              y={40.5}
              width={9}
              height={9}
              fill={isAccent ? ACCENT : "#0B0B0A"}
              stroke={isAccent ? ACCENT : MUTED}
              strokeWidth="1"
            />
          </g>
        );
      })}
      <rect
        x={nodes[bottleneckIdx] - 8}
        y={37}
        width={16}
        height={16}
        fill="none"
        stroke={ACCENT}
        strokeWidth="0.6"
        opacity={0.5}
      />
      <text
        x={nodes[bottleneckIdx]}
        y={66}
        textAnchor="middle"
        fontFamily="JetBrains Mono, monospace"
        fontSize="6"
        fontWeight={500}
        fill={ACCENT}
        letterSpacing="0.06em"
      >
        bottleneck
      </text>
    </svg>
  );
}

/** 04 — Catalyst Tracker. 5×7 calendar grid with marked days. */
function CatalystDiagram() {
  const cols = 7;
  const rows = 5;
  const marks = new Set(["0-3", "1-5", "2-1", "3-6", "4-2"]);
  const w = 14;
  const h = 9;
  const gap = 2;
  const totalW = cols * w + (cols - 1) * gap;
  const startX = (160 - totalW) / 2;
  return (
    <svg viewBox="0 0 160 90" style={SVG_STYLE} aria-hidden>
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => {
          const key = `${r}-${c}`;
          const isMarked = marks.has(key);
          return (
            <rect
              key={key}
              x={startX + c * (w + gap)}
              y={12 + r * (h + gap)}
              width={w}
              height={h}
              fill={isMarked ? ACCENT : "#0B0B0A"}
              stroke={isMarked ? ACCENT : MUTED}
              strokeWidth="0.7"
              opacity={isMarked ? 1 : 0.7}
            />
          );
        })
      )}
    </svg>
  );
}

/** 05 — Portfolio Overlay. Semi-circle gauge with a numeric score. */
function OverlayDiagram() {
  const cx = 80;
  const cy = 60;
  const r = 32;
  // Needle at 130° (sweeping from 180° at left to 0° at right; higher angle = further left)
  const angle = (135 * Math.PI) / 180;
  const needleX = cx + r * Math.cos(angle);
  const needleY = cy - r * Math.sin(angle);
  return (
    <svg viewBox="0 0 160 90" style={SVG_STYLE} aria-hidden>
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        stroke={MUTED}
        strokeWidth="2"
        fill="none"
        opacity={0.5}
      />
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${needleX} ${needleY}`}
        stroke={ACCENT}
        strokeWidth="2"
        fill="none"
      />
      <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={ACCENT} strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={2.5} fill={ACCENT} />
      <text
        x={cx}
        y={cy + 18}
        textAnchor="middle"
        fontFamily="JetBrains Mono, monospace"
        fontSize="11"
        fontWeight={700}
        fill="#F2F1ED"
        letterSpacing="0.04em"
      >
        7.3
      </text>
      <text
        x={cx}
        y={cy + 26}
        textAnchor="middle"
        fontFamily="JetBrains Mono, monospace"
        fontSize="4.5"
        fontWeight={500}
        fill={MUTED}
        letterSpacing="0.16em"
      >
        EXPOSURE
      </text>
    </svg>
  );
}

/** 06 — Scenario Calculator. Trending chart with historical to projected hand-off. */
function CalculatorDiagram() {
  return (
    <svg viewBox="0 0 160 90" style={SVG_STYLE} aria-hidden>
      <line x1={10} y1={76} x2={150} y2={76} stroke={MUTED} strokeWidth="0.6" opacity={0.55} />
      <path
        d="M 12 66 L 32 64 L 52 61 L 72 57 L 92 50"
        stroke={MUTED}
        strokeWidth="1.5"
        fill="none"
        opacity={0.85}
      />
      <path
        d="M 92 50 L 110 38 L 130 24 L 150 10"
        stroke={ACCENT}
        strokeWidth="1.5"
        strokeDasharray="3 2"
        fill="none"
      />
      <circle cx={92}  cy={50} r={1.6} fill={MUTED} />
      <circle cx={150} cy={10} r={2}   fill={ACCENT} />
      <line x1={92} y1={15} x2={92} y2={80} stroke={MUTED} strokeWidth="0.4" strokeDasharray="1 2" opacity={0.7} />
      <text
        x={92}
        y={12}
        textAnchor="middle"
        fontFamily="JetBrains Mono, monospace"
        fontSize="5"
        fontWeight={500}
        fill={MUTED}
        letterSpacing="0.16em"
      >
        TODAY
      </text>
    </svg>
  );
}
