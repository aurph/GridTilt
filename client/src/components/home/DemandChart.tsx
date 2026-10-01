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
import { electricityData, demandAnnotations, US_END_USE_SOURCE } from "@/data/electricity-demand";
import { DATA_CENTER_LOAD, demandTrough, latestDemand, pctChange } from "@/lib/sector-demand";
import { seriesMotion } from "@/lib/chart-theme";

const HORIZ_PAD = "clamp(24px, 5vw, 96px)";
const DATA_MUTED = "#9C9A93";
const RULE = "rgba(255, 255, 255, 0.06)";
const RULE_BRIGHT = "rgba(255, 255, 255, 0.14)";

// The heading is computed from the series so it cannot drift from the line
// under it. The old one promised 1,500 TWh of new data-center load by 2030 and
// compared it with the UK, whose 2024 electricity demand was 319 TWh.
const FIRST_YEAR = electricityData[0]?.year;
const LATEST = latestDemand(electricityData);
const TROUGH = demandTrough(electricityData);
const RISE = TROUGH && LATEST ? pctChange(TROUGH.twh, LATEST.twh) : null;

const LINK_STYLE = { color: "var(--mkt-ink-muted)", textDecoration: "underline", textUnderlineOffset: 2 };

// One measured series on one axis. Data-center use used to share the plot on a
// second axis, where 176 TWh drew above a 4,000 TWh total line. The estimate
// now sits in the text with its source; the Overview chart plots it with room
// to explain the two report editions.
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
            US electricity use, {FIRST_YEAR} to {LATEST?.year}
            {LATEST && TROUGH && RISE !== null && (
              <>
                <br />
                <span style={{ color: "var(--mkt-accent)", fontStyle: "italic" }}>
                  {LATEST.twh.toLocaleString()} TWh in {LATEST.year}, up {RISE.toFixed(0)}% from {TROUGH.year}.
                </span>
              </>
            )}
          </h2>
          <p className="gt-section-dek">
            Data centers used an estimated {DATA_CENTER_LOAD.twh} TWh in {DATA_CENTER_LOAD.year},{" "}
            {DATA_CENTER_LOAD.sharePctOfUS}% of US electricity, by{" "}
            <a href={DATA_CENTER_LOAD.sourceUrl} target="_blank" rel="noopener noreferrer" style={LINK_STYLE}>
              LBNL's estimate
            </a>
            .
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
          <LegendItem color={DATA_MUTED} label="US electricity end use, TWh" />
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
                domain={[3600, 4400]}
                ticks={[3600, 3800, 4000, 4200, 4400]}
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
                  if (value == null) return ["no data", name];
                  return [`${Math.round(value as number).toLocaleString()} TWh`, name];
                }}
              />

              <Line {...seriesMotion()} yAxisId="total" type="linear" dataKey="demand" stroke={DATA_MUTED} strokeWidth={1.5} dot={false} activeDot={{ r: 4, fill: DATA_MUTED }} connectNulls={false} name="US end use" />

              {/* event markers stay unlabeled in the plot: labels collide at
                  most widths, worst on phones. The key below carries the text. */}
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
              <span>{a.label}</span>
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
            lineHeight: 1.7,
          }}
          data-testid="home-demand-sources"
        >
          source:{" "}
          <a href={US_END_USE_SOURCE.url} target="_blank" rel="noopener noreferrer" style={LINK_STYLE}>
            {US_END_USE_SOURCE.label}
          </a>
          , electricity end use (retail sales plus direct use), retrieved {US_END_USE_SOURCE.retrieved}.
          Data centers:{" "}
          <a href={DATA_CENTER_LOAD.sourceUrl} target="_blank" rel="noopener noreferrer" style={LINK_STYLE}>
            {DATA_CENTER_LOAD.source}
          </a>
          , a model estimate, not a metered total.
        </p>
      </div>
    </section>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        aria-hidden
        style={{ width: 26, height: 0, borderTop: `2px solid ${color}`, display: "inline-block" }}
      />
      <span>{label}</span>
    </span>
  );
}
