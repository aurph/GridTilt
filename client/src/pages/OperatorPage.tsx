import { useParams, Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Building2 } from "lucide-react";

const OPERATOR_META: Record<string, { name: string; description: string; strategy: string }> = {
  "google": {
    name: "Google",
    description: "Google operates one of the largest hyperscale data center portfolios globally. Major US facilities span Oregon, South Carolina, Nevada, and Virginia. Google contracted with Kairos Power for a fluoride salt-cooled reactor.",
    strategy: "Google favors locations near hydroelectric and renewable power. Their Dalles, Oregon campus uses Columbia River hydropower. Southeast expansion (Georgia, South Carolina) relies on direct utility partnerships.",
  },
  "amazon": {
    name: "Amazon",
    description: "AWS is the largest cloud infrastructure provider. It operates dozens of US data centers. AWS committed $105B in 2025 capex, driven by AI compute demand.",
    strategy: "AWS clusters facilities in Northern Virginia, Oregon, and Ohio. Expansion into Mississippi and Indiana targets lower-cost power. AWS signed nuclear agreements with Talen Energy.",
  },
  "meta": {
    name: "Meta",
    description: "Meta operates hyperscale data centers for AI training with $65B in 2025 capex. Meta issued a 6.6 GW nuclear RFP, the largest corporate nuclear procurement to date.",
    strategy: "Meta concentrates facilities in Iowa, Oregon, and Georgia near renewable sources. The 6.6 GW nuclear RFP marks a shift toward baseload procurement.",
  },
  "microsoft": {
    name: "Microsoft",
    description: "Microsoft Azure has $83B in 2025 capex. Microsoft contracted with Constellation Energy to restart Three Mile Island Unit 1 for dedicated nuclear baseload power.",
    strategy: "Microsoft's data centers span Virginia, Iowa, Arizona, and Texas. The TMI restart provides 835 MW of carbon-free baseload to Azure operations.",
  },
  "oracle": {
    name: "Oracle",
    description: "Oracle Cloud Infrastructure (OCI) is expanding AI data center capacity. Multiple large facilities are under construction. Oracle has partnered with SMR developers for power solutions.",
    strategy: "Oracle targets secondary markets with available power and land. Recent sites in Texas, Mississippi, and Georgia focus on 100+ MW campus designs.",
  },
  "coreweave": {
    name: "CoreWeave",
    description: "CoreWeave is a pure-play AI cloud provider specializing in GPU compute. The company has raised over $12B and is building GPU-dense data centers.",
    strategy: "CoreWeave builds high power density facilities (40+ kW per rack). Sites are concentrated in the Midwest and Northeast near available grid capacity.",
  },
  "xai": {
    name: "xAI",
    description: "xAI is building one of the largest AI training clusters. The Colossus facility in Memphis runs 100,000+ H100 GPUs and consumes over 150 MW.",
    strategy: "xAI prioritizes compute density over geographic diversification. Colossus was built in 119 days using gas turbines while awaiting grid interconnection.",
  },
  "openai": {
    name: "OpenAI",
    description: "OpenAI relies on Microsoft Azure for most of its compute. The Stargate joint venture with SoftBank will build dedicated AI data center campuses.",
    strategy: "Stargate is a $100B+ venture planning dedicated AI campuses across the US. Initial sites target Texas and other power-rich markets.",
  },
};

const ALL_OPERATORS = Object.keys(OPERATOR_META);

export default function OperatorPage() {
  const { slug } = useParams<{ slug: string }>();
  const operator = slug ? OPERATOR_META[slug] : null;

  if (!operator) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <Card className="p-8 border-card-border text-center">
          <AlertTriangle className="h-8 w-8 text-negative mx-auto mb-3" />
          <h1 className="text-lg font-semibold mb-2">Operator Not Found</h1>
          <p className="text-sm text-muted-foreground">
            <Link href="/power-map" className="text-brand">View the Power Map</Link> to see all operators.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <nav className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="breadcrumb">
        <Link href="/" className="hover:text-foreground">GridTilt</Link>
        <span>/</span>
        <Link href="/power-map" className="hover:text-foreground">Power Map</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{operator.name}</span>
      </nav>

      <div>
        <div className="flex items-center gap-3 mb-2">
          <Building2 className="h-5 w-5 text-brand" />
          <h1 className="text-2xl font-bold" data-testid="operator-heading">{operator.name} AI Data Centers</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl mb-4">{operator.description}</p>
      </div>

      <Card className="p-5 border-card-border" data-testid="operator-strategy">
        <h2 className="text-[13px] font-semibold text-foreground mb-3">Geographic Strategy</h2>
        <p className="text-sm text-muted-foreground">{operator.strategy}</p>
      </Card>

      <Card className="p-5 border-card-border" data-testid="operator-map-link">
        <h2 className="text-[13px] font-semibold text-foreground mb-3">Facilities on the Map</h2>
        <p className="text-sm text-muted-foreground mb-3">
          View all {operator.name} data center facilities on the interactive Power Map.
        </p>
        <Link
          href={`/power-map?company=${slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-brand hover:text-brand-2 font-medium"
          data-testid="link-filtered-map"
        >
          Open Power Map filtered to {operator.name}
        </Link>
      </Card>

      <Card className="p-5 border-card-border" data-testid="other-operators">
        <h2 className="text-[13px] font-semibold text-foreground mb-3">Other Operators</h2>
        <div className="flex flex-wrap gap-2">
          {ALL_OPERATORS.filter((o) => o !== slug).map((o) => (
            <Link key={o} href={`/operator/${o}`}>
              <Badge className="bg-muted/50 text-muted-foreground hover:bg-muted/70 cursor-pointer" data-testid={`link-operator-${o}`}>
                {OPERATOR_META[o].name}
              </Badge>
            </Link>
          ))}
        </div>
      </Card>

      <Card className="p-5 border-card-border">
        <h2 className="text-[13px] font-semibold text-foreground mb-3">Related Tools</h2>
        <div className="space-y-2 text-sm">
          <Link href="/power-map" className="block text-brand hover:text-brand-2">Power Map</Link>
          <Link href="/trade" className="block text-brand hover:text-brand-2">Scenario Calculator</Link>
          <Link href="/catalysts" className="block text-brand hover:text-brand-2">Catalyst Tracker</Link>
        </div>
      </Card>
    </div>
  );
}
