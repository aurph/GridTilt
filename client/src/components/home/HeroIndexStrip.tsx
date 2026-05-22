import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useEffect, useState } from "react";
import type { KpiData } from "@/lib/types";
import { formatTodayLong, formatIsoAsDateline } from "@/lib/dates";

const HORIZ_PAD = "clamp(20px, 4vw, 64px)";

export function HeroIndexStrip() {
  const { data, isError } = useQuery<KpiData>({
    queryKey: ["/api/kpis"],
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const [dateline, setDateline] = useState("");
  useEffect(() => {
    setDateline(formatTodayLong());
  }, []);

  const hasData = !!data && !isError;
  const isStatic = data?.source === "static";

  return (
    <section
      className="w-full"
      style={{ paddingTop: 64, paddingBottom: 80 }}
    >
      <div
        className="mx-auto"
        style={{
          maxWidth: 1280,
          paddingLeft: HORIZ_PAD,
          paddingRight: HORIZ_PAD,
        }}
      >
        {/* Top masthead row */}
        <div className="flex items-baseline justify-between" style={{ marginBottom: 12 }}>
          <span
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.18em",
              color: "#111111",
            }}
            data-testid="home-wordmark"
          >
            GRIDTILT
          </span>
          <span
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 12,
              fontWeight: 400,
              color: "#5A5A5A",
            }}
          >
            {dateline}
          </span>
        </div>

        <div className="anchor-rule-top" />

        {hasData && (
          <>
            {/* Three index cells */}
            <div
              className="grid grid-cols-1 md:grid-cols-3"
              style={{ rowGap: 32, columnGap: "clamp(20px, 2vw, 48px)", paddingTop: 48, paddingBottom: 24 }}
            >
              <IndexCell
                label="AI POWER"
                value={Math.round(data!.aiPowerIndex).toString()}
                denom="/100"
              />
              <IndexCell
                label="NUCLEAR POLICY"
                value={Math.round(data!.npiValue).toString()}
                denom="base 100"
              />
              <IndexCell
                label="GRID STRESS"
                value={Math.round(data!.gridStress).toString()}
                denom="/100"
              />
            </div>

            {/* Freshness marker */}
            <div
              className="anchor-mono"
              style={{ fontSize: 11, color: "#9A9A9A", paddingBottom: 16, letterSpacing: 0.4 }}
              data-testid="hero-freshness"
            >
              {isStatic
                ? "Static fallback — live data unavailable"
                : `Live · ${formatIsoAsDateline(data!.asOf)}`}
            </div>

            <div className="anchor-rule-top" />
          </>
        )}

        {/* Headline + CTAs */}
        <div style={{ paddingTop: hasData ? 56 : 80 }}>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: "clamp(20px, 2.4vw, 30px)",
              fontWeight: 500,
              lineHeight: 1.35,
              color: "#111111",
              maxWidth: 680,
              marginBottom: 36,
            }}
          >
            We track the AI infrastructure buildout so you don't need a Bloomberg terminal to follow it.
          </p>
          <div className="flex items-center gap-8 flex-wrap">
            <Link
              href="/overview"
              aria-label="Open the GridTilt dashboard"
              className="anchor-accent-underline"
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 15,
                fontWeight: 500,
                color: "#111111",
              }}
              data-testid="cta-open-dashboard"
            >
              Open the dashboard →
            </Link>
            <a
              href="#thesis"
              aria-label="Jump to the founder thesis"
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 15,
                fontWeight: 400,
                color: "#5A5A5A",
                textDecoration: "none",
              }}
              data-testid="cta-read-thesis"
            >
              Read the thesis ↓
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

interface IndexCellProps {
  label: string;
  value: string;
  denom: string;
}

function IndexCell({ label, value, denom }: IndexCellProps) {
  return (
    <div>
      <div className="anchor-eyebrow" style={{ marginBottom: 18 }}>{label}</div>
      <div className="flex items-baseline gap-2">
        <span
          className="anchor-numeral"
          style={{ fontSize: "clamp(64px, 9vw, 140px)" }}
        >
          {value}
        </span>
        <span
          className="anchor-mono"
          style={{ fontSize: 13, color: "#9A9A9A" }}
        >
          {denom}
        </span>
      </div>
    </div>
  );
}
