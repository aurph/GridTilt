import logoPath from "@assets/Image_[Vectorized]_(2)_1773890483514.png";

const HORIZ_PAD = "clamp(24px, 5vw, 96px)";

export function HomeFooter() {
  return (
    <footer
      style={{
        position: "relative",
        paddingTop: 64,
        paddingBottom: 40,
        background: "var(--mkt-bg-deeper)",
      }}
      data-testid="home-footer"
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
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 32,
            marginBottom: 48,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <img
              src={logoPath}
              alt="GridTilt"
              style={{ height: 36, width: 36, display: "block", borderRadius: 5 }}
            />
            <span
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 14,
                fontWeight: 700,
                color: "var(--mkt-ink)",
                letterSpacing: "-0.01em",
              }}
            >
              Grid<span style={{ color: "var(--mkt-accent)", fontStyle: "italic" }}>tilt</span>
            </span>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <a
              href="https://x.com/gridtilt"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GridTilt on X"
              className="gt-social"
              data-testid="footer-social-x"
            >
              <XIcon />
            </a>
            <a
              href="https://github.com/aurph/GridTilt"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GridTilt on GitHub"
              className="gt-social"
              data-testid="footer-social-github"
            >
              <GithubIcon />
            </a>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: 32,
            alignItems: "start",
            marginBottom: 40,
          }}
        >
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              lineHeight: 1.7,
              color: "var(--mkt-ink-muted)",
              maxWidth: 720,
            }}
          >
            Sources: Yahoo Finance, EIA, DOE, NERC, LBNL. RSS: Utility Dive, Data
            Center Dynamics, World Nuclear News, Power Engineering.
          </p>
          <a
            href="mailto:jacksch45@gmail.com"
            className="gt-footer-link"
            style={{ fontFamily: "Inter, sans-serif", fontSize: 13 }}
          >
            jacksch45@gmail.com
          </a>
        </div>

        <div
          className="gt-rule-top"
          style={{
            paddingTop: 24,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 16,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
            color: "var(--mkt-ink-quiet)",
            letterSpacing: "0.06em",
          }}
        >
          <span>© 2026 GridTilt</span>
          <span>gridtilt.com</span>
        </div>
      </div>
    </footer>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 .5a11.5 11.5 0 0 0-3.635 22.42c.575.105.785-.25.785-.555 0-.273-.01-1-.015-1.96-3.196.694-3.873-1.54-3.873-1.54-.523-1.33-1.277-1.683-1.277-1.683-1.044-.713.08-.7.08-.7 1.154.082 1.762 1.186 1.762 1.186 1.026 1.757 2.69 1.25 3.345.956.105-.743.402-1.25.73-1.538-2.55-.29-5.234-1.275-5.234-5.674 0-1.253.447-2.278 1.18-3.082-.118-.29-.512-1.458.112-3.04 0 0 .963-.308 3.155 1.177a10.93 10.93 0 0 1 5.738 0c2.19-1.485 3.152-1.177 3.152-1.177.625 1.582.232 2.75.114 3.04.735.804 1.18 1.83 1.18 3.082 0 4.41-2.687 5.38-5.247 5.667.413.355.78 1.054.78 2.124 0 1.534-.014 2.772-.014 3.148 0 .307.208.665.79.553A11.5 11.5 0 0 0 12 .5z" />
    </svg>
  );
}
