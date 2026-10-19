import { BRAND, SERIES } from "@/lib/tokens";

export interface SupplyNode {
  id: string;
  name: string;
  stage: 'raw-materials' | 'generation' | 'transmission' | 'distribution' | 'end-use';
  stageIndex: number;
  icon: string;
  companies: { ticker: string; name: string }[];
  /** What this part of the chain does. Role only: no figures (figures live in `fact`, with a source). */
  description: string;
  /** One sourced, dated figure. Omitted when none is verified. */
  fact?: SupplyFact;
}

/** A figure shown on the page, with where it comes from and the date it applies to. */
export interface SupplyFact {
  label: string;
  value: string;
  /** One plain sentence stating the figure. */
  statement: string;
  publisher: string;
  url: string;
  /** YYYY-MM or YYYY-MM-DD the figure applies to. */
  asOf: string;
}

export interface SupplyLink {
  source: string;
  target: string;
  label?: string;
}

// Supply-chain stages are not in CATEGORY_COLORS; per the migration map,
// brand hexes go to BRAND and the rest take SERIES slots in order of appearance.
export const STAGE_COLORS: Record<string, string> = {
  'raw-materials': SERIES[0],      // series slot 1
  'generation':    BRAND.primary,
  'transmission':  SERIES[1],      // series slot 2
  'distribution':  SERIES[2],      // series slot 3
  'end-use':       BRAND.secondary,
};

export const STAGE_LABELS: { id: string; name: string; index: number }[] = [
  { id: 'raw-materials', name: 'RAW MATERIALS', index: 0 },
  { id: 'generation',    name: 'GENERATION',    index: 1 },
  { id: 'transmission',  name: 'TRANSMISSION',  index: 2 },
  { id: 'distribution',  name: 'DISTRIBUTION',  index: 3 },
  { id: 'end-use',       name: 'END USE',       index: 4 },
];

