import { Link } from "wouter";

const HORIZ_PAD = "clamp(24px, 5vw, 96px)";

export function HomeFooter() {
  return (
    <footer
      style={{
        position: "relative",
        paddingTop: 80,
        paddingBottom: 64,
        background: "var(--mkt-bg-deeper)",
      }}
      data-testid="home-footer"
    >
      <div
        className="gt-rule-top"
        style={{ position: "absolute", top: 0, left: 0, right: 0 }}
      />
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          paddingLeft: HORIZ_PAD,
          paddingRight: HORIZ_PAD,
        }}
      >
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
          style={{ rowGap: 40, columnGap: 32, marginBottom: 64 }}
        >
          <div>
            <h3 className="gt-eyebrow" style={{ marginBottom: 22 }}>
              Sources
            </h3>
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                color: "var(--mkt-ink-muted)",
                lineHeight: 1.7,
              }}
            >
              Yahoo Finance · EIA · DOE · NERC · LBNL.
              <br />
              RSS feeds: Utility Dive, Data Center Dynamics, World Nuclear
              News, Power Engineering.
            </p>
          </div>
          <div>
            <h3 className="gt-eyebrow" style={{ marginBottom: 22 }}>
              Explore
            </h3>
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                lineHeight: 1.9,
              }}
            >
              <Link href="/overview" className="gt-footer-link">
                Open the dashboard →
              </Link>
            </p>
          </div>
          <div>
            <h3 className="gt-eyebrow" style={{ marginBottom: 22 }}>
              Built by
            </h3>
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                color: "var(--mkt-ink-muted)",
                lineHeight: 1.7,
              }}
            >
              Jack Schwartz
              <br />
              <a
                href="https://github.com/aurph/GridTilt"
                target="_blank"
                rel="noopener noreferrer"
                className="gt-footer-link"
              >
                github.com/aurph/GridTilt →
              </a>
            </p>
          </div>
          <div>
            <h3 className="gt-eyebrow" style={{ marginBottom: 22 }}>
              Contact
            </h3>
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                lineHeight: 1.7,
              }}
            >
              <a
                href="mailto:jacksch45@gmail.com"
                className="gt-footer-link"
              >
                jacksch45@gmail.com
              </a>
            </p>
          </div>
        </div>

        <div
          className="gt-rule-top"
          style={{
            paddingTop: 32,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 16,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
            color: "var(--mkt-ink-quiet)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          <span>© 2026 · GridTilt</span>
          <span>Built solo · aurph</span>
        </div>
      </div>
    </footer>
  );
}
