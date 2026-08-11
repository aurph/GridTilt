import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { electricityData, demandAnnotations } from "@/data/electricity-demand";
import { seriesMotion } from "@/lib/chart-theme";

const HORIZ_PAD = "clamp(24px, 5vw, 96px)";
const DATA = "#F07800";
const DATA_MUTED = "#9C9A93";
const RULE = "rgba(255, 255, 255, 0.06)";
const RULE_BRIGHT = "rgba(255, 255, 255, 0.14)";

export function DemandChart() {
  return (
    <section
      style={{
        position: "relative",
        paddingTop: "clamp(96px, 14vh, 160px)",
        paddingBottom: "clamp(96px, 14vh, 160px)",
      }}
      data-testid="home-demand-chart"
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
        <div style={{ marginBottom: 48, maxWidth: 1040 }}>
          <h2 className="gt-section-heading" style={{ marginBottom: 24 }}>
            US demand was flat for ten years.
            <br />
            <span style={{ color: "var(--mkt-accent)", fontStyle: "italic" }}>
              It isn't anymore.
            </span>
          </h2>
          <p className="gt-section-dek">
            Data centers will add about 1,500 TWh to the US grid by 2030. That's the
            entire UK's annual consumption.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 22,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
            color: "var(--mkt-ink-muted)",
            marginBottom: 22,
            letterSpacing: "0.04em",
          }}
        >
          <LegendItem color={DATA_MUTED} label="total US demand" />
          <LegendItem color={DATA_MUTED} label="total, projected" dashed />
          <LegendItem color={DATA} label="data centers" />
          <LegendItem color={DATA} label="data centers, projected" dashed />
        </div>

        <div style={{ width: "100%", aspectRatio: "16 / 7", minHeight: 360 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={electricityData} margin={{ top: 28, right: 16, bottom: 8, left: 16 }}>
              <CartesianGrid stroke={RULE} strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="year"
                axisLine={{ stroke: RULE_BRIGHT }}
                tickLine={false}
                tick={{ fill: "#9C9A93", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
              />
              <YAxis
                yAxisId="total"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#9C9A93", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
                domain={[3500, 6500]}
              />
              <YAxis
                yAxisId="dc"
                orientation="right"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#9C9A93", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                domain={[0, 2400]}
              />
              <Tooltip
                contentStyle={{
                  background: "#131211",
                  border: `1px solid ${RULE_BRIGHT}`,
                  fontSize: 12,
                  fontFamily: "Inter, sans-serif",
                  boxShadow: "0 12px 40px -10px rgba(0,0,0,0.6)",
                  padding: "10px 12px",
                }}
                labelStyle={{
                  color: "#F2F1ED",
                  fontWeight: 600,
                  marginBottom: 6,
                  fontFamily: "JetBrains Mono, monospace",
                }}
                itemStyle={{ color: "#F2F1ED", padding: 0 }}
                cursor={{ stroke: RULE_BRIGHT, strokeWidth: 1 }}
                formatter={(value, name) => {
                  if (value == null) return ["n/a", name];
                  return [`${Math.round(value as number).toLocaleString()} TWh`, name];
                }}
              />

              <Line {...seriesMotion()} yAxisId="total" type="monotone" dataKey="demand"      stroke={DATA_MUTED} strokeWidth={1.5} dot={false} connectNulls={false} name="Total" />
              <Line {...seriesMotion()} yAxisId="total" type="monotone" dataKey="projected"   stroke={DATA_MUTED} strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls={false} name="Total proj." />
              <Line {...seriesMotion()} yAxisId="dc"    type="monotone" dataKey="dcDemand"    stroke={DATA}       strokeWidth={2}   dot={false} connectNulls={false} name="Data centers" />
              <Line {...seriesMotion()} yAxisId="dc"    type="monotone" dataKey="dcProjected" stroke={DATA}       strokeWidth={2}   strokeDasharray="5 3" dot={false} connectNulls={false} name="DC proj." />

              <ReferenceLine
                yAxisId="total"
                y={5100}
                stroke="rgba(255,255,255,0.12)"
                strokeDasharray="2 2"
                label={{
                  value: "5,100 TWh, current capacity",
                  fill: "#9C9A93",
                  fontSize: 10,
                  position: "insideTopLeft",
                  fontFamily: "JetBrains Mono, monospace",
                }}
              />

              {/* event markers stay unlabeled in the plot: three "top" labels collide
                  into overlap at most widths, worst on phones. The key below carries
                  the text instead. */}
              {demandAnnotations.map((a) => (
                <ReferenceLine
                  key={a.year}
                  yAxisId="total"
                  x={a.year}
                  stroke="rgba(255,255,255,0.14)"
                  strokeDasharray="2 2"
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            rowGap: 6,
            columnGap: 22,
            marginTop: 20,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 10,
            color: "var(--mkt-ink-muted)",
            letterSpacing: "0.04em",
          }}
        >
          {demandAnnotations.map((a) => (
            <span key={a.year} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                aria-hidden
                style={{
                  width: 0,
                  height: 10,
                  borderLeft: "1px dashed rgba(255,255,255,0.35)",
                  display: "inline-block",
                }}
              />
              <span style={{ color: "#B0B0AC" }}>{a.year}</span>
              <span>{a.label.replace(/\s*[—·]\s*/g, " + ")}</span>
            </span>
          ))}
        </div>

        <p
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 10,
            color: "var(--mkt-ink-quiet)",
            marginTop: 14,
            letterSpacing: "0.06em",
          }}
        >
          source: EIA Electric Power Monthly (historical 2010 to 2025), GridTilt
          projection 2026 to 2030. Not a forecast.
        </p>
      </div>
    </section>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        aria-hidden
        style={{
          width: 26,
          height: 0,
          borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}`,
          display: "inline-block",
        }}
      />
      <span>{label}</span>
    </span>
  );
}
