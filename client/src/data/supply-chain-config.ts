export type BottleneckStatus = "flowing" | "tightening" | "bottlenecked";

export interface StageCompany {
  ticker: string;
  name: string;
  subcategory: string;
}

export interface StageMetric {
  value: string;
  label: string;
}

export interface SubCategory {
  icon: string;
  label: string;
}

export interface StageConfig {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  accentColor: string;
  bottleneck: {
    status: BottleneckStatus;
    barFill: number;
  };
  description: string;
  subCategories: SubCategory[];
  keyMetrics: StageMetric[];
  companies: StageCompany[];
}

export const supplyChainConfig: { stages: StageConfig[] } = {
  stages: [
    {
      id: "raw-materials",
      name: "Raw Materials",
      tagline: "Where it comes from",
      icon: "Mountain",
      accentColor: "#C87533",
      bottleneck: {
        status: "tightening",
        barFill: 0.6,
      },
      subCategories: [
        { icon: "Atom", label: "Uranium" },
        { icon: "CircleDot", label: "Copper" },
        { icon: "Wrench", label: "Steel" },
        { icon: "Cog", label: "Rare Earth" },
      ],
      description:
        "The AI power buildout starts here with the raw inputs needed to build and fuel power infrastructure. Copper wiring, uranium fuel, steel for transformers, and rare earth elements for generators. Copper prices have climbed above $14,000/ton, uranium spot is at $93/lb, and electrical steel lead times sit at 8-12 months. Mining capacity takes years to expand, creating persistent tightness.",
      keyMetrics: [
        { value: "$14,200/ton", label: "Copper price" },
        { value: "$93/lb", label: "Uranium spot" },
        { value: "8-12 mo", label: "Electrical steel lead time" },
      ],
      companies: [
        { ticker: "CCJ", name: "Cameco Corporation", subcategory: "Uranium mining" },
        { ticker: "UEC", name: "Uranium Energy Corp", subcategory: "Uranium mining" },
        { ticker: "NXE", name: "NexGen Energy", subcategory: "Uranium development" },
        { ticker: "DNN", name: "Denison Mines", subcategory: "Uranium mining" },
        { ticker: "UUUU", name: "Energy Fuels", subcategory: "Uranium/rare earth" },
        { ticker: "LEU", name: "Centrus Energy", subcategory: "Uranium enrichment" },
        { ticker: "FCX", name: "Freeport-McMoRan", subcategory: "Copper mining" },
        { ticker: "SCCO", name: "Southern Copper", subcategory: "Copper mining" },
        { ticker: "TECK", name: "Teck Resources", subcategory: "Diversified mining" },
        { ticker: "HBM", name: "Hudbay Minerals", subcategory: "Copper/zinc mining" },
        { ticker: "NUE", name: "Nucor Corporation", subcategory: "Steel production" },
        { ticker: "STLD", name: "Steel Dynamics", subcategory: "Steel production" },
        { ticker: "CLF", name: "Cleveland-Cliffs", subcategory: "Steel production" },
        { ticker: "X", name: "US Steel", subcategory: "Steel production" },
        { ticker: "MP", name: "MP Materials", subcategory: "Rare earth mining" },
        { ticker: "BHP", name: "BHP Group", subcategory: "Diversified mining" },
        { ticker: "RIO", name: "Rio Tinto", subcategory: "Diversified mining" },
        { ticker: "VALE", name: "Vale S.A.", subcategory: "Diversified mining" },
        { ticker: "AR", name: "Antero Resources", subcategory: "Natural gas" },
        { ticker: "EQT", name: "EQT Corporation", subcategory: "Natural gas" },
        { ticker: "RRC", name: "Range Resources", subcategory: "Natural gas" },
        { ticker: "SWN", name: "Southwestern Energy", subcategory: "Natural gas" },
        { ticker: "LNG", name: "Cheniere Energy", subcategory: "LNG export" },
        { ticker: "COPX", name: "Copper Miners ETF", subcategory: "Copper ETF" },
      ],
    },
    {
      id: "generation",
      name: "Generation",
      tagline: "How it's made",
      icon: "Zap",
      accentColor: "#F07800",
      bottleneck: {
        status: "tightening",
        barFill: 0.55,
      },
      subCategories: [
        { icon: "Radiation", label: "Nuclear" },
        { icon: "Flame", label: "Gas Turbines" },
        { icon: "Sun", label: "Solar" },
        { icon: "FlaskConical", label: "SMRs" },
      ],
      description:
        "Once raw materials are sourced, they feed into power generation. Nuclear plants, gas turbines, solar farms, and the next generation of small modular reactors. Gas turbine order books are at record highs. Nuclear restarts (Three Mile Island, Palisades) are being fast-tracked for the first time in decades. GE Vernova alone has a $200B+ backlog. The bottleneck here is time. Building new generation capacity takes 3-7 years.",
      keyMetrics: [
        { value: "$200B+", label: "GEV order backlog" },
        { value: "3-7 years", label: "New plant build time" },
        { value: "22 GW", label: "CEG nuclear fleet" },
      ],
      companies: [
        { ticker: "CEG", name: "Constellation Energy", subcategory: "Nuclear generation" },
        { ticker: "VST", name: "Vistra Corp", subcategory: "Merchant power" },
        { ticker: "TLN", name: "Talen Energy", subcategory: "Merchant power" },
        { ticker: "NRG", name: "NRG Energy", subcategory: "Merchant power" },
        { ticker: "GEV", name: "GE Vernova", subcategory: "Gas turbines" },
        { ticker: "SIEGY", name: "Siemens Energy", subcategory: "Gas turbines" },
        { ticker: "BKR", name: "Baker Hughes", subcategory: "Gas technology" },
        { ticker: "SMR", name: "NuScale Power", subcategory: "Small modular reactors" },
        { ticker: "OKLO", name: "Oklo Inc", subcategory: "Advanced nuclear" },
        { ticker: "BWXT", name: "BWX Technologies", subcategory: "Nuclear components" },
        { ticker: "NEE", name: "NextEra Energy", subcategory: "Renewables + utility" },
        { ticker: "AES", name: "AES Corporation", subcategory: "Diversified generation" },
        { ticker: "FSLR", name: "First Solar", subcategory: "Solar manufacturing" },
        { ticker: "ENPH", name: "Enphase Energy", subcategory: "Solar inverters" },
        { ticker: "SEDG", name: "SolarEdge Technologies", subcategory: "Solar inverters" },
        { ticker: "SO", name: "Southern Company", subcategory: "Regulated utility" },
        { ticker: "DUK", name: "Duke Energy", subcategory: "Regulated utility" },
        { ticker: "AEP", name: "American Electric Power", subcategory: "Regulated utility" },
      ],
    },
    {
      id: "transmission",
      name: "Transmission",
      tagline: "How it moves",
      icon: "Cable",
      accentColor: "#F0A500",
      bottleneck: {
        status: "bottlenecked",
        barFill: 0.9,
      },
      subCategories: [
        { icon: "Zap", label: "Transformers" },
        { icon: "Plug", label: "HV Cable" },
        { icon: "Construction", label: "Line Build" },
      ],
      description:
        "After electricity is generated, it needs to travel hundreds of miles over high-voltage transmission lines and through large power transformers to reach demand centers. This is the tightest bottleneck in the entire AI power chain. The US manufactures roughly 60 large power transformers per year. The AI buildout alone could require 200-500 over the next five years. Lead times have stretched to 18-36 months. Companies here have multi-year backlogs and significant pricing power.",
      keyMetrics: [
        { value: "18-36 mo", label: "Transformer lead time" },
        { value: "~60/yr", label: "US LPT production" },
        { value: "200-500", label: "Needed over 5 years" },
      ],
      companies: [
        { ticker: "ETN", name: "Eaton Corporation", subcategory: "Power management" },
        { ticker: "PWR", name: "Quanta Services", subcategory: "Grid construction" },
        { ticker: "EMR", name: "Emerson Electric", subcategory: "Grid automation" },
        { ticker: "HUBB", name: "Hubbell Inc", subcategory: "Electrical products" },
        { ticker: "AYI", name: "Acuity Brands", subcategory: "Grid infrastructure" },
        { ticker: "AOS", name: "A.O. Smith", subcategory: "Grid components" },
        { ticker: "GNRC", name: "Generac Holdings", subcategory: "Backup power" },
        { ticker: "IDA", name: "IDACORP", subcategory: "Transmission utility" },
        { ticker: "NVT", name: "nVent Electric", subcategory: "Electrical connections" },
      ],
    },
    {
      id: "distribution",
      name: "Distribution",
      tagline: "How it connects",
      icon: "Network",
      accentColor: "#22C55E",
      bottleneck: {
        status: "tightening",
        barFill: 0.5,
      },
      subCategories: [
        { icon: "Snowflake", label: "Cooling" },
        { icon: "Wrench", label: "Switchgear" },
        { icon: "Building2", label: "DC Construction" },
      ],
      description:
        "Distribution is the last mile. Getting power from the transmission network into the data center. This stage includes switchgear, substations, UPS systems, cooling, and the physical construction of data center facilities. Switchgear backlogs have grown to 2-3 years. Cooling demand is surging as AI chip power density increases. The construction pipeline for data center infrastructure is the largest in history.",
      keyMetrics: [
        { value: "2-3 years", label: "Switchgear backlog" },
        { value: "125% YoY", label: "DC construction growth" },
        { value: "$40B+", label: "Annual DC capex" },
      ],
      companies: [
        { ticker: "VRT", name: "Vertiv Holdings", subcategory: "Data center power/cooling" },
        { ticker: "CARR", name: "Carrier Global", subcategory: "Cooling systems" },
        { ticker: "JCI", name: "Johnson Controls", subcategory: "Building management" },
        { ticker: "EME", name: "EMCOR Group", subcategory: "DC construction" },
        { ticker: "MTZ", name: "MasTec Inc", subcategory: "Infrastructure construction" },
        { ticker: "STRL", name: "Sterling Infrastructure", subcategory: "DC construction" },
        { ticker: "FLR", name: "Fluor Corporation", subcategory: "Engineering/construction" },
        { ticker: "PRIM", name: "Primoris Services", subcategory: "Specialty construction" },
      ],
    },
    {
      id: "end-use",
      name: "End Use",
      tagline: "Where it goes",
      icon: "Server",
      accentColor: "#A855F7",
      bottleneck: {
        status: "flowing",
        barFill: 0.3,
      },
      subCategories: [
        { icon: "Monitor", label: "Hyperscalers" },
        { icon: "BarChart3", label: "DC REITs" },
        { icon: "Cpu", label: "Compute" },
        { icon: "Pickaxe", label: "Miners" },
      ],
      description:
        "This is where the power is consumed. Hyperscale data centers operated by Amazon, Microsoft, Google, and Meta, along with colocation providers like Equinix and Digital Realty, and specialized AI/crypto operators. Demand here is effectively unlimited. The constraint is not willingness to build. It is getting power to the site. 48 tracked facilities representing 20.7 GW of capacity, with more announced monthly.",
      keyMetrics: [
        { value: "48", label: "Tracked facilities" },
        { value: "20.7 GW", label: "Total capacity" },
        { value: "273", label: "Equinix DCs worldwide" },
      ],
      companies: [
        { ticker: "EQIX", name: "Equinix Inc", subcategory: "Colocation REIT" },
        { ticker: "DLR", name: "Digital Realty", subcategory: "Colocation REIT" },
        { ticker: "AMT", name: "American Tower", subcategory: "Infrastructure REIT" },
        { ticker: "NVDA", name: "NVIDIA Corporation", subcategory: "AI chips" },
        { ticker: "AMD", name: "Advanced Micro Devices", subcategory: "AI chips" },
        { ticker: "AVGO", name: "Broadcom Inc", subcategory: "Networking silicon" },
        { ticker: "TSM", name: "Taiwan Semiconductor", subcategory: "Chip fabrication" },
        { ticker: "MU", name: "Micron Technology", subcategory: "Memory/HBM" },
        { ticker: "INTC", name: "Intel Corporation", subcategory: "Chip fabrication" },
        { ticker: "SMCI", name: "Super Micro Computer", subcategory: "AI servers" },
        { ticker: "META", name: "Meta Platforms", subcategory: "Hyperscaler" },
        { ticker: "AMZN", name: "Amazon.com", subcategory: "Hyperscaler (AWS)" },
        { ticker: "MSFT", name: "Microsoft", subcategory: "Hyperscaler (Azure)" },
        { ticker: "GOOGL", name: "Alphabet Inc", subcategory: "Hyperscaler (GCP)" },
        { ticker: "AAPL", name: "Apple Inc", subcategory: "Hyperscaler" },
        { ticker: "IREN", name: "IREN Limited", subcategory: "AI/crypto operator" },
        { ticker: "CLSK", name: "CleanSpark Inc", subcategory: "AI/crypto operator" },
        { ticker: "MARA", name: "MARA Holdings", subcategory: "AI/crypto operator" },
        { ticker: "DELL", name: "Dell Technologies", subcategory: "AI servers" },
        { ticker: "ANET", name: "Arista Networks", subcategory: "DC networking" },
        { ticker: "MRVL", name: "Marvell Technology", subcategory: "DC silicon" },
      ],
    },
  ],
};
