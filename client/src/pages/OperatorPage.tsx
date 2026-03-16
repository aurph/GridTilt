import { useParams, Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Building2 } from "lucide-react";

const OPERATOR_META: Record<string, { name: string; description: string; strategy: string }> = {
  "google": {
    name: "Google",
    description: "Google operates one of the largest hyperscale data center portfolios globally, with significant US facilities across Oregon, South Carolina, Nevada, and Virginia. Google has been an early mover in nuclear power procurement, contracting with Kairos Power for a fluoride salt-cooled reactor.",
    strategy: "Google favors locations near hydroelectric and renewable power sources. Their Dalles, Oregon campus leverages Columbia River hydropower. Recent expansion focuses on the Southeast (Georgia, South Carolina) with direct utility partnerships.",
  },
  "amazon": {
    name: "Amazon",
    description: "Amazon Web Services (AWS) is the largest cloud infrastructure provider, operating dozens of data centers across the US. AWS has committed to $105B in 2025 capex, the largest of any hyperscaler, driven by AI compute demand.",
    strategy: "AWS clusters facilities in Northern Virginia (us-east-1), Oregon (us-west-2), and Ohio. Recent expansion into Mississippi and Indiana targets lower-cost power markets. AWS has signed nuclear power agreements with Talen Energy.",
  },
  "meta": {
    name: "Meta",
    description: "Meta Platforms operates hyperscale data centers supporting AI training infrastructure, with $65B committed in 2025 capex. Meta issued a 6.6 GW nuclear power RFP, the largest single corporate nuclear procurement in history.",
    strategy: "Meta concentrates facilities in Iowa, Oregon, and Georgia, favoring locations with renewable energy access. The 6.6 GW nuclear RFP signals a strategic shift toward baseload power procurement at unprecedented scale.",
  },
  "microsoft": {
    name: "Microsoft",
    description: "Microsoft Azure operates a global cloud infrastructure with $83B in 2025 capex. Microsoft has signed the most high-profile nuclear power agreement in the sector, contracting with Constellation Energy to restart Three Mile Island Unit 1.",
    strategy: "Microsoft's data center portfolio spans Virginia, Iowa, Arizona, and Texas. The Three Mile Island restart deal with Constellation Energy represents 835 MW of carbon-free baseload power, setting a precedent for hyperscaler nuclear procurement.",
  },
  "oracle": {
    name: "Oracle",
    description: "Oracle Cloud Infrastructure (OCI) is rapidly expanding AI data center capacity, with multiple large-scale facilities under construction. Oracle has partnered with SMR developers for next-generation power solutions.",
    strategy: "Oracle targets secondary markets with available power and land. Recent facility announcements in Texas, Mississippi, and Georgia focus on 100+ MW campus designs optimized for AI training workloads.",
  },
  "coreweave": {
    name: "CoreWeave",
    description: "CoreWeave is a pure-play AI cloud infrastructure provider specializing in GPU compute. The company has raised over $12B in funding and is building out a network of GPU-dense data centers optimized for AI workloads.",
    strategy: "CoreWeave builds purpose-built AI compute facilities with high power density (40+ kW per rack). Facilities are concentrated in the Midwest and Northeast, with a focus on regions with available grid capacity.",
  },
  "xai": {
    name: "xAI",
    description: "xAI, founded by Elon Musk, is building one of the largest AI training clusters in the world. The Colossus facility in Memphis, Tennessee runs 100,000+ NVIDIA H100 GPUs and consumes over 150 MW of power.",
    strategy: "xAI's strategy prioritizes raw compute density over geographic diversification. The Memphis Colossus facility was built in record time (119 days) using gas turbine generators for initial power while grid interconnection is completed.",
  },
  "openai": {
    name: "OpenAI",
    description: "OpenAI, the creator of ChatGPT, relies on Microsoft Azure for the majority of its compute infrastructure. OpenAI has announced plans for its own data center facilities through the Stargate joint venture with SoftBank.",
    strategy: "OpenAI's Stargate project, a $100B+ joint venture with SoftBank, plans to build dedicated AI data center campuses across the US. Initial sites are planned in Texas and other power-rich markets.",
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
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-3" />
          <h1 className="text-lg font-semibold mb-2">Operator Not Found</h1>
          <p className="text-sm text-muted-foreground">
            <Link href="/power-map" className="text-[#F07800]">View the Power Map</Link> to see all operators.
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
          <Building2 className="h-5 w-5 text-[#F07800]" />
          <h1 className="text-2xl font-bold" data-testid="operator-heading">{operator.name} AI Data Centers</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl mb-4">{operator.description}</p>
      </div>

      <Card className="p-5 border-card-border" data-testid="operator-strategy">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Geographic Strategy</h2>
        <p className="text-sm text-muted-foreground">{operator.strategy}</p>
      </Card>

      <Card className="p-5 border-card-border" data-testid="operator-map-link">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Facilities on the Map</h2>
        <p className="text-sm text-muted-foreground mb-3">
          View all {operator.name} data center facilities on the interactive Power Map.
        </p>
        <Link
          href={`/power-map?company=${slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-[#F07800] hover:text-[#F0A500] font-medium"
          data-testid="link-filtered-map"
        >
          Open Power Map filtered to {operator.name}
        </Link>
      </Card>

      <Card className="p-5 border-card-border" data-testid="other-operators">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Other Operators</h2>
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
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Related Tools</h2>
        <div className="space-y-2 text-sm">
          <Link href="/power-map" className="block text-[#F07800] hover:text-[#F0A500]">Power Map</Link>
          <Link href="/trade" className="block text-[#F07800] hover:text-[#F0A500]">Thesis Calculator</Link>
          <Link href="/catalysts" className="block text-[#F07800] hover:text-[#F0A500]">Catalyst Tracker</Link>
        </div>
      </Card>
    </div>
  );
}