export const supplyNodes: SupplyNode[] = [
  { id: 'uranium',      name: 'Uranium',           stage: 'raw-materials', stageIndex: 0, icon: 'Atom',          companies: [{ ticker: 'CCJ', name: 'Cameco' },{ ticker: 'UEC', name: 'Uranium Energy' },{ ticker: 'NXE', name: 'NexGen Energy' },{ ticker: 'DNN', name: 'Denison Mines' },{ ticker: 'UUUU', name: 'Energy Fuels' },{ ticker: 'LEU', name: 'Centrus Energy' }], description: 'Mined, converted and enriched into fuel for existing reactors and for the next generation of advanced reactors.', fact: { label: 'U3O8 spot price', value: '$89.63/lb', statement: 'The uranium spot price averaged $89.63 per pound at the end of September 2026, from UxC and TradeTech month-end prices.', publisher: 'Cameco', url: 'https://www.cameco.com/invest/markets/uranium-price', asOf: '2026-09-30' } },
  { id: 'copper',       name: 'Copper',            stage: 'raw-materials', stageIndex: 0, icon: 'Pickaxe',       companies: [{ ticker: 'FCX', name: 'Freeport-McMoRan' },{ ticker: 'SCCO', name: 'Southern Copper' },{ ticker: 'TECK', name: 'Teck Resources' },{ ticker: 'HBM', name: 'Hudbay Minerals' }], description: 'The conductor in transformer windings, cable, busbars and every data center\'s wiring.' },
  { id: 'steel',        name: 'Steel',             stage: 'raw-materials', stageIndex: 0, icon: 'Hammer',        companies: [{ ticker: 'NUE', name: 'Nucor' },{ ticker: 'STLD', name: 'Steel Dynamics' },{ ticker: 'CLF', name: 'Cleveland-Cliffs' }], description: 'Grain-oriented electrical steel for transformer cores, plus structural steel for towers, plants and data center frames.', fact: { label: 'Grain-oriented electrical steel', value: 'One US maker', statement: 'Cleveland-Cliffs is the only US producer of the grain-oriented electrical steel used in transformer cores.', publisher: 'Cleveland-Cliffs', url: 'https://www.clevelandcliffs.com/news/news-releases/detail/644/cleveland-cliffs-announces-its-new-state-of-the-art', asOf: '2024-07-22' } },
  { id: 'rare-earth',   name: 'Rare Earth',        stage: 'raw-materials', stageIndex: 0, icon: 'Gem',           companies: [{ ticker: 'MP', name: 'MP Materials' }], description: 'Elements for the permanent magnets in generators and motors.', fact: { label: 'China\'s share of rare earth refining', value: 'over 90%', statement: 'China accounts for over 90% of global rare earth refining supply.', publisher: 'IEA, Global Critical Minerals Outlook 2026', url: 'https://www.iea.org/reports/global-critical-minerals-outlook-2026/outlook', asOf: '2026-07-16' } },
  { id: 'natural-gas',  name: 'Natural Gas',       stage: 'raw-materials', stageIndex: 0, icon: 'Flame',         companies: [{ ticker: 'AR', name: 'Antero Resources' },{ ticker: 'EQT', name: 'EQT Corporation' },{ ticker: 'RRC', name: 'Range Resources' },{ ticker: 'EXE', name: 'Expand Energy' }], description: 'Fuel for the gas turbines that supply much of the new generation built for data centers.', fact: { label: 'US dry gas production', value: '113.71 Bcf/d', statement: 'US dry natural gas production reached 113.71 billion cubic feet per day in July 2026 (preliminary), the highest for any month since 1973.', publisher: 'US Energy Information Administration', url: 'https://www.eia.gov/naturalgas/monthly/', asOf: '2026-07' } },

  { id: 'nuclear',      name: 'Nuclear',           stage: 'generation', stageIndex: 1, icon: 'Radiation',     companies: [{ ticker: 'CEG', name: 'Constellation Energy' },{ ticker: 'VST', name: 'Vistra' },{ ticker: 'TLN', name: 'Talen Energy' },{ ticker: 'SO', name: 'Southern Company' },{ ticker: 'BWXT', name: 'BWX Technologies' }], description: 'Operators of existing reactors, which sell round-the-clock carbon-free power to data center buyers, and a supplier of reactor components.', fact: { label: 'Constellation nuclear capacity', value: 'about 22 GW', statement: 'Constellation\'s nuclear fleet, the largest in the US, has about 22 GW of generating capacity.', publisher: 'Constellation Energy, 2025 Form 10-K', url: 'https://www.sec.gov/Archives/edgar/data/1168165/000186827526000032/ceg-20251231.htm', asOf: '2026-02-24' } },
  { id: 'gas-turbines', name: 'Gas Turbines',      stage: 'generation', stageIndex: 1, icon: 'Gauge',         companies: [{ ticker: 'GEV', name: 'GE Vernova' },{ ticker: 'SMEGF', name: 'Siemens Energy' },{ ticker: 'BKR', name: 'Baker Hughes' }], description: 'Makers of the turbines behind new gas generation, including units sited at data centers.', fact: { label: 'GE Vernova gas backlog and reservations', value: '116 GW', statement: 'GE Vernova\'s gas power equipment backlog plus slot reservations grew from 100 GW to 116 GW in Q2 2026.', publisher: 'GE Vernova Q2 2026 results (SEC filing)', url: 'https://www.sec.gov/Archives/edgar/data/0001996810/000199681026000147/gevpressrelease2q26.htm', asOf: '2026-06-30' } },
  { id: 'solar',        name: 'Solar',             stage: 'generation', stageIndex: 1, icon: 'Sun',           companies: [{ ticker: 'FSLR', name: 'First Solar' },{ ticker: 'NEE', name: 'NextEra Energy' },{ ticker: 'AES', name: 'AES Corporation' }], description: 'Utility-scale solar developers and panel makers; data center buyers contract much of their new clean power from solar.' },
  { id: 'smrs',         name: 'SMRs',              stage: 'generation', stageIndex: 1, icon: 'FlaskConical',  companies: [{ ticker: 'SMR', name: 'NuScale Power' },{ ticker: 'OKLO', name: 'Oklo Inc' }], description: 'Small modular and advanced reactor developers; neither has a commercial plant operating yet.', fact: { label: 'Commercial SMRs operating in the US', value: 'None', statement: 'The NRC issued the first US small modular reactor construction permit, for TVA\'s Clinch River BWRX-300, on September 29, 2026; an operating license is still required.', publisher: 'US Nuclear Regulatory Commission', url: 'https://www.nrc.gov/about-nrc/news-releases/2026/26-079', asOf: '2026-09-29' } },

  { id: 'transformers', name: 'Transformers',      stage: 'transmission', stageIndex: 2, icon: 'Plug',          companies: [{ ticker: 'GEV', name: 'GE Vernova' },{ ticker: 'SMEGF', name: 'Siemens Energy' },{ ticker: 'ETN', name: 'Eaton' },{ ticker: 'HUBB', name: 'Hubbell' }], description: 'Step voltage up at power plants and down at substations; every new plant and data center connection needs them.', fact: { label: 'Power transformer lead time', value: '128 weeks', statement: 'The average lead time for US power transformers was 128 weeks, about 2.5 years, in Q2 2025.', publisher: 'Wood Mackenzie', url: 'https://www.woodmac.com/news/opinion/mind-the-gap-tackling-supply-chain-challenges-in-the-electric-td-sector/', asOf: '2025-06' } },
  { id: 'hv-cable',     name: 'HV Cable',          stage: 'transmission', stageIndex: 2, icon: 'Cable',         companies: [{ ticker: 'PRYMY', name: 'Prysmian' }], description: 'High-voltage cable carrying power from plants to load centers, overhead and underground.' },
  { id: 'line-const',   name: 'Line Construction', stage: 'transmission', stageIndex: 2, icon: 'HardHat',       companies: [{ ticker: 'PWR', name: 'Quanta Services' },{ ticker: 'MTZ', name: 'MasTec' },{ ticker: 'PRIM', name: 'Primoris Services' }], description: 'Contractors that build transmission lines, towers and substations.', fact: { label: 'Federal review of a line', value: '4.3 years', statement: 'Federal environmental impact reviews of US transmission lines took 4.3 years on average in 2010-2020, before state siting and construction.', publisher: 'Niskanen Center, Clean Air Task Force, ClearPath', url: 'https://www.niskanencenter.org/from-decades-to-years-does-citap-program-and-progress-towards-faster-transmission-projects/', asOf: '2024-07-23' } },
  { id: 'substations',  name: 'Substations',       stage: 'transmission', stageIndex: 2, icon: 'Workflow',      companies: [{ ticker: 'ETN', name: 'Eaton' },{ ticker: 'ABBNY', name: 'ABB' },{ ticker: 'HUBB', name: 'Hubbell' },{ ticker: 'DUK', name: 'Duke Energy' },{ ticker: 'AEP', name: 'American Electric Power' }], description: 'Where the transmission grid meets the customer: utilities own them, equipment makers supply them.' },

  { id: 'cooling',      name: 'Cooling',           stage: 'distribution', stageIndex: 3, icon: 'Snowflake',     companies: [{ ticker: 'VRT', name: 'Vertiv' },{ ticker: 'CARR', name: 'Carrier Global' },{ ticker: 'JCI', name: 'Johnson Controls' },{ ticker: 'NVT', name: 'nVent Electric' }], description: 'Air and liquid cooling that removes the heat AI accelerators produce.', fact: { label: 'GB200 NVL72 rack power', value: 'up to 132 kW', statement: 'The Vertiv and NVIDIA reference design for a GB200 NVL72 rack supports up to 132 kW per rack.', publisher: 'Vertiv', url: 'https://investors.vertiv.com/news/news-details/2024/Vertiv-Codevelops-with-NVIDIA-Complete-Power-and-Cooling-Blueprint-for-NVIDIA-GB200-NVL72-Platform/', asOf: '2024-10-15' } },
  { id: 'switchgear',   name: 'Switchgear',        stage: 'distribution', stageIndex: 3, icon: 'ToggleRight',   companies: [{ ticker: 'ETN', name: 'Eaton' },{ ticker: 'ABBNY', name: 'ABB' }], description: 'Routes and protects power inside the facility, from the utility handoff to the rows of racks.', fact: { label: 'Switchgear lead time', value: '44 weeks', statement: 'The average lead time for US switchgear was 44 weeks in Q2 2025.', publisher: 'Wood Mackenzie', url: 'https://www.woodmac.com/news/opinion/mind-the-gap-tackling-supply-chain-challenges-in-the-electric-td-sector/', asOf: '2025-06' } },
  { id: 'dc-build',     name: 'Datacenter Build',  stage: 'distribution', stageIndex: 3, icon: 'Building',      companies: [{ ticker: 'EME', name: 'EMCOR Group' },{ ticker: 'STRL', name: 'Sterling Infrastructure' },{ ticker: 'FLR', name: 'Fluor Corporation' }], description: 'Engineers and contractors that design and build data center campuses.' },
  { id: 'power-mgmt',   name: 'Power Mgmt',        stage: 'distribution', stageIndex: 3, icon: 'Battery',       companies: [{ ticker: 'VRT', name: 'Vertiv' },{ ticker: 'ETN', name: 'Eaton' },{ ticker: 'GNRC', name: 'Generac' }], description: 'UPS systems, power distribution units and backup generators that keep racks running through faults.' },

  { id: 'hyperscalers', name: 'Hyperscalers',      stage: 'end-use', stageIndex: 4, icon: 'Cloud',         companies: [{ ticker: 'MSFT', name: 'Microsoft' },{ ticker: 'AMZN', name: 'Amazon' },{ ticker: 'GOOGL', name: 'Alphabet' },{ ticker: 'META', name: 'Meta Platforms' }], description: 'The largest buyers of data center capacity and of the power that runs it.', fact: { label: 'Alphabet 2026 capex guide', value: '$195-205B', statement: 'Alphabet raised its full-year 2026 capital expenditure guidance to $195-205 billion, from $180-190 billion.', publisher: 'Alphabet Q2 2026 earnings call', url: 'https://abc.xyz/investor/events/event-details/2026/2026-Q2-Earnings-Call-2026-GgTAq7Is0z/default.aspx', asOf: '2026-07-22' } },
  { id: 'dc-reits',     name: 'Datacenter REITs',  stage: 'end-use', stageIndex: 4, icon: 'Warehouse',     companies: [{ ticker: 'EQIX', name: 'Equinix' },{ ticker: 'DLR', name: 'Digital Realty' },{ ticker: 'AMT', name: 'American Tower (CoreSite)' }], description: 'Landlords that build and lease data center space, power and interconnection.', fact: { label: 'Equinix data centers', value: '282', statement: 'Equinix operates 282 data centers in 77 metros across 36 countries.', publisher: 'Equinix Q2 2026 earnings presentation', url: 'https://investor.equinix.com/', asOf: '2026-06-30' } },
  { id: 'compute',      name: 'Compute',           stage: 'end-use', stageIndex: 4, icon: 'Cpu',           companies: [{ ticker: 'NVDA', name: 'NVIDIA' },{ ticker: 'AMD', name: 'AMD' },{ ticker: 'AVGO', name: 'Broadcom' },{ ticker: 'TSM', name: 'TSMC' },{ ticker: 'INTC', name: 'Intel' },{ ticker: 'SMCI', name: 'Super Micro' }], description: 'The chips and servers that turn the power into computation.', fact: { label: 'NVIDIA data center revenue', value: '$89.0B', statement: 'NVIDIA\'s data center revenue was $89.0 billion in the quarter ended July 26, 2026, up 117% from a year earlier.', publisher: 'NVIDIA Q2 FY2027 results (SEC filing)', url: 'https://www.sec.gov/Archives/edgar/data/0001045810/000104581026000073/q2fy27pr.htm', asOf: '2026-07-26' } },
  { id: 'miners',       name: 'Crypto Miners',     stage: 'end-use', stageIndex: 4, icon: 'Bitcoin',       companies: [{ ticker: 'IREN', name: 'IREN Limited' },{ ticker: 'CLSK', name: 'CleanSpark' },{ ticker: 'MARA', name: 'MARA Holdings' }], description: 'Bitcoin miners moving their power contracts and sites toward AI and HPC hosting.' },

  { id: 'hbm-memory',   name: 'HBM Memory',        stage: 'end-use', stageIndex: 4, icon: 'MemoryStick',   companies: [{ ticker: 'MU', name: 'Micron Technology' }], description: 'High-bandwidth memory stacked beside every AI accelerator; SK hynix and Samsung, the other two makers, are not US-listed.', fact: { label: 'SK hynix 2026 HBM supply', value: 'Contracted', statement: 'SK hynix said it had completed HBM supply discussions with key customers for 2026.', publisher: 'SK hynix 3Q25 results', url: 'https://news.skhynix.com/en/sk-hynix-announces-3q25-financial-results/', asOf: '2025-10-29' } },
  { id: 'optics',       name: 'Optics & Networking', stage: 'end-use', stageIndex: 4, icon: 'Network',     companies: [{ ticker: 'ANET', name: 'Arista Networks' },{ ticker: 'MRVL', name: 'Marvell Technology' },{ ticker: 'AVGO', name: 'Broadcom' }], description: 'Switches, transceivers and signal processors that wire accelerators into clusters.' },
  { id: 'workforce',    name: 'Workforce',         stage: 'transmission', stageIndex: 2, icon: 'Users',         companies: [], description: 'Electricians, line workers and other skilled trades who build the plants, lines and data centers.', fact: { label: 'Electrician openings a year', value: '72,700', statement: 'BLS projects about 72,700 openings a year for electricians, on average over 2025-2035.', publisher: 'US Bureau of Labor Statistics', url: 'https://www.bls.gov/ooh/construction-and-extraction/electricians.htm', asOf: '2026-08-27' } },
];

