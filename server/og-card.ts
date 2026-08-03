// ─── Social / OG card rendering ────────────────────────────────────────────
//
// One shared frame for every card the daily poster and /api/og produce:
//
//   ┌──────────────────────────────────────────────────────────┐
//   │ ▌GRIDTILT                                AS OF 26 JUN 2026│  header rule
//   │ title                                     ┌──────────────┐│
//   │ subtitle                                  │              ││
//   │                                           │   visual     ││
//   │ STAT   STAT   STAT                        └──────────────┘│
//   │ source line                                   gridtilt.com│  footer rule
//   └──────────────────────────────────────────────────────────┘
//
// The as-of date and the source line are permanent furniture, not decoration.
// GridTilt's claim is "tracked with sourced numbers"; a card that shows a
// number without saying when it was measured or where it came from does not
// support that claim. Callers must supply both.
//
// Layout notes learned the hard way (see server/__tests__/og-card.test.ts):
//   - satori cannot synthesize weights. Every face used here is registered
//     below as a real file. Asking for fontWeight 700 without registering a
//     bold face silently renders regular, which is what the old card did.
//   - satori truncates large inline SVG markup. The US outline must stay ONE
//     concatenated path (see scripts/generate-map-path.mjs); splitting it into
//     per-state <path> elements exceeded the limit and rendered a partial map
//     with no error. assertMapPathIntact() guards against a regression.

import { readFileSync } from "fs";
import { join } from "path";
import { MAP_W, MAP_H, ALBERS, US_PATH } from "./us-map.js";

// ─── Tokens (mirror client/src/lib/tokens.ts) ──────────────────────────────

const BRAND = "#F07800";
const AMBER = "#F0A500";
const BG = "#121110";
const PANEL = "#1b1a18";
const HAIRLINE = "#2b2926";
const STATE_STROKE = "#45423c";
const MUTED = "#6b7280";
const SUBTLE = "#9ca3af";

const CARD_W = 1200;
const CARD_H = 630;

// ─── Public types ──────────────────────────────────────────────────────────

export interface OgStat {
  label: string;
  value: string;
}

/** A cluster plotted on the US map. Projection happens here, not in callers. */
export interface MapDot {
  lat: number;
  lng: number;
  /** Planned MW; drives dot radius. Null/0 renders at the smallest size. */
  mw?: number | null;
  /** operational | construction | announced; drives opacity. */
  status?: string;
  /** Draws this dot larger with a ring and dims the rest. Used by the spotlight card. */
  highlight?: boolean;
}

export interface Bar {
  label: string;
  /** Raw magnitude; bar widths are normalised against the largest value. */
  value: number;
  /** What to print at the end of the bar, e.g. "42 GW". */
  display: string;
  /** Draws the bar in brand orange instead of grey. Use for the bottleneck. */
  hot?: boolean;
}

export interface Column {
  label: string;
  value: number;
  display?: string;
}

export type OgVisual =
  | { kind: "map"; dots: MapDot[]; legend?: boolean }
  | { kind: "bars"; bars: Bar[] }
  | { kind: "columns"; columns: Column[]; caption?: string }
  | { kind: "none" };

export interface OgCard {
  title: string;
  subtitle: string;
  stats: OgStat[];
  /** Pre-formatted, e.g. "26 JUN 2026". Null prints "AS OF —". */
  asOf: string | null;
  /** Footer-left provenance line. Required; keep it specific and true. */
  source: string;
  visual: OgVisual;
}

// ─── Map projection ────────────────────────────────────────────────────────

const STATUS_OPACITY: Record<string, number> = {
  operational: 1,
  construction: 0.72,
  announced: 0.38,
};

/**
 * Project a coordinate into the card's map box, or null when it falls outside.
 *
 * This is d3's geoAlbers written out longhand using constants baked by
 * scripts/generate-map-path.mjs. It is deliberately dependency-free: d3-geo is
 * ESM-only, the server ships as a CJS bundle with deps external, and the card
 * render is wrapped in a try/catch that would swallow ERR_REQUIRE_ESM into
 * silently image-less tweets. The parity test in server/__tests__ pins this to
 * d3's own output.
 */
