import { Link } from "wouter";
import { Wordmark } from "./Wordmark";

const HORIZ_PAD = "clamp(24px, 5vw, 96px)";

export function Hero() {
  return (
    <section
      className="gt-marketing-grid"
      style={{
        position: "relative",
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        paddingTop: 80,
        paddingBottom: 80,
        overflow: "hidden",
      }}
      data-testid="home-hero"
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          paddingLeft: HORIZ_PAD,
          paddingRight: HORIZ_PAD,
          width: "100%",
        }}
      >
        {/* Top status row */}
        <div
          className="gt-rise gt-rise-1"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 80,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
            letterSpacing: "0.2em",
            color: "var(--mkt-ink-quiet)",
            textTransform: "uppercase",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="gt-pulse" />
            <span>Tracking live · since 2025</span>
          </span>
          <span style={{ color: "var(--mkt-ink-quiet)" }}>
            AI infrastructure × power economy
          </span>
        </div>

        {/* Wordmark — animation runs on mount */}
        <Wordmark />

        {/* Tagline */}
        <p
          className="gt-rise gt-rise-2"
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: "clamp(22px, 2.6vw, 34px)",
            fontWeight: 400,
            lineHeight: 1.32,
            color: "var(--mkt-ink-muted)",
            maxWidth: 760,
            marginTop: 48,
            marginBottom: 56,
            letterSpacing: "-0.01em",
          }}
        >
          The AI buildout is the largest power expansion in a generation.{" "}
          <span style={{ color: "var(--mkt-ink)", fontWeight: 500 }}>
            We track every name behind it.
          </span>
        </p>

        {/* CTAs */}
        <div
          className="gt-rise gt-rise-3"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/overview"
            className="gt-cta"
            data-testid="hero-cta-dashboard"
          >
            <span>Enter the dashboard</span>
            <span className="gt-cta__arrow" aria-hidden>
              →
            </span>
          </Link>
          <a
            href="#manifesto"
            className="gt-cta gt-cta--ghost"
            data-testid="hero-cta-thesis"
          >
            Read the thesis
          </a>
        </div>

        {/* Scroll cue */}
        <div
          className="gt-rise gt-rise-5"
          style={{
            marginTop: "clamp(72px, 12vh, 128px)",
            display: "flex",
            alignItems: "center",
            gap: 14,
            color: "var(--mkt-ink-quiet)",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 36,
              height: 1,
              background: "var(--mkt-line-bright)",
            }}
          />
          <span>Scroll · the stack below</span>
        </div>
      </div>
    </section>
  );
}
