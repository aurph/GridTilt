import { Link } from "wouter";
import catalystSvg from "@assets/previews/catalyst.svg";
import supplyChainSvg from "@assets/previews/supply-chain.svg";
import powerMapSvg from "@assets/previews/power-map.svg";
import stackSvg from "@assets/previews/stack.svg";
import portfolioSvg from "@assets/previews/portfolio.svg";
import calculatorSvg from "@assets/previews/calculator.svg";

const HORIZ_PAD = "clamp(24px, 5vw, 96px)";

interface Module {
  number: string;
  name: string;
  caption: string;
  cta: string;
  preview: string;
  route: string;
}

const MODULES: Module[] = [
  {
    number: "01",
    name: "The Stack",
    caption:
      "Sixty-plus equities across nine layers of the AI power stack, priced live.",
    cta: "Open the stack",
    preview: stackSvg,
    route: "/stack",
  },
  {
    number: "02",
    name: "Power Map",
    caption:
      "Forty-eight AI data centers plotted by operator, grid region, and announced capacity.",
    cta: "Open the map",
    preview: powerMapSvg,
    route: "/power-map",
  },
  {
    number: "03",
    name: "Supply Chain",
    caption:
      "Twenty bottlenecks from silicon to substation, each tied to the equities exposed.",
    cta: "Trace the chain",
    preview: supplyChainSvg,
    route: "/supply-chain",
  },
  {
    number: "04",
    name: "Catalyst Tracker",
    caption:
      "Earnings dates, regulatory rulings, and policy votes that move these names — on one calendar.",
    cta: "See what's next",
    preview: catalystSvg,
    route: "/catalysts",
  },
  {
    number: "05",
    name: "Portfolio Overlay",
    caption:
      "Score any ticker against the AI power thesis: nuclear, grid stress, and demand pressure.",
    cta: "Score a ticker",
    preview: portfolioSvg,
    route: "/portfolio",
  },
  {
    number: "06",
    name: "Scenario Calculator",
    caption:
      "Model US AI electricity demand to 2030 with three presets and assumptions you can edit.",
    cta: "Run a scenario",
    preview: calculatorSvg,
    route: "/trade",
  },
];

export function FeaturesShowcase() {
  return (
    <section
      style={{
        position: "relative",
        paddingTop: "clamp(80px, 12vh, 160px)",
        paddingBottom: "clamp(80px, 12vh, 160px)",
      }}
      data-testid="home-features"
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
        <div style={{ marginBottom: "clamp(56px, 8vh, 96px)" }}>
          <div className="gt-eyebrow" style={{ marginBottom: 28 }}>
            What we track
          </div>
          <h2
            className="gt-section-heading"
            style={{ marginBottom: 28, maxWidth: 920 }}
          >
            Six instruments.
            <br />
            <span style={{ color: "var(--mkt-ink-muted)" }}>One thesis.</span>
          </h2>
          <p className="gt-section-dek">
            Each module isolates one piece of the AI power buildout. Open the
            one closest to what you already follow.
          </p>
        </div>

        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          style={{ gap: "clamp(14px, 1.6vw, 22px)" }}
        >
          {MODULES.map((m) => (
            <Link
              key={m.number}
              href={m.route}
              className="gt-feature-card"
              data-testid={`feature-card-${m.name
                .toLowerCase()
                .replace(/\s+/g, "-")}`}
            >
              <div className="gt-feature-card__num">
                <span>{m.number}</span>
              </div>
              <h3 className="gt-feature-card__title">{m.name}</h3>
              <p className="gt-feature-card__caption">{m.caption}</p>
              <div className="gt-feature-card__preview">
                <img src={m.preview} alt={`${m.name} preview`} />
              </div>
              <span className="gt-feature-card__cta">
                <span>{m.cta}</span>
                <span aria-hidden>→</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