export function projectDot(lat: number, lng: number): [number, number] | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const lambda = ((lng + ALBERS.lambda0Deg) * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;

  const under = ALBERS.c - 2 * ALBERS.n * Math.sin(phi);
  if (under < 0) return null; // beyond the projection's valid latitude range

  const rho = Math.sqrt(under) / ALBERS.n;
  const theta = lambda * ALBERS.n;
  const x = ALBERS.k * (rho * Math.sin(theta)) + ALBERS.dx;
  const y = ALBERS.dy - ALBERS.k * (ALBERS.rho0 - rho * Math.cos(theta));

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  // The conic projection happily returns coordinates for the whole hemisphere,
  // so anything off the card's map box (Alaska, Hawaii) is dropped, not clamped.
  if (x < 0 || x > MAP_W || y < 0 || y > MAP_H) return null;
  return [x, y];
}

function dotRadius(mw?: number | null): number {
  const v = mw ?? 0;
  if (v >= 1500) return 5.6;
  if (v >= 600) return 4.2;
  if (v >= 200) return 3.2;
  return 2.5;
}

/**
 * Guard against the satori SVG truncation failure. The generated outline is
 * ~36k characters; anything far below that means the file was regenerated
 * wrongly or hand-edited, and the card would ship a half-drawn country.
 */
export function assertMapPathIntact(): void {
  if (!US_PATH.startsWith("M") || US_PATH.length < 20_000) {
    throw new Error(`US_PATH looks truncated (${US_PATH.length} chars); re-run scripts/generate-map-path.mjs`);
  }
}

function mapDataUri(): string {
  assertMapPathIntact();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_W}" height="${MAP_H}" viewBox="0 0 ${MAP_W} ${MAP_H}">` +
    `<path d="${US_PATH}" fill="${PANEL}" stroke="${STATE_STROKE}" stroke-width="0.75" stroke-linejoin="round"/>` +
    `</svg>`;
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

// ─── Tiny satori node helpers ──────────────────────────────────────────────

type Node = Record<string, unknown>;

const box = (style: Record<string, unknown>, children: unknown[] = []): Node => ({
  type: "div",
  props: { style: { display: "flex", ...style }, children },
});

const text = (value: string, style: Record<string, unknown>): Node => ({
  type: "div",
  props: { style: { display: "flex", ...style }, children: value },
});

// ─── Visual builders ───────────────────────────────────────────────────────

function buildMap(dots: MapDot[], legend: boolean): Node {
  // When any dot is highlighted the rest recede, so the eye lands on one place.
  const hasHighlight = dots.some((d) => d.highlight);
  const placed = dots
    .map((d) => {
      const p = projectDot(d.lat, d.lng);
      if (!p) return null;
      const r = d.highlight ? 7 : dotRadius(d.mw);
      const base = STATUS_OPACITY[d.status ?? ""] ?? 0.6;
      const op = d.highlight ? 1 : hasHighlight ? 0.22 : base;
      return { x: p[0], y: p[1], r, op, ring: !!d.highlight };
    })
    .filter((d): d is { x: number; y: number; r: number; op: number; ring: boolean } => d !== null)
    // Draw the highlighted dot last so it sits on top of the crowd.
    .sort((a, b) => Number(a.ring) - Number(b.ring));

  const key = (opacity: number, label: string) =>
    box({ alignItems: "center", gap: "7px" }, [
      box({ width: "8px", height: "8px", borderRadius: "4px", backgroundColor: BRAND, opacity }),
      text(label, { fontSize: "12px", color: MUTED }),
    ]);

  return box({ flexDirection: "column", alignItems: "flex-end", gap: "10px" }, [
    box({ position: "relative", width: `${MAP_W}px`, height: `${MAP_H}px` }, [
      { type: "img", props: { src: mapDataUri(), width: MAP_W, height: MAP_H } },
      ...placed.flatMap((d) => [
        ...(d.ring
          ? [
              box({
                position: "absolute",
                left: `${d.x - d.r - 6}px`,
                top: `${d.y - d.r - 6}px`,
                width: `${(d.r + 6) * 2}px`,
                height: `${(d.r + 6) * 2}px`,
                borderRadius: `${d.r + 6}px`,
                border: `2px solid ${AMBER}`,
              }),
            ]
          : []),
        box({
          position: "absolute",
          left: `${d.x - d.r}px`,
          top: `${d.y - d.r}px`,
          width: `${d.r * 2}px`,
          height: `${d.r * 2}px`,
          borderRadius: `${d.r}px`,
          backgroundColor: BRAND,
          opacity: d.op,
        }),
      ]),
    ]),
    ...(legend && !hasHighlight
      ? [box({ gap: "16px" }, [key(1, "operational"), key(0.72, "under construction"), key(0.38, "announced")])]
      : []),
  ]);
}

