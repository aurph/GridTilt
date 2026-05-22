import { EmailCapture } from "@/components/EmailCapture";

const HORIZ_PAD = "clamp(24px, 5vw, 96px)";

export function ThesisSection() {
  return (
    <section
      id="manifesto"
      style={{
        position: "relative",
        paddingTop: "clamp(96px, 14vh, 180px)",
        paddingBottom: "clamp(96px, 14vh, 180px)",
      }}
      data-testid="home-thesis"
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
        <div style={{ maxWidth: 720 }}>
          <div className="gt-eyebrow" style={{ marginBottom: 28 }}>
            The thesis
          </div>
          <h2
            className="gt-section-heading"
            style={{ marginBottom: 56, maxWidth: 680 }}
          >
            Why{" "}
            <span style={{ color: "var(--mkt-accent)" }}>GridTilt</span>{" "}
            exists.
          </h2>

          <div
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: "clamp(17px, 1.4vw, 19px)",
              lineHeight: 1.7,
              color: "var(--mkt-ink-muted)",
            }}
          >
            <p style={{ marginBottom: 24 }}>
              A handful of investors get to see the AI infrastructure buildout
              up close — terminals, analyst calls, transcripts before retail.
              Everyone else hears about it on a podcast, reads a paywalled
              headline, or notices their utility bill creeping up and wonders
              if the two are connected.
            </p>
            <p
              style={{
                marginBottom: 24,
                color: "var(--mkt-ink)",
                fontWeight: 500,
              }}
            >
              They are.
            </p>
            <p style={{ marginBottom: 24 }}>
              US electricity demand was flat for ten years. Then hyperscalers
              signed power purchase agreements with nuclear plants that were
              going to be decommissioned. Texas added more data center load in
              two years than New York City uses in a winter. None of this is
              hidden — it's just scattered across EIA filings, ISO queue
              reports, and earnings calls nobody summarizes for normal people.
            </p>
            <p style={{ marginBottom: 24 }}>
              GridTilt pulls the numbers into one place and shows them
              honestly. If an index moves, you can see what moved it. If a
              data center gets announced, you can see the operator, the grid
              region, and the equities exposed. No paywall. No upsell. No
              "ask AI." Sources cited.
            </p>
            <p
              style={{
                marginBottom: 40,
                color: "var(--mkt-ink)",
                fontWeight: 500,
              }}
            >
              That's it. That's the whole thing.
            </p>
          </div>

          <div
            style={{
              width: 96,
              height: 1,
              background: "var(--mkt-accent)",
              marginBottom: 18,
            }}
          />
          <p
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--mkt-ink)",
              letterSpacing: "0.06em",
            }}
          >
            Jack Schwartz · Founder
          </p>
          <p
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              color: "var(--mkt-ink-quiet)",
              marginTop: 6,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
            data-testid="thesis-draft-marker"
          >
            Draft · owner to revise
          </p>

          <div style={{ marginTop: 64, maxWidth: 480 }}>
            <EmailCapture
              theme="marketing"
              context="home-thesis"
              heading="Get the GridTilt brief."
              subheading="Monthly. Thesis check, top movers, new facilities. No spam."
              submitLabel="Subscribe"
              successMessage="You're in. First brief arrives next month."
            />
          </div>
        </div>
      </div>
    </section>
  );
}
