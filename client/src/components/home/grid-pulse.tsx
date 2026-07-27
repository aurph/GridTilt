/**
 * Animated transmission grid: the brand backdrop. An engineered line
 * network at low opacity with orange pulses traveling the runs. Abstract
 * on purpose: it represents what GridTilt covers without pretending to be
 * data. Static under prefers-reduced-motion.
 */
const RUNS = [
  "M-40,120 L320,120 L380,180 L760,180 L820,120 L1480,120",
  "M-40,320 L240,320 L300,260 L680,260 L740,320 L1480,320",
  "M-40,470 L420,470 L480,530 L900,530 L960,470 L1480,470",
  "M-40,650 L280,650 L340,590 L780,590 L840,650 L1480,650",
  "M-40,800 L500,800 L560,740 L1000,740 L1060,800 L1480,800",
  "M240,-40 L240,860",
  "M700,-40 L700,860",
  "M1160,-40 L1160,860",
];

const NODES: [number, number][] = [
  [240, 120], [700, 180], [1160, 120],
  [240, 320], [700, 260], [1160, 320],
  [240, 470], [700, 530], [1160, 470],
  [240, 650], [700, 590], [1160, 650],
];

export function GridPulse() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1440 860"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <g stroke="#262626" strokeWidth="1" fill="none">
        {RUNS.map((d, i) => (
          <path key={`b-${i}`} d={d} />
        ))}
      </g>
      <g className="gt-pulse-lines" stroke="#F07800" strokeWidth="1.5" fill="none">
        {RUNS.slice(0, 5).map((d, i) => (
          <path
            key={`p-${i}`}
            d={d}
            pathLength={1}
            className="gt-pulse-path"
            style={{ animationDelay: `${i * 1.7}s`, animationDuration: `${7 + i * 1.3}s` }}
          />
        ))}
      </g>
      <g fill="#F07800">
        {NODES.map(([x, y], i) => (
          <circle
            key={`n-${i}`}
            cx={x}
            cy={y}
            r="2.5"
            className="gt-pulse-node"
            style={{ animationDelay: `${(i % 6) * 0.9}s` }}
          />
        ))}
      </g>
    </svg>
  );
}