function buildBars(bars: Bar[]): Node {
  const max = Math.max(...bars.map((b) => b.value), 1);
  const TRACK = 470;
  return box({ flexDirection: "column", gap: "13px", width: `${TRACK}px` }, [
    ...bars.map((b) =>
      box({ flexDirection: "column", gap: "5px" }, [
        box({ justifyContent: "space-between", alignItems: "baseline" }, [
          text(b.label, { fontSize: "14px", color: b.hot ? "#e8e6e3" : SUBTLE }),
          text(b.display, {
            fontSize: "15px",
            fontFamily: "JetBrains Mono",
            fontWeight: 700,
            color: b.hot ? AMBER : SUBTLE,
          }),
        ]),
        box({ width: `${TRACK}px`, height: "10px", backgroundColor: "#1f1e1c", borderRadius: "2px" }, [
          box({
            width: `${Math.max(3, Math.round((b.value / max) * TRACK))}px`,
            height: "10px",
            backgroundColor: b.hot ? BRAND : "#4a4641",
            borderRadius: "2px",
          }),
        ]),
      ]),
    ),
  ]);
}

function buildColumns(columns: Column[], caption?: string): Node {
  const max = Math.max(...columns.map((c) => c.value), 1);
  const min = Math.min(...columns.map((c) => c.value), 0);
  const H = 200;
  const span = Math.max(max - min, 1e-9);
  return box({ flexDirection: "column", gap: "10px" }, [
    box({ alignItems: "flex-end", gap: "12px", height: `${H}px` }, [
      ...columns.map((c) => {
        const h = Math.max(6, Math.round(((c.value - min) / span) * (H - 34)) + 12);
        return box({ flexDirection: "column", alignItems: "center", gap: "6px", width: "62px" }, [
          text(c.display ?? String(c.value), {
            fontSize: "13px",
            fontFamily: "JetBrains Mono",
            fontWeight: 700,
            color: AMBER,
          }),
          box({ width: "34px", height: `${h}px`, backgroundColor: BRAND, borderRadius: "2px" }),
          text(c.label, { fontSize: "12px", color: MUTED }),
        ]);
      }),
    ]),
    ...(caption ? [text(caption, { fontSize: "12px", color: MUTED, justifyContent: "flex-end" })] : []),
  ]);
}

function buildVisual(v: OgVisual): Node | null {
  switch (v.kind) {
    case "map":
      return buildMap(v.dots, v.legend ?? true);
    case "bars":
      return buildBars(v.bars);
    case "columns":
      return buildColumns(v.columns, v.caption);
    case "none":
      return null;
  }
}

// ─── Frame ─────────────────────────────────────────────────────────────────