export const supplyLinks: SupplyLink[] = [
  // Raw Materials -> Generation
  { source: 'uranium',     target: 'nuclear',       label: 'LEU fuel' },
  { source: 'uranium',     target: 'smrs',          label: 'HALEU fuel' },
  { source: 'natural-gas', target: 'gas-turbines',  label: 'combustion fuel' },
  { source: 'rare-earth',  target: 'nuclear',       label: 'generator magnets' },
  { source: 'steel',       target: 'nuclear',       label: 'reactor vessels' },
  { source: 'steel',       target: 'gas-turbines',  label: 'turbine housing' },
  { source: 'copper',      target: 'nuclear',       label: 'plant wiring' },
  { source: 'copper',      target: 'gas-turbines',  label: 'generator windings' },
  { source: 'copper',      target: 'solar',         label: 'array wiring' },

  // Raw Materials -> Transmission
  { source: 'copper',      target: 'transformers',  label: 'winding copper' },
  { source: 'copper',      target: 'hv-cable',      label: 'conductor' },
  { source: 'steel',       target: 'transformers',  label: 'GOES cores' },
  { source: 'steel',       target: 'line-const',    label: 'tower steel' },

  // Raw Materials -> Distribution
  { source: 'copper',      target: 'switchgear',    label: 'busbars' },
  { source: 'copper',      target: 'cooling',       label: 'cooling pipes' },
  { source: 'copper',      target: 'dc-build',      label: 'facility wiring' },
  { source: 'steel',       target: 'dc-build',      label: 'structural steel' },

  // Generation -> Transmission
  { source: 'nuclear',     target: 'transformers',  label: 'GSU' },
  { source: 'gas-turbines',target: 'transformers',  label: 'GSU' },
  { source: 'solar',       target: 'transformers',  label: 'GSU' },
  { source: 'smrs',        target: 'transformers',  label: 'GSU' },

  // Transmission -> Transmission (internal)
  { source: 'line-const',  target: 'hv-cable',      label: 'infrastructure' },

  // Transmission internal
  { source: 'transformers',target: 'substations',   label: 'step-down' },
  { source: 'hv-cable',    target: 'substations',   label: 'delivery' },
  { source: 'line-const',  target: 'substations',   label: 'site work' },

  // Substations -> Distribution
  { source: 'substations', target: 'switchgear',    label: 'utility handoff' },
  { source: 'substations', target: 'power-mgmt',    label: 'facility feed' },
  { source: 'substations', target: 'dc-build',      label: 'site power' },

  // Distribution -> End Use
  { source: 'cooling',     target: 'hyperscalers',  label: 'thermal mgmt' },
  { source: 'cooling',     target: 'dc-reits',      label: 'thermal mgmt' },
  { source: 'cooling',     target: 'compute',       label: 'chip cooling' },
  { source: 'cooling',     target: 'miners',        label: 'thermal mgmt' },
  { source: 'switchgear',  target: 'hyperscalers',  label: 'power routing' },
  { source: 'switchgear',  target: 'dc-reits',      label: 'power routing' },
  { source: 'switchgear',  target: 'miners',        label: 'power routing' },
  { source: 'dc-build',    target: 'hyperscalers',  label: 'facilities' },
  { source: 'dc-build',    target: 'dc-reits',      label: 'facilities' },
  { source: 'dc-build',    target: 'miners',        label: 'facilities' },
  { source: 'power-mgmt',  target: 'hyperscalers',  label: 'uptime' },
  { source: 'power-mgmt',  target: 'dc-reits',      label: 'uptime' },
  { source: 'power-mgmt',  target: 'compute',       label: 'uptime' },
  { source: 'power-mgmt',  target: 'miners',        label: 'uptime' },

  // Within End Use
  { source: 'dc-reits',    target: 'compute',       label: 'colocation' },
  { source: 'hyperscalers',target: 'compute',       label: 'procurement' },

  // HBM + Optics (subsystems of Compute reaching Hyperscalers)
  { source: 'compute',     target: 'hbm-memory',    label: 'on-package' },
  { source: 'hbm-memory',  target: 'hyperscalers',  label: 'integrated' },
  { source: 'compute',     target: 'optics',        label: 'interconnect' },
  { source: 'optics',      target: 'hyperscalers',  label: 'cluster fabric' },
  { source: 'optics',      target: 'dc-reits',      label: 'cross-connect' },

  // Workforce feeds physical build stages
  { source: 'workforce',   target: 'line-const',    label: 'labor' },
  { source: 'workforce',   target: 'dc-build',      label: 'labor' },
  { source: 'workforce',   target: 'substations',   label: 'labor' },
];
