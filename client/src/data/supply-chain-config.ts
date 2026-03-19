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

export interface SubSystem {
  id: string;
  name: string;
  parentStage: string;
  icon: string;
  oneLiner: string;
  description: string;
  keyMetrics: { value: string; label: string }[];
  companies: { ticker: string; name: string }[];
}

export const subSystems: SubSystem[] = [
  {
    id: 'uranium',
    name: 'Uranium',
    parentStage: 'raw-materials',
    icon: 'Atom',
    oneLiner: 'Nuclear fuel for baseload power',
    description: 'Uranium is the fuel source for nuclear power plants. Spot prices have risen to $93/lb as demand grows from both the existing fleet and planned new reactors. Enrichment capacity is a secondary bottleneck. Centrus Energy is the only US company producing HALEU fuel for next-gen reactors. Mining expansion takes 5-10 years from discovery to production.',
    keyMetrics: [
      { value: '$93/lb', label: 'Spot price' },
      { value: '5-10 yr', label: 'Mine development time' },
    ],
    companies: [
      { ticker: 'CCJ', name: 'Cameco' },
      { ticker: 'UEC', name: 'Uranium Energy' },
      { ticker: 'NXE', name: 'NexGen Energy' },
      { ticker: 'DNN', name: 'Denison Mines' },
      { ticker: 'UUUU', name: 'Energy Fuels' },
      { ticker: 'LEU', name: 'Centrus Energy' },
    ],
  },
  {
    id: 'copper',
    name: 'Copper',
    parentStage: 'raw-materials',
    icon: 'Circle',
    oneLiner: 'The wiring of the entire grid',
    description: 'Copper is in everything. Transmission lines, transformer windings, switchgear, data center cabling. AI data centers could require 475,000 additional tons annually by 2026. Prices above $14,000/ton reflect tightening supply against accelerating demand. Major mining expansions in Chile and Peru are years from production.',
    keyMetrics: [
      { value: '$14,200/ton', label: 'Copper price' },
      { value: '475K tons', label: 'Annual AI demand est.' },
    ],
    companies: [
      { ticker: 'FCX', name: 'Freeport-McMoRan' },
      { ticker: 'SCCO', name: 'Southern Copper' },
      { ticker: 'TECK', name: 'Teck Resources' },
      { ticker: 'HBM', name: 'Hudbay Minerals' },
    ],
  },
  {
    id: 'steel',
    name: 'Steel',
    parentStage: 'raw-materials',
    icon: 'Wrench',
    oneLiner: 'Transformer cores and structural frames',
    description: 'Grain-oriented electrical steel is the core material inside every power transformer. Lead times have stretched to 8-12 months. Cleveland-Cliffs is one of the few US producers. Standard structural steel is also needed in massive quantities for data center construction and transmission tower fabrication.',
    keyMetrics: [
      { value: '8-12 mo', label: 'Electrical steel lead time' },
    ],
    companies: [
      { ticker: 'NUE', name: 'Nucor' },
      { ticker: 'STLD', name: 'Steel Dynamics' },
      { ticker: 'CLF', name: 'Cleveland-Cliffs' },
      { ticker: 'X', name: 'US Steel' },
    ],
  },
  {
    id: 'rare-earth',
    name: 'Rare Earth',
    parentStage: 'raw-materials',
    icon: 'Gem',
    oneLiner: 'Magnets for generators and motors',
    description: 'Rare earth elements like neodymium and praseodymium are essential for permanent magnets in wind turbines and electric generators. MP Materials operates the only active rare earth mine in the US. China controls ~60% of global mining and ~90% of processing, making supply chain diversification a national security priority.',
    keyMetrics: [
      { value: '~60%', label: 'China mining share' },
      { value: '~90%', label: 'China processing share' },
    ],
    companies: [
      { ticker: 'MP', name: 'MP Materials' },
    ],
  },
  {
    id: 'natural-gas',
    name: 'Natural Gas',
    parentStage: 'raw-materials',
    icon: 'Flame',
    oneLiner: 'Bridge fuel powering gas turbines',
    description: 'Natural gas is the primary fuel for gas turbine power plants, which are the fastest new generation to build (2-3 years vs 7+ for nuclear). US gas production is at record highs. LNG exports add global demand pressure. Gas prices directly affect the operating cost of every gas-fired power plant serving data centers.',
    keyMetrics: [
      { value: 'Record', label: 'US production' },
    ],
    companies: [
      { ticker: 'AR', name: 'Antero Resources' },
      { ticker: 'EQT', name: 'EQT Corporation' },
      { ticker: 'RRC', name: 'Range Resources' },
      { ticker: 'LNG', name: 'Cheniere Energy' },
    ],
  },
  {
    id: 'nuclear',
    name: 'Nuclear',
    parentStage: 'generation',
    icon: 'Radiation',
    oneLiner: 'Baseload power from fission',
    description: 'Nuclear is experiencing an unprecedented revival. Constellation is restarting TMI Unit 1 for Microsoft. Palisades may become the first US reactor ever restarted. NuScale and Oklo are racing on small modular reactors. Nuclear provides 24/7 carbon-free baseload power. Exactly what AI data centers need.',
    keyMetrics: [
      { value: '22 GW', label: 'CEG fleet capacity' },
      { value: '6 plants', label: 'Restart candidates' },
      { value: '2028', label: 'TMI target restart' },
    ],
    companies: [
      { ticker: 'CEG', name: 'Constellation Energy' },
      { ticker: 'VST', name: 'Vistra' },
      { ticker: 'TLN', name: 'Talen Energy' },
      { ticker: 'SMR', name: 'NuScale Power' },
      { ticker: 'OKLO', name: 'Oklo Inc' },
      { ticker: 'BWXT', name: 'BWX Technologies' },
      { ticker: 'SO', name: 'Southern Company' },
    ],
  },
  {
    id: 'gas-turbines',
    name: 'Gas Turbines',
    parentStage: 'generation',
    icon: 'Gauge',
    oneLiner: 'Fastest path to new megawatts',
    description: 'Gas turbines are the fastest way to add new generation capacity. A combined-cycle gas plant can be built in 2-3 years. GE Vernova dominates the market with a $200B+ backlog. Siemens Energy and Baker Hughes compete for the rest. Order books are at all-time highs across the industry.',
    keyMetrics: [
      { value: '$200B+', label: 'GEV backlog' },
      { value: '2-3 yr', label: 'Build time' },
    ],
    companies: [
      { ticker: 'GEV', name: 'GE Vernova' },
      { ticker: 'SIEGY', name: 'Siemens Energy' },
      { ticker: 'BKR', name: 'Baker Hughes' },
      { ticker: 'NRG', name: 'NRG Energy' },
    ],
  },
  {
    id: 'solar',
    name: 'Solar',
    parentStage: 'generation',
    icon: 'Sun',
    oneLiner: 'Utility-scale renewable generation',
    description: 'Utility-scale solar is the cheapest new generation to build but intermittent. It only works when the sun shines. First Solar is the largest US panel manufacturer. NextEra Energy is the biggest renewable operator globally. Solar pairs with battery storage to provide more reliable output.',
    keyMetrics: [
      { value: 'Cheapest', label: 'LCOE for new gen' },
    ],
    companies: [
      { ticker: 'FSLR', name: 'First Solar' },
      { ticker: 'ENPH', name: 'Enphase Energy' },
      { ticker: 'SEDG', name: 'SolarEdge' },
      { ticker: 'NEE', name: 'NextEra Energy' },
      { ticker: 'AES', name: 'AES Corporation' },
    ],
  },
  {
    id: 'smrs',
    name: 'SMRs',
    parentStage: 'generation',
    icon: 'FlaskConical',
    oneLiner: 'Next-gen compact reactors',
    description: 'Small modular reactors are factory-built nuclear reactors with lower upfront costs and faster deployment than traditional plants. NuScale has NRC design certification. Oklo is backed by Sam Altman. Neither has a commercially operating reactor yet, but both are racing to deploy by the late 2020s.',
    keyMetrics: [
      { value: '2029-2030', label: 'First deployments est.' },
    ],
    companies: [
      { ticker: 'SMR', name: 'NuScale Power' },
      { ticker: 'OKLO', name: 'Oklo Inc' },
    ],
  },
  {
    id: 'transformers',
    name: 'Transformers',
    parentStage: 'transmission',
    icon: 'Plug',
    oneLiner: 'The tightest bottleneck in the chain',
    description: 'Large power transformers step voltage up for long-distance transmission and back down for distribution. The US makes about 60 per year. AI buildout needs 200-500 over 5 years. Each weighs up to 400,000 lbs and takes 12-18 months to manufacture. This is the single most constrained component in the entire AI power supply chain.',
    keyMetrics: [
      { value: '18-36 mo', label: 'Lead time' },
      { value: '~60/yr', label: 'US production' },
      { value: '200-500', label: 'Needed over 5yr' },
    ],
    companies: [
      { ticker: 'ETN', name: 'Eaton Corporation' },
      { ticker: 'ABB', name: 'ABB Ltd' },
      { ticker: 'EMR', name: 'Emerson Electric' },
      { ticker: 'HUBB', name: 'Hubbell Inc' },
    ],
  },
  {
    id: 'hv-cable',
    name: 'HV Cable',
    parentStage: 'transmission',
    icon: 'Cable',
    oneLiner: 'High-voltage wiring across the grid',
    description: 'High-voltage transmission cables carry power from generation plants to demand centers. Cable demand is growing as utilities rush to connect new generation sources to data center clusters, especially in Virginia, Texas, and the Midwest.',
    keyMetrics: [
      { value: 'Growing', label: 'Interconnect queue' },
    ],
    companies: [
      { ticker: 'NVT', name: 'nVent Electric' },
    ],
  },
  {
    id: 'line-construction',
    name: 'Line Construction',
    parentStage: 'transmission',
    icon: 'HardHat',
    oneLiner: 'Building the physical grid',
    description: 'Someone has to physically build the transmission lines, erect the towers, and install the cable. Quanta Services has the largest private high-voltage workforce in North America. Permitting and construction timelines are 5-10 years for new major lines.',
    keyMetrics: [
      { value: '5-10 yr', label: 'New line timeline' },
    ],
    companies: [
      { ticker: 'PWR', name: 'Quanta Services' },
      { ticker: 'IDA', name: 'IDACORP' },
      { ticker: 'AYI', name: 'Acuity Brands' },
      { ticker: 'GNRC', name: 'Generac' },
    ],
  },
  {
    id: 'cooling',
    name: 'Cooling',
    parentStage: 'distribution',
    icon: 'Snowflake',
    oneLiner: 'Keeping GPUs from melting',
    description: 'AI chips run hot. A single GPU rack can consume 40-70kW. Cooling systems from traditional CRAC units to liquid cooling loops are critical infrastructure. Vertiv and Carrier are the dominant players. As chip density increases with each GPU generation, cooling becomes a larger share of data center capex.',
    keyMetrics: [
      { value: '40-70kW', label: 'Per rack power' },
    ],
    companies: [
      { ticker: 'VRT', name: 'Vertiv Holdings' },
      { ticker: 'CARR', name: 'Carrier Global' },
      { ticker: 'JCI', name: 'Johnson Controls' },
    ],
  },
  {
    id: 'switchgear',
    name: 'Switchgear',
    parentStage: 'distribution',
    icon: 'ToggleRight',
    oneLiner: 'Routing power inside the facility',
    description: 'Switchgear controls and protects electrical circuits inside data centers and substations. Eaton and ABB dominate. Order backlogs have grown to 2-3 years as every new data center needs custom switchgear configurations. This is a quiet bottleneck that rarely makes headlines but slows every project.',
    keyMetrics: [
      { value: '2-3 yr', label: 'Order backlog' },
    ],
    companies: [
      { ticker: 'ETN', name: 'Eaton Corporation' },
      { ticker: 'ABB', name: 'ABB Ltd' },
    ],
  },
  {
    id: 'dc-construction',
    name: 'DC Construction',
    parentStage: 'distribution',
    icon: 'Building',
    oneLiner: 'Building the physical data centers',
    description: 'The actual construction of data center facilities. Site prep, structural build, electrical installation, mechanical systems. EMCOR, MasTec, and Sterling Infrastructure are the key contractors. Sterling saw 125% YoY growth in data center revenue. The construction pipeline is the largest in the industry\'s history.',
    keyMetrics: [
      { value: '125% YoY', label: 'STRL DC growth' },
      { value: '$40B+', label: 'Annual DC capex' },
    ],
    companies: [
      { ticker: 'EME', name: 'EMCOR Group' },
      { ticker: 'MTZ', name: 'MasTec' },
      { ticker: 'STRL', name: 'Sterling Infrastructure' },
      { ticker: 'FLR', name: 'Fluor Corporation' },
      { ticker: 'PRIM', name: 'Primoris Services' },
    ],
  },
  {
    id: 'power-mgmt',
    name: 'Power Mgmt',
    parentStage: 'distribution',
    icon: 'Battery',
    oneLiner: 'UPS and power distribution units',
    description: 'Uninterruptible power supplies, power distribution units, and backup generators ensure data centers never lose power. A single outage at a major facility can cost millions per minute. Vertiv and Eaton are the leading suppliers. Generac provides backup generation.',
    keyMetrics: [],
    companies: [
      { ticker: 'VRT', name: 'Vertiv Holdings' },
      { ticker: 'GNRC', name: 'Generac' },
    ],
  },
  {
    id: 'hyperscalers',
    name: 'Hyperscalers',
    parentStage: 'end-use',
    icon: 'Cloud',
    oneLiner: 'The demand drivers',
    description: 'Meta, Microsoft, Amazon, and Google are spending $200B+ annually on AI infrastructure. Every quarterly earnings call includes updated capex guidance that moves the entire supply chain. Their power purchase agreements with utilities and nuclear operators are reshaping the energy market.',
    keyMetrics: [
      { value: '$200B+', label: 'Combined annual capex' },
    ],
    companies: [
      { ticker: 'META', name: 'Meta Platforms' },
      { ticker: 'MSFT', name: 'Microsoft' },
      { ticker: 'AMZN', name: 'Amazon' },
      { ticker: 'GOOGL', name: 'Alphabet' },
      { ticker: 'AAPL', name: 'Apple' },
    ],
  },
  {
    id: 'dc-reits',
    name: 'DC REITs',
    parentStage: 'end-use',
    icon: 'Landmark',
    oneLiner: 'Data center landlords',
    description: 'Equinix and Digital Realty own and operate hundreds of data center facilities worldwide. They lease space, power, and connectivity to enterprises and cloud providers. Equinix alone operates 273 data centers. American Tower is expanding from cell towers into colocation.',
    keyMetrics: [
      { value: '273', label: 'Equinix DCs' },
      { value: '48', label: 'Tracked facilities' },
    ],
    companies: [
      { ticker: 'EQIX', name: 'Equinix' },
      { ticker: 'DLR', name: 'Digital Realty' },
      { ticker: 'AMT', name: 'American Tower' },
    ],
  },
  {
    id: 'compute',
    name: 'Compute',
    parentStage: 'end-use',
    icon: 'Cpu',
    oneLiner: 'The chips consuming the power',
    description: 'At the end of the supply chain: the GPUs, CPUs, and memory chips that actually consume the power. NVIDIA dominates AI training hardware. AMD competes on inference. Broadcom builds custom AI chips and networking. TSMC fabricates nearly all of it. Micron makes the HBM memory.',
    keyMetrics: [
      { value: '80%+', label: 'NVDA AI training share' },
    ],
    companies: [
      { ticker: 'NVDA', name: 'NVIDIA' },
      { ticker: 'AMD', name: 'AMD' },
      { ticker: 'AVGO', name: 'Broadcom' },
      { ticker: 'TSM', name: 'TSMC' },
      { ticker: 'MU', name: 'Micron' },
      { ticker: 'INTC', name: 'Intel' },
      { ticker: 'SMCI', name: 'Super Micro' },
    ],
  },
  {
    id: 'miners',
    name: 'Miners',
    parentStage: 'end-use',
    icon: 'Pickaxe',
    oneLiner: 'Crypto/AI hybrid operators',
    description: 'Bitcoin miners that are pivoting to (or adding) AI compute workloads. They already have the power contracts, the facilities, and the cooling infrastructure. IREN, CleanSpark, and Marathon Digital are converting mining capacity to AI hosting.',
    keyMetrics: [],
    companies: [
      { ticker: 'IREN', name: 'IREN Limited' },
      { ticker: 'CLSK', name: 'CleanSpark' },
      { ticker: 'MARA', name: 'Marathon Digital' },
    ],
  },
];

export const STAGE_CONFIGS: {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  accentColor: string;
  bottleneck: { status: BottleneckStatus; barFill: number };
}[] = [
  { id: 'raw-materials', name: 'Raw Materials', tagline: 'Where it comes from', icon: 'Mountain', accentColor: '#C87533', bottleneck: { status: 'tightening', barFill: 0.6 } },
  { id: 'generation', name: 'Generation', tagline: 'How it\'s made', icon: 'Zap', accentColor: '#F07800', bottleneck: { status: 'tightening', barFill: 0.55 } },
  { id: 'transmission', name: 'Transmission', tagline: 'How it moves', icon: 'Cable', accentColor: '#D4A843', bottleneck: { status: 'bottlenecked', barFill: 0.9 } },
  { id: 'distribution', name: 'Distribution', tagline: 'How it connects', icon: 'GitBranch', accentColor: '#B8860B', bottleneck: { status: 'tightening', barFill: 0.5 } },
  { id: 'end-use', name: 'End Use', tagline: 'Where it goes', icon: 'Server', accentColor: '#F0A500', bottleneck: { status: 'flowing', barFill: 0.3 } },
];

