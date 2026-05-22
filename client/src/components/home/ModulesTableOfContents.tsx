import { Link } from "wouter";
import catalystSvg from "@assets/previews/catalyst.svg";
import supplyChainSvg from "@assets/previews/supply-chain.svg";
import powerMapSvg from "@assets/previews/power-map.svg";
import stackSvg from "@assets/previews/stack.svg";
import portfolioSvg from "@assets/previews/portfolio.svg";
import calculatorSvg from "@assets/previews/calculator.svg";

const HORIZ_PAD = "clamp(20px, 4vw, 64px)";

interface ModuleEntry {
  number: string;
  name: string;
  caption: string;
  preview: string;
  route: string;
}

const MODULES: ModuleEntry[] = [
  {
    number: "03.1",
    name: "The Stack",
    caption: "Sixty-plus public tickers grouped into nine layers of the AI power stack, priced live.",
    preview: stackSvg,
    route: "/stack",
  },
  {
    number: "03.2",
    name: "Power Map",
    caption: "Forty-eight AI data centers plotted by operator, grid region, and announced capacity.",
    preview: powerMapSvg,
    route: "/power-map",
  },
  {
    number: "03.3",
    name: "Supply Chain",
    caption: "Twenty bottlenecks from silicon to substation, each tied to the equities exposed.",
    preview: supplyChainSvg,
    route: "/supply-chain",
  },
  {
    number: "03.4",
    name: "Catalyst Tracker",
    caption: "Earnings dates, regulatory rulings, and policy votes that move these names — on one calendar.",
    preview: catalystSvg,
    route: "/catalysts",
  },
  {
    number: "03.5",
    name: "Portfolio Overlay",
    caption: "Score any ticker against the AI power thesis: nuclear, grid stress, and demand pressure.",
    preview: portfolioSvg,
    route: "/portfolio",
  },
  {
    number: "03.6",
    name: "Scenario Calculator",
    caption: "Model US AI electricity demand to 2030 with three presets and assumptions you can edit.",
    preview: calculatorSvg,
    route: "/trade",
  },
];

export function ModulesTableOfContents() {
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
            <div className="anchor-section-num" style={{ marginBottom: 8 }}>03</div>
            <div className="anchor-eyebrow">WHAT WE TRACK</div>
          </div>
          <div className="col-span-12 md:col-span-10">
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
              Six modules. One thesis.
            </h2>
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 18,
                lineHeight: 1.5,
                color: "#5A5A5A",
                maxWidth: 680,
              }}
            >
              Each module tracks one piece of the AI power buildout. Pick the one closest to what you already follow.
            </p>
          </div>
        </div>

        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          style={{ gap: "clamp(20px, 2vw, 32px)" }}
        >
          {MODULES.map((m) => (
            <ModuleCard key={m.number} module={m} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ModuleCard({ module: m }: { module: ModuleEntry }) {
  return (
    <Link
      href={m.route}
      className="module-card"
      style={{
        border: "1px solid #E5E5E5",
        borderRadius: 4,
        padding: "28px 24px",
        background: "#F7F7F8",
      }}
      data-testid={`module-card-${m.name.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div
        className="anchor-section-num"
        style={{ color: "#5A5A5A", marginBottom: 12, fontSize: 13 }}
      >
        {m.number}
      </div>
      <h3
        className="module-card-title"
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 22,
          fontWeight: 600,
          color: "#111111",
          marginBottom: 10,
          letterSpacing: "-0.005em",
        }}
      >
        {m.name}
      </h3>
      <p
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 14,
          lineHeight: 1.55,
          color: "#5A5A5A",
          marginBottom: 24,
          minHeight: 64,
        }}
      >
        {m.caption}
      </p>
      <div
        style={{
          border: "1px solid #E5E5E5",
          borderRadius: 4,
          background: "#FFFFFF",
          aspectRatio: "16 / 9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <img
          src={m.preview}
          alt={`${m.name} preview`}
          style={{ maxWidth: "100%", maxHeight: "100%", display: "block" }}
        />
      </div>
      <div
        className="module-card-cta"
        style={{
          marginTop: 16,
          fontFamily: "Inter, sans-serif",
          fontSize: 14,
          fontWeight: 500,
          color: "#111111",
          display: "inline-block",
        }}
      >
        Open →
      </div>
    </Link>
  );
}
