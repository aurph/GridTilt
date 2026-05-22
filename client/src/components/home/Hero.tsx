import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Wordmark } from "./Wordmark";
import type { KpiData } from "@/lib/types";
import logoPath from "@assets/Image_[Vectorized]_(2)_1773890483514.png";

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
        paddingTop: 32,
        paddingBottom: 56,
        overflow: "hidden",
      }}
      data-testid="home-hero"
    >
      <div
        style={{
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
        <Link href="/" aria-label="GridTilt" style={{ display: "inline-flex" }}>
          <img
            src={logoPath}
            alt="GridTilt logo"
            style={{
              height: 44,
              width: 44,
              display: "block",
              borderRadius: 6,
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
              paddingTop: 10,
            }}
            data-testid="hero-refresh"
          >
            {isLive ? "data refreshed" : "static fallback"} {refresh}
          </span>
        )}
      </div>

      <div
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 1280,
          margin: "0 auto",
          paddingLeft: HORIZ_PAD,
          paddingRight: HORIZ_PAD,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          paddingTop: "clamp(48px, 10vh, 120px)",
        }}
      >
        <Wordmark />

        <p
          className="gt-rise gt-rise-2"
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: "clamp(22px, 2.5vw, 32px)",
            fontWeight: 400,
            lineHeight: 1.35,
            color: "var(--mkt-ink)",
            maxWidth: 760,
            marginTop: 44,
            marginBottom: 12,
            letterSpacing: "-0.01em",
          }}
        >
          Watch the AI power grid get built.
        </p>
        <p
          className="gt-rise gt-rise-2"
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: "clamp(22px, 2.5vw, 32px)",
            fontWeight: 400,
            lineHeight: 1.35,
            color: "var(--mkt-ink-muted)",
            maxWidth: 760,
            marginBottom: 48,
            letterSpacing: "-0.01em",
          }}
        >
          Live, in plain sight.
        </p>

        <div
          className="gt-rise gt-rise-3"
          style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}
        >
          <Link href="/overview" className="gt-cta-wireframe" data-testid="hero-cta-dashboard">
            <span>Open the dashboard</span>
            <span className="gt-cta-wireframe__arrow" aria-hidden>
              →
            </span>
          </Link>
        </div>
      </div>

      <div
        className="gt-rise gt-rise-5"
        style={{
          width: "100%",
          maxWidth: 1280,
          margin: "0 auto",
          paddingLeft: HORIZ_PAD,
          paddingRight: HORIZ_PAD,
          display: "flex",
          justifyContent: "center",
          paddingBottom: "clamp(24px, 4vh, 48px)",
        }}
      >
        <a
          href="#stack"
          className="gt-chevrons"
          aria-label="Scroll down"
          data-testid="scroll-cue"
        >
          <Chevron />
          <Chevron />
          <Chevron />
        </a>
      </div>
    </section>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
