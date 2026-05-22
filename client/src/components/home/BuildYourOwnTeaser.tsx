import { EmailCapture } from "@/components/EmailCapture";

const HORIZ_PAD = "clamp(24px, 5vw, 96px)";

export function BuildYourOwnTeaser() {
  return (
    <section
      style={{
        position: "relative",
        paddingTop: "clamp(80px, 12vh, 160px)",
        paddingBottom: "clamp(80px, 12vh, 160px)",
      }}
      data-testid="home-build-your-own"
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
        <div style={{ marginBottom: 56 }}>
          <div className="gt-eyebrow" style={{ marginBottom: 28 }}>
            On the roadmap
          </div>
          <h2
            className="gt-section-heading"
            style={{ marginBottom: 24, maxWidth: 880 }}
          >
            Soon —{" "}
            <span style={{ color: "var(--mkt-accent)" }}>
              compose your own.
            </span>
          </h2>
          <p className="gt-section-dek" style={{ maxWidth: 620 }}>
            The six modules above are curated. Next, you arrange them — a
            watchlist of nuclear utilities, an Eastern Interconnect power map,
            the next earnings dates — into a dashboard that fits what you
            actually watch.
          </p>
        </div>

        {/* Bento-style sketch of a personal dashboard */}
        <div
          className="grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gridAutoRows: "104px",
            gap: 16,
            marginBottom: 64,
          }}
        >
          <SketchTile
            label="NVDA · 5Y price"
            style={{ gridColumn: "span 4", gridRow: "span 2" }}
          />
          <SketchTile label="Top movers · today" style={{ gridColumn: "span 2" }} />
          <SketchTile
            label="Power map · Virginia"
            style={{ gridColumn: "span 2" }}
          />
          <SketchTile
            label="Catalyst filter · nuclear"
            style={{ gridColumn: "span 3" }}
          />
          <SketchTile label="Grid stress · 7d" style={{ gridColumn: "span 3" }} />
        </div>

        <div style={{ maxWidth: 580 }}>
          <EmailCapture
            theme="marketing"
            context="build-your-own-waitlist"
            heading="Get a note when this ships."
            subheading="No date promised. We'll only email you about this one feature."
            submitLabel="Join the waitlist"
            extraField={{
              name: "intent",
              label: "What would you put on yours?",
              placeholder:
                "e.g., a nuclear watchlist, an Eastern Interconnect power map, and the next two earnings dates.",
              optional: true,
            }}
            successMessage="You're on the list. We'll only email about this one feature."
          />
        </div>
      </div>
    </section>
  );
}

function SketchTile({
  label,
  style,
}: {
  label: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-label="Example tile, illustrative only"
      style={{
        border: "1px dashed var(--mkt-line-bright)",
        borderRadius: "var(--mkt-radius)",
        background: "var(--mkt-bg-elev)",
        padding: "16px 18px",
        display: "flex",
        alignItems: "flex-end",
        ...style,
      }}
    >
      <span
        style={{
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 11,
          color: "var(--mkt-ink-muted)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
    </div>
  );
}
