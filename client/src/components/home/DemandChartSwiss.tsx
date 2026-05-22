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

const HORIZ_PAD = "clamp(20px, 4vw, 64px)";
const DATA = "#1F2937";
const DATA_MUTED = "#9CA3AF";
const RULE = "#E5E5E5";

export function DemandChartSwiss() {
  return (
    <section className="w-full" style={{ paddingTop: 80, paddingBottom: 80 }}>
      <div
        className="mx-auto"
        style={{
          maxWidth: 1280,
          paddingLeft: HORIZ_PAD,
          paddingRight: HORIZ_PAD,
        }}
      >
        <div className="anchor-rule-top" style={{ marginBottom: 56 }} />

        <div className="grid grid-cols-12 gap-x-6">
          <div className="col-span-12 md:col-span-2" style={{ marginBottom: 16 }}>
            <div className="anchor-section-num" style={{ marginBottom: 8 }}>02</div>
            <div className="anchor-eyebrow">THE LOAD CURVE</div>
          </div>
          <div className="col-span-12 md:col-span-10">
            <h2
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: "clamp(28px, 3.4vw, 44px)",
                fontWeight: 600,
                lineHeight: 1.2,
                color: "#111111",
                maxWidth: 820,
                marginBottom: 16,
              }}
            >
              Data centers will add ~1,500 TWh to the US grid by 2030. That's the entire UK's annual consumption.
            </h2>
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 18,
                fontWeight: 400,
                lineHeight: 1.5,
                color: "#5A5A5A",
                maxWidth: 680,
                marginBottom: 32,
              }}
            >
              US electricity demand was flat for a decade. AI changed that.
            </p>
          </div>
        </div>

        {/* Inline legend */}
        <div
          className="flex items-center flex-wrap"
          style={{ gap: 24, fontSize: 12, color: "#5A5A5A", marginBottom: 16 }}
        >
          <LegendItem color={DATA} label="Total US demand" />
          <LegendItem color={DATA} label="Total — projection" dashed />
          <LegendItem color={DATA_MUTED} label="Data center subset" />
          <LegendItem color={DATA_MUTED} label="Data center — projection" dashed />
        </div>

        <div style={{ width: "100%", aspectRatio: "16 / 7", minHeight: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={electricityData} margin={{ top: 32, right: 16, bottom: 8, left: 16 }}>
              <CartesianGrid stroke={RULE} strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="year"
                axisLine={{ stroke: RULE }}
                tickLine={false}
                tick={{ fill: "#5A5A5A", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
              />
              <YAxis
                yAxisId="total"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#5A5A5A", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
                domain={[3500, 6500]}
              />
              <YAxis
                yAxisId="dc"
                orientation="right"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#5A5A5A", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                domain={[0, 2400]}
              />
              <Tooltip
                contentStyle={{
                  background: "#FFFFFF",
                  border: `1px solid ${RULE}`,
                  borderRadius: 4,
                  fontSize: 12,
                  fontFamily: "Inter, sans-serif",
                  boxShadow: "none",
                  padding: "8px 10px",
                }}
                labelStyle={{ color: "#111111", fontWeight: 600, marginBottom: 4 }}
                itemStyle={{ color: "#111111", padding: 0 }}
                cursor={{ stroke: RULE, strokeWidth: 1 }}
                formatter={(value: any, name: string) => {
                  if (value == null) return ["—", name];
                  return [`${Math.round(value).toLocaleString()} TWh`, name];
                }}
              />

              <Line yAxisId="total" type="monotone" dataKey="demand"      stroke={DATA}       strokeWidth={1.75} dot={false} connectNulls={false} name="Total" />
              <Line yAxisId="total" type="monotone" dataKey="projected"   stroke={DATA}       strokeWidth={1.5}  strokeDasharray="5 3" dot={false} connectNulls={false} name="Total (proj.)" />
              <Line yAxisId="dc"    type="monotone" dataKey="dcDemand"    stroke={DATA_MUTED} strokeWidth={1.5}  dot={false} connectNulls={false} name="Data centers" />
              <Line yAxisId="dc"    type="monotone" dataKey="dcProjected" stroke={DATA_MUTED} strokeWidth={1.5}  strokeDasharray="5 3" dot={false} connectNulls={false} name="DC (proj.)" />

              <ReferenceLine
                yAxisId="total"
                y={5100}
                stroke="#9A9A9A"
                strokeDasharray="2 2"
                label={{
                  value: "~5,100 TWh — current capacity",
                  fill: "#5A5A5A",
                  fontSize: 10,
                  position: "insideTopLeft",
                }}
              />

              {demandAnnotations.map((a) => (
                <ReferenceLine
                  key={a.year}
                  yAxisId="total"
                  x={a.year}
                  stroke={RULE}
                  strokeDasharray="2 2"
                  label={{
                    value: a.label,
                    position: "top",
                    fill: "#5A5A5A",
                    fontSize: 10,
                  }}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <p style={{ fontSize: 12, color: "#9A9A9A", marginTop: 16, lineHeight: 1.5 }}>
          Source: EIA Electric Power Monthly (historical, 2010–2025). GridTilt projections (2026–2030) — not a forecast.
        </p>
      </div>
    </section>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center" style={{ gap: 8 }}>
      <span
        aria-hidden
        style={{
          width: 22,
          height: 0,
          borderTop: `1.5px ${dashed ? "dashed" : "solid"} ${color}`,
          display: "inline-block",
        }}
      />
      <span>{label}</span>
    </span>
  );
}
