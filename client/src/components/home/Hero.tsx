import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Wordmark } from "./Wordmark";
import type { KpiData } from "@/lib/types";
import logoPath from "@assets/Image_[Vectorized]_(2)_1773890483514.png";
import powerMapSvg from "@assets/previews/power-map.svg";

const HORIZ_PAD = "clamp(24px, 5vw, 96px)";

function formatRefreshTimeFromIso(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

export function Hero() {
  const { data } = useQuery<KpiData>({
    queryKey: ["/api/kpis"],
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  });
  const refresh = formatRefreshTimeFromIso(data?.asOf);
  const sourceKnown = data?.source === "live" || data?.source === "static";
  const isLive = data?.source === "live";

  return (
    <section
      className="gt-marketing-grid"
      style={{
        position: "relative",
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        paddingTop: 36,
        paddingBottom: 80,
        overflow: "hidden",
      }}
      data-testid="home-hero"
    >
      {/* Faded power map decoration. Sits behind the content on the right. */}
      <img
        src={powerMapSvg}
        alt=""
        aria-hidden
        className="gt-hero-map"
        data-testid="hero-map-backdrop"
      />

      {/* Top bar: logo + last refresh */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          maxWidth: 1280,
          margin: "0 auto",
          paddingLeft: HORIZ_PAD,
          paddingRight: HORIZ_PAD,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        <Link href="/" aria-label="GridTilt home" style={{ display: "inline-flex" }}>
          <img
            src={logoPath}
            alt="GridTilt logo"
            style={{
              height: 88,
              width: 88,
              display: "block",
              borderRadius: 12,
            }}
            data-testid="home-logo-mark"
          />
        </Link>
        {sourceKnown && refresh && (
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 11,
              color: "var(--mkt-ink-muted)",
              letterSpacing: "0.04em",
              textAlign: "right",
              lineHeight: 1.4,
              paddingTop: 14,
            }}
            data-testid="hero-refresh"
          >
            {isLive ? "data refreshed" : "static fallback"} {refresh}
          </span>
        )}
      </div>

      {/* Main content area. Left-aligned. */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          flex: 1,
          width: "100%",
          maxWidth: 1280,
          margin: "0 auto",
          paddingLeft: HORIZ_PAD,
          paddingRight: HORIZ_PAD,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          paddingTop: "clamp(40px, 8vh, 96px)",
        }}
      >
        <Wordmark />

        <div className="gt-rise gt-rise-2" style={{ marginTop: 44 }}>
          <p className="gt-tagline-primary">Energy infrastructure,</p>
          <p className="gt-tagline-emphasis">in plain sight.</p>
        </div>

        <div
          className="gt-rise gt-rise-3"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 28,
            flexWrap: "wrap",
            marginTop: 48,
          }}
        >
          <Link href="/overview" className="gt-cta-primary" data-testid="hero-cta-dashboard">
            <span>Open the dashboard</span>
            <span className="gt-cta-primary__arrow" aria-hidden>
              →
            </span>
          </Link>
          <a
            href="#stack"
            className="gt-cta-secondary"
            data-testid="hero-cta-browse"
          >
            or browse the tools
          </a>
        </div>
      </div>
    </section>
  );
}
