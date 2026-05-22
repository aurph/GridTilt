import { Link } from "wouter";

const HORIZ_PAD = "clamp(20px, 4vw, 64px)";

export function HomeFooter() {
  return (
    <footer className="w-full" style={{ paddingTop: 64, paddingBottom: 48 }}>
      <div
        className="mx-auto"
        style={{
          maxWidth: 1280,
          paddingLeft: HORIZ_PAD,
          paddingRight: HORIZ_PAD,
        }}
      >
        <div className="anchor-rule-top" style={{ marginBottom: 48 }} />

        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
          style={{ rowGap: 32, columnGap: 32, marginBottom: 48 }}
        >
          <div>
            <h3 className="anchor-eyebrow" style={{ marginBottom: 16 }}>SOURCES</h3>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "#111111", lineHeight: 1.6 }}>
              Yahoo Finance · EIA · DOE · NERC · LBNL · Public RSS feeds (Utility Dive, Data Center Dynamics, World Nuclear News, Power Engineering)
            </p>
          </div>
          <div>
            <h3 className="anchor-eyebrow" style={{ marginBottom: 16 }}>METHODOLOGY</h3>
            <Link
              href="/overview"
              className="footer-link"
              style={{ fontFamily: "Inter, sans-serif", fontSize: 13 }}
            >
              Read how we compute the indices →
            </Link>
          </div>
          <div>
            <h3 className="anchor-eyebrow" style={{ marginBottom: 16 }}>PROJECT</h3>
            <a
              href="https://github.com/aurph/GridTilt"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link"
              style={{ fontFamily: "Inter, sans-serif", fontSize: 13 }}
            >
              github.com/aurph/GridTilt →
            </a>
          </div>
          <div>
            <h3 className="anchor-eyebrow" style={{ marginBottom: 16 }}>CONTACT</h3>
            <a
              href="mailto:jacksch45@gmail.com"
              className="footer-link"
              style={{ fontFamily: "Inter, sans-serif", fontSize: 13 }}
            >
              jacksch45@gmail.com
            </a>
          </div>
        </div>

        <div
          className="anchor-rule-top flex flex-wrap items-baseline justify-between"
          style={{
            paddingTop: 24,
            fontFamily: "Inter, sans-serif",
            fontSize: 12,
            color: "#5A5A5A",
            gap: 16,
          }}
        >
          <span>© 2026 GridTilt. Built by Jack Schwartz.</span>
          <span style={{ color: "#9A9A9A" }}>gridtilt.com</span>
        </div>
      </div>
    </footer>
  );
}
