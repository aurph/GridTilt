import { EmailCapture } from "@/components/EmailCapture";

const HORIZ_PAD = "clamp(20px, 4vw, 64px)";

export function ThesisSection() {
  return (
    <section id="thesis" className="w-full" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <div
        className="mx-auto"
        style={{
          maxWidth: 1280,
          paddingLeft: HORIZ_PAD,
          paddingRight: HORIZ_PAD,
        }}
      >
        <div className="anchor-rule-top" style={{ marginBottom: 64 }} />

        <div style={{ maxWidth: 680 }}>
          <div className="anchor-section-num" style={{ marginBottom: 8 }}>06</div>
          <div className="anchor-eyebrow" style={{ marginBottom: 24 }}>THESIS</div>
          <h2
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: "clamp(28px, 3vw, 40px)",
              fontWeight: 600,
              lineHeight: 1.2,
              color: "#111111",
              marginBottom: 40,
            }}
          >
            Why GridTilt exists
          </h2>

          <div
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: "clamp(17px, 1.4vw, 19px)",
              lineHeight: 1.65,
              color: "#111111",
            }}
          >
            <p style={{ marginBottom: 24 }}>
              A few people on Wall Street get to see the AI infrastructure buildout up close. They have Bloomberg terminals, sell-side analysts on speed dial, and earnings call transcripts before retail does. They watch the same numbers I watch, and they trade on them.
            </p>
            <p style={{ marginBottom: 24 }}>
              Everyone else hears about it on a podcast, or reads a paywalled article, or notices their utility bill creeping up and wonders if the two are connected. They are.
            </p>
            <p style={{ marginBottom: 24 }}>
              US electricity demand was flat for ten years. It isn't anymore. Hyperscalers are signing power purchase agreements with nuclear plants that were going to be decommissioned. Texas added more data center load in two years than New York City uses in a winter. None of this is hidden — it's just scattered across EIA filings, ISO queue reports, and earnings calls nobody summarizes for normal people.
            </p>
            <p style={{ marginBottom: 24 }}>
              GridTilt pulls the numbers into one place and shows them honestly. If an index moves, you can see what moved it. If a data center gets announced, you can see the operator, the grid region, and the equities exposed. No paywall. No upsell. No "ask AI." Sources cited at the bottom.
            </p>
            <p style={{ marginBottom: 32 }}>
              That's it. That's the whole thing.
            </p>
          </div>

          <div style={{ width: 80, height: 1, background: "#E5E5E5", marginBottom: 16 }} />
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 500, color: "#111111" }}>
            — Jack Schwartz, founder
          </p>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 11,
              color: "#9A9A9A",
              marginTop: 8,
              fontStyle: "italic",
            }}
            data-testid="thesis-draft-marker"
          >
            [DRAFT — owner to revise]
          </p>

          <div style={{ marginTop: 56, maxWidth: 480 }}>
            <EmailCapture
              theme="swiss"
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
