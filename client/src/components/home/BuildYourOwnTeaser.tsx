import { EmailCapture } from "@/components/EmailCapture";

const HORIZ_PAD = "clamp(20px, 4vw, 64px)";

export function BuildYourOwnTeaser() {
  return (
    <section className="w-full" style={{ paddingTop: 80, paddingBottom: 80 }}>
      <div
        className="mx-auto"
        style={{
          maxWidth: 1280,
          paddingLeft: HORIZ_PAD,
          paddingRight: HORIZ_PAD,
        }}
      >
        <div className="anchor-rule-top" style={{ marginBottom: 56 }} />

        <div className="grid grid-cols-12 gap-x-6" style={{ marginBottom: 48 }}>
          <div className="col-span-12 md:col-span-2" style={{ marginBottom: 16 }}>
            <div className="anchor-section-num" style={{ marginBottom: 8 }}>05</div>
            <div className="anchor-eyebrow">ROADMAP</div>
          </div>
          <div className="col-span-12 md:col-span-7">
            <h2
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: "clamp(28px, 3.4vw, 44px)",
                fontWeight: 600,
                lineHeight: 1.2,
                color: "#111111",
                marginBottom: 12,
              }}
            >
              Soon — compose your own.
            </h2>
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 18,
                lineHeight: 1.5,
                color: "#5A5A5A",
                maxWidth: 560,
              }}
            >
              Today, the six modules above are curated. Next, you'll arrange them into a dashboard that fits what you actually watch.
            </p>
          </div>
          <div className="col-span-12 md:col-span-3 flex flex-col" style={{ gap: 12 }}>
            <ExampleTile label="NVDA price chart" />
            <ExampleTile label="Power Map · Virginia" />
            <ExampleTile label="Catalyst filter · Nuclear only" />
          </div>
        </div>

        <div style={{ maxWidth: 560 }}>
          <EmailCapture
            theme="swiss"
            context="build-your-own-waitlist"
            heading="Get a note when this ships."
            subheading="No date promised. We'll only email you about this one feature."
            submitLabel="Join the waitlist"
            extraField={{
              name: "intent",
              label: "What would you put on yours?",
              placeholder: "e.g., a watchlist of nuclear utilities, an Eastern Interconnect power map, and the next two earnings dates.",
              optional: true,
            }}
            successMessage="You're on the list. We'll only email about this one feature."
          />
        </div>
      </div>
    </section>
  );
}

function ExampleTile({ label }: { label: string }) {
  return (
    <div
      aria-label="Example tile, illustrative only"
      style={{
        border: "1px solid #E5E5E5",
        borderRadius: 4,
        background: "#FFFFFF",
        padding: "16px 18px",
        minHeight: 64,
        display: "flex",
        alignItems: "center",
      }}
    >
      <span
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 13,
          fontWeight: 500,
          color: "#5A5A5A",
        }}
      >
        {label}
      </span>
    </div>
  );
}
