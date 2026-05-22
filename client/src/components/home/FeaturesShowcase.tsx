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
    caption: "Sixty-plus public companies behind the AI buildout, priced live.",
    cta: "Open the stack",
    preview: stackSvg,
    route: "/stack",
  },
  {
    number: "02",
    name: "Power Map",
    caption: "Forty-eight AI data centers, plotted by operator and grid region.",
    cta: "Open the map",
    preview: powerMapSvg,
    route: "/power-map",
  },
  {
    number: "03",
    name: "Supply Chain",
    caption: "Twenty places the buildout can get stuck, mapped to the companies exposed.",
    cta: "Trace the chain",
    preview: supplyChainSvg,
    route: "/supply-chain",
  },
  {
    number: "04",
    name: "Catalyst Tracker",
    caption: "Earnings dates, rule changes, and policy votes. One calendar.",
    cta: "See what's next",
    preview: catalystSvg,
    route: "/catalysts",
  },
  {
    number: "05",
    name: "Portfolio Overlay",
    caption: "Type a ticker. See how exposed it is to the AI power story.",
    cta: "Score a ticker",
    preview: portfolioSvg,
    route: "/portfolio",
  },
  {
    number: "06",
    name: "Scenario Calculator",
    caption: "Pick how fast AI grows. See what it does to the grid by 2030.",
    cta: "Run a scenario",
    preview: calculatorSvg,
    route: "/trade",
  },
];

export function FeaturesShowcase() {
  return (
    <section
      id="stack"
      style={{
        position: "relative",
        paddingTop: "clamp(96px, 14vh, 160px)",
        paddingBottom: "clamp(96px, 14vh, 160px)",
      }}
      data-testid="home-features"
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
        <div style={{ marginBottom: "clamp(56px, 9vh, 88px)", maxWidth: 900 }}>
          <h2 className="gt-section-heading" style={{ marginBottom: 24 }}>
            Six places to start.
          </h2>
          <p className="gt-section-dek">
            Each shows a different slice of the buildout. Pick the one closest to what you already follow.
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
              data-testid={`feature-card-${m.name.toLowerCase().replace(/\s+/g, "-")}`}
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
