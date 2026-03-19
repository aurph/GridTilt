export interface SupplyNode {
  id: string;
  name: string;
  stage: 'raw-materials' | 'generation' | 'transmission' | 'distribution' | 'end-use';
  stageIndex: number;
  icon: string;
  companies: { ticker: string; name: string }[];
  description: string;
  keyMetric?: { value: string; label: string };
}

export interface SupplyLink {
  source: string;
  target: string;
  label?: string;
}

export const STAGE_COLORS: Record<string, string> = {
  'raw-materials': '#C87533',
  'generation':    '#F07800',
  'transmission':  '#D4A843',
  'distribution':  '#B8860B',
  'end-use':       '#F0A500',
};

export const STAGE_LABELS: { id: string; name: string; index: number }[] = [
  { id: 'raw-materials', name: 'RAW MATERIALS', index: 0 },
  { id: 'generation',    name: 'GENERATION',    index: 1 },
  { id: 'transmission',  name: 'TRANSMISSION',  index: 2 },
  { id: 'distribution',  name: 'DISTRIBUTION',  index: 3 },
  { id: 'end-use',       name: 'END USE',       index: 4 },
];

export const supplyNodes: SupplyNode[] = [
  { id: 'uranium',      name: 'Uranium',          stage: 'raw-materials', stageIndex: 0, icon: 'Atom',          companies: [{ ticker: 'CCJ', name: 'Cameco' },{ ticker: 'UEC', name: 'Uranium Energy' },{ ticker: 'NXE', name: 'NexGen Energy' },{ ticker: 'DNN', name: 'Denison Mines' },{ ticker: 'UUUU', name: 'Energy Fuels' },{ ticker: 'LEU', name: 'Centrus Energy' }], description: 'Nuclear fuel. Spot at $93/lb. Mining expansion takes 5-10 years.', keyMetric: { value: '$93/lb', label: 'Spot price' } },
  { id: 'copper',       name: 'Copper',            stage: 'raw-materials', stageIndex: 0, icon: 'Circle',        companies: [{ ticker: 'FCX', name: 'Freeport-McMoRan' },{ ticker: 'SCCO', name: 'Southern Copper' },{ ticker: 'TECK', name: 'Teck Resources' },{ ticker: 'HBM', name: 'Hudbay Minerals' }], description: 'In everything: wiring, transformers, cables. $14,200/ton. AI could need 475K additional tons/yr.', keyMetric: { value: '$14,200/ton', label: 'Price' } },
  { id: 'steel',        name: 'Steel',             stage: 'raw-materials', stageIndex: 0, icon: 'Wrench',        companies: [{ ticker: 'NUE', name: 'Nucor' },{ ticker: 'STLD', name: 'Steel Dynamics' },{ ticker: 'CLF', name: 'Cleveland-Cliffs' },{ ticker: 'X', name: 'US Steel' }], description: 'Electrical steel for transformer cores. 8-12 month lead times. Structural steel for towers and DC frames.', keyMetric: { value: '8-12 mo', label: 'Lead time' } },
  { id: 'rare-earth',   name: 'Rare Earth',        stage: 'raw-materials', stageIndex: 0, icon: 'Gem',           companies: [{ ticker: 'MP', name: 'MP Materials' },{ ticker: 'USAR', name: 'USA Rare Earth' }], description: 'Magnets for generators/motors. China controls 90% of processing.', keyMetric: { value: '90%', label: 'China processing' } },
  { id: 'natural-gas',  name: 'Natural Gas',       stage: 'raw-materials', stageIndex: 0, icon: 'Flame',         companies: [{ ticker: 'AR', name: 'Antero Resources' },{ ticker: 'EQT', name: 'EQT Corporation' },{ ticker: 'RRC', name: 'Range Resources' },{ ticker: 'SWN', name: 'Southwestern Energy' },{ ticker: 'LNG', name: 'Cheniere Energy' }], description: 'Fuel for gas turbines. US production at record highs.', keyMetric: { value: 'Record', label: 'US production' } },

  { id: 'nuclear',      name: 'Nuclear',           stage: 'generation', stageIndex: 1, icon: 'Radiation',     companies: [{ ticker: 'CEG', name: 'Constellation Energy' },{ ticker: 'VST', name: 'Vistra' },{ ticker: 'TLN', name: 'Talen Energy' },{ ticker: 'SMR', name: 'NuScale Power' },{ ticker: 'OKLO', name: 'Oklo Inc' },{ ticker: 'BWXT', name: 'BWX Technologies' },{ ticker: 'SO', name: 'Southern Company' }], description: 'TMI restarting for MSFT. Palisades first-ever US restart. 24/7 baseload for data centers.', keyMetric: { value: '22 GW', label: 'CEG fleet' } },
  { id: 'gas-turbines', name: 'Gas Turbines',      stage: 'generation', stageIndex: 1, icon: 'Gauge',         companies: [{ ticker: 'GEV', name: 'GE Vernova' },{ ticker: 'SIEGY', name: 'Siemens Energy' },{ ticker: 'BKR', name: 'Baker Hughes' },{ ticker: 'NRG', name: 'NRG Energy' }], description: 'Fastest new capacity: 2-3 yr build time. GE Vernova backlog $200B+.', keyMetric: { value: '$200B+', label: 'GEV backlog' } },
  { id: 'solar',        name: 'Solar',             stage: 'generation', stageIndex: 1, icon: 'Sun',           companies: [{ ticker: 'FSLR', name: 'First Solar' },{ ticker: 'ENPH', name: 'Enphase Energy' },{ ticker: 'SEDG', name: 'SolarEdge' },{ ticker: 'NEE', name: 'NextEra Energy' },{ ticker: 'AES', name: 'AES Corporation' }], description: 'Cheapest new generation. Intermittent: needs storage. NEE signed Meta PPA.', keyMetric: { value: 'Cheapest', label: 'New gen LCOE' } },
  { id: 'smrs',         name: 'SMRs',              stage: 'generation', stageIndex: 1, icon: 'FlaskConical',  companies: [{ ticker: 'SMR', name: 'NuScale Power' },{ ticker: 'OKLO', name: 'Oklo Inc' }], description: 'Factory-built compact reactors. NuScale has NRC cert. Oklo backed by Altman. No commercial units yet.', keyMetric: { value: '2029', label: 'Target deploy' } },

  { id: 'transformers', name: 'Transformers',      stage: 'transmission', stageIndex: 2, icon: 'Plug',          companies: [{ ticker: 'ETN', name: 'Eaton Corporation' },{ ticker: 'ABB', name: 'ABB Ltd' },{ ticker: 'EMR', name: 'Emerson Electric' },{ ticker: 'HUBB', name: 'Hubbell Inc' }], description: 'THE bottleneck. US makes ~60/yr. Need 200-500 for AI. 400,000 lbs each. 18-36 mo lead time.', keyMetric: { value: '18-36 mo', label: 'Lead time' } },
  { id: 'hv-cable',     name: 'HV Cable',          stage: 'transmission', stageIndex: 2, icon: 'Cable',         companies: [{ ticker: 'WIRE', name: 'Encore Wire' },{ ticker: 'NVT', name: 'nVent Electric' }], description: 'High-voltage lines carrying power from plants to demand centers.', keyMetric: { value: 'Growing', label: 'Queue' } },
  { id: 'line-const',   name: 'Line Construction', stage: 'transmission', stageIndex: 2, icon: 'HardHat',       companies: [{ ticker: 'PWR', name: 'Quanta Services' },{ ticker: 'IDA', name: 'IDACORP' },{ ticker: 'AYI', name: 'Acuity Brands' },{ ticker: 'GNRC', name: 'Generac' }], description: 'Physical build of transmission lines + towers. Quanta has the largest private HV workforce in NA. 5-10 yr permitting.', keyMetric: { value: '5-10 yr', label: 'Permitting' } },

  { id: 'cooling',      name: 'Cooling',           stage: 'distribution', stageIndex: 3, icon: 'Snowflake',     companies: [{ ticker: 'VRT', name: 'Vertiv Holdings' },{ ticker: 'CARR', name: 'Carrier Global' },{ ticker: 'JCI', name: 'Johnson Controls' }], description: 'AI racks pull 40-70kW. Liquid cooling becoming standard. Vertiv and Carrier dominate.', keyMetric: { value: '40-70kW', label: 'Per rack' } },
  { id: 'switchgear',   name: 'Switchgear',        stage: 'distribution', stageIndex: 3, icon: 'ToggleRight',   companies: [{ ticker: 'ETN', name: 'Eaton Corporation' },{ ticker: 'ABB', name: 'ABB Ltd' }], description: 'Routes and protects power inside facilities. 2-3 year backlogs.', keyMetric: { value: '2-3 yr', label: 'Backlog' } },
  { id: 'dc-build',     name: 'DC Construction',   stage: 'distribution', stageIndex: 3, icon: 'Building',      companies: [{ ticker: 'EME', name: 'EMCOR Group' },{ ticker: 'MTZ', name: 'MasTec' },{ ticker: 'STRL', name: 'Sterling Infrastructure' },{ ticker: 'FLR', name: 'Fluor Corporation' },{ ticker: 'J', name: 'Jacobs Solutions' },{ ticker: 'ACM', name: 'AECOM' },{ ticker: 'PRIM', name: 'Primoris Services' }], description: 'Physical build of data centers. Sterling 125% YoY DC growth. Largest pipeline ever.', keyMetric: { value: '125% YoY', label: 'STRL growth' } },
  { id: 'power-mgmt',   name: 'Power Mgmt',        stage: 'distribution', stageIndex: 3, icon: 'Battery',       companies: [{ ticker: 'VRT', name: 'Vertiv Holdings' },{ ticker: 'GNRC', name: 'Generac' }], description: 'UPS, PDUs, backup generators. Zero downtime tolerance.' },

  { id: 'hyperscalers', name: 'Hyperscalers',      stage: 'end-use', stageIndex: 4, icon: 'Cloud',         companies: [{ ticker: 'META', name: 'Meta Platforms' },{ ticker: 'MSFT', name: 'Microsoft' },{ ticker: 'AMZN', name: 'Amazon' },{ ticker: 'GOOGL', name: 'Alphabet' },{ ticker: 'AAPL', name: 'Apple' }], description: 'The demand signal. $200B+ combined annual AI capex. Every upstream company exists because of this spend.', keyMetric: { value: '$200B+', label: 'Annual capex' } },
  { id: 'dc-reits',     name: 'DC REITs',          stage: 'end-use', stageIndex: 4, icon: 'Landmark',      companies: [{ ticker: 'EQIX', name: 'Equinix' },{ ticker: 'DLR', name: 'Digital Realty' },{ ticker: 'AMT', name: 'American Tower' }], description: 'Data center landlords. Equinix: 273 DCs worldwide. Digital Realty: largest portfolio.', keyMetric: { value: '273', label: 'EQIX DCs' } },
  { id: 'compute',      name: 'Compute',           stage: 'end-use', stageIndex: 4, icon: 'Cpu',           companies: [{ ticker: 'NVDA', name: 'NVIDIA' },{ ticker: 'AMD', name: 'AMD' },{ ticker: 'AVGO', name: 'Broadcom' },{ ticker: 'TSM', name: 'TSMC' },{ ticker: 'MU', name: 'Micron' },{ ticker: 'INTC', name: 'Intel' },{ ticker: 'SMCI', name: 'Super Micro' }], description: 'The chips consuming the power. NVDA owns 80%+ of AI training. TSMC fabs it all.', keyMetric: { value: '80%+', label: 'NVDA share' } },
  { id: 'miners',       name: 'Miners',            stage: 'end-use', stageIndex: 4, icon: 'Pickaxe',       companies: [{ ticker: 'IREN', name: 'IREN Limited' },{ ticker: 'CLSK', name: 'CleanSpark' },{ ticker: 'MARA', name: 'Marathon Digital' }], description: 'Crypto miners pivoting to AI hosting. Already have power contracts and cooling infra.' },
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

  // Transmission -> Distribution
  { source: 'transformers',target: 'switchgear',    label: 'step-down' },
  { source: 'transformers',target: 'power-mgmt',    label: 'facility feed' },
  { source: 'hv-cable',    target: 'switchgear',    label: 'delivery' },
  { source: 'hv-cable',    target: 'dc-build',      label: 'site feed' },

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
];