/** Build the satori element tree for a card. Pure: no IO, no fonts. */
export function buildCardTree(card: OgCard): Node {
  const visual = buildVisual(card.visual);
  const wide = visual === null;

  // Values are mono, so width scales with character count. Step the size down
  // for long values ("OpenAI / Oracle") so the stats row cannot run into the
  // visual on the right.
  const statSize = (value: string) => (value.length <= 7 ? 44 : value.length <= 11 ? 34 : value.length <= 16 ? 26 : 21);

  const stat = (s: OgStat) =>
    box({ flexDirection: "column", gap: "7px" }, [
      text(s.label, { fontSize: "13px", color: MUTED, textTransform: "uppercase", letterSpacing: "2.5px" }),
      text(s.value, {
        fontSize: `${statSize(s.value)}px`,
        fontFamily: "JetBrains Mono",
        fontWeight: 700,
        color: AMBER,
        lineHeight: "1",
      }),
    ]);

  return box(
    {
      width: `${CARD_W}px`,
      height: `${CARD_H}px`,
      flexDirection: "column",
      padding: "46px 54px",
      backgroundColor: BG,
      fontFamily: "Inter",
      color: "#ffffff",
    },
    [
      // header
      box({ justifyContent: "space-between", alignItems: "center", paddingBottom: "15px", borderBottom: `1px solid ${HAIRLINE}` }, [
        box({ alignItems: "center", gap: "11px" }, [
          box({ width: "6px", height: "25px", backgroundColor: BRAND, borderRadius: "1px" }),
          text("GRIDTILT", {
            fontSize: "23px",
            fontFamily: "JetBrains Mono",
            fontWeight: 700,
            color: BRAND,
            letterSpacing: "3.5px",
          }),
        ]),
        text(`AS OF ${card.asOf ?? "—"}`, { fontSize: "13px", color: MUTED, letterSpacing: "2.5px" }),
      ]),
      // body
      box({ flexGrow: 1, paddingTop: "22px", justifyContent: "space-between" }, [
        box({ flexDirection: "column", width: wide ? "1090px" : "578px", paddingTop: "14px" }, [
          text(card.title, { fontSize: "52px", fontWeight: 700, lineHeight: "1.04", letterSpacing: "-1px" }),
          text(card.subtitle, {
            fontSize: "20px",
            color: SUBTLE,
            marginTop: "15px",
            lineHeight: "1.35",
            width: wide ? "900px" : "530px",
          }),
          box({ gap: "50px", marginTop: "auto", paddingBottom: "6px" }, card.stats.map(stat)),
        ]),
        // Short visuals (bars, columns) centre against the text block; the map
        // is nearly full height so centring is a no-op for it.
        ...(visual ? [box({ alignItems: "center", justifyContent: "flex-end" }, [visual])] : []),
      ]),
      // footer
      box({ justifyContent: "space-between", alignItems: "center", paddingTop: "15px", borderTop: `1px solid ${HAIRLINE}`, marginTop: "16px" }, [
        text(card.source, { fontSize: "14.5px", color: MUTED }),
        text("gridtilt.com", { fontSize: "15px", color: "#8a8a85", fontFamily: "JetBrains Mono", fontWeight: 700 }),
      ]),
    ],
  );
}

// ─── Render ────────────────────────────────────────────────────────────────

interface LoadedFont {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: "normal";
}

let fontCache: LoadedFont[] | null = null;

function loadFonts(): LoadedFont[] {
  if (fontCache) return fontCache;
  const dir = join(process.cwd(), "server", "fonts");
  fontCache = [
    { name: "Inter", data: readFileSync(join(dir, "Inter-Regular.ttf")), weight: 400, style: "normal" },
    { name: "Inter", data: readFileSync(join(dir, "Inter-Bold.woff")), weight: 700, style: "normal" },
    { name: "JetBrains Mono", data: readFileSync(join(dir, "JetBrainsMono-Bold.woff")), weight: 700, style: "normal" },
  ];
  return fontCache;
}

/** Render a card to a 1200x630 PNG. */
export async function renderOgPng(card: OgCard): Promise<Buffer> {
  const satori = (await import("satori")).default;
  const { Resvg } = await import("@resvg/resvg-js");

  const svg = await satori(buildCardTree(card) as unknown as Parameters<typeof satori>[0], {
    width: CARD_W,
    height: CARD_H,
    fonts: loadFonts(),
  });

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: CARD_W } });
  return Buffer.from(resvg.render().asPng());
}

/** "2026-06-26" -> "26 JUN 2026". Returns null for missing/unparseable input. */
export function formatAsOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const mon = months[Number(m[2]) - 1];
  if (!mon) return null;
  return `${Number(m[3])} ${mon} ${m[1]}`;
}
