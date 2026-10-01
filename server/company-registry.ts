// ─── Company registry ────────────────────────────────────────────────────────
//
// The companies GridTilt classifies (COMPANY_DATABASE: a stock page exists for
// each) and the tickers the Equities stack quotes (STACK_TICKERS). Moved out
// of routes.ts so the page metadata and the sitemap judge a ticker by the same
// list the stock API answers from: a ticker outside COMPANY_DATABASE is a 404
// everywhere.

// Known company data for portfolio scoring
export const COMPANY_DATABASE: Record<string, {
  name: string;
  primarySegment: string;
  sectors: { Compute: number; Infrastructure: number; Power: number; Cooling: number; Grid: number };
  explanation: string;
}> = {
  NVDA: { name: "NVIDIA Corporation", primarySegment: "Compute", sectors: { Compute: 95, Infrastructure: 20, Power: 10, Cooling: 15, Grid: 5 }, explanation: "H100/B200 GPUs power most major AI training clusters. About 70% of datacenter revenue comes from AI workloads." },
  AMD: { name: "Advanced Micro Devices", primarySegment: "Compute", sectors: { Compute: 72, Infrastructure: 15, Power: 8, Cooling: 12, Grid: 5 }, explanation: "MI300X competes with NVIDIA in AI inference. Growing datacenter GPU business." },
  TSM: { name: "Taiwan Semiconductor Mfg", primarySegment: "Compute", sectors: { Compute: 88, Infrastructure: 15, Power: 12, Cooling: 18, Grid: 8 }, explanation: "Manufactures most advanced AI chips (NVDA, AMD, Apple, Google TPUs). Primary foundry for AI compute silicon." },
  INTC: { name: "Intel Corporation", primarySegment: "Compute", sectors: { Compute: 45, Infrastructure: 20, Power: 5, Cooling: 10, Grid: 5 }, explanation: "Gaudi AI accelerators and Xeon datacenter CPUs. Moderate AI exposure; NVDA dominates GPU training." },
  MU: { name: "Micron Technology", primarySegment: "Compute", sectors: { Compute: 60, Infrastructure: 15, Power: 5, Cooling: 8, Grid: 3 }, explanation: "HBM is required for AI accelerators. Micron's HBM3E supplies memory for GPU systems." },
  EQIX: { name: "Equinix Inc", primarySegment: "Infrastructure", sectors: { Compute: 15, Infrastructure: 97, Power: 30, Cooling: 45, Grid: 25 }, explanation: "Largest colocation data center REIT. 100% of revenue from physical DC infrastructure." },
  DLR: { name: "Digital Realty Trust", primarySegment: "Infrastructure", sectors: { Compute: 10, Infrastructure: 95, Power: 28, Cooling: 42, Grid: 22 }, explanation: "Major DC REIT with hyperscaler-focused campuses. Growing power capacity agreements with cloud providers." },
  VRT: { name: "Vertiv Holdings", primarySegment: "Cooling", sectors: { Compute: 10, Infrastructure: 35, Power: 20, Cooling: 90, Grid: 30 }, explanation: "DC thermal management and power infrastructure. Cooling and power systems for AI datacenters." },
  IREN: { name: "IREN Limited", primarySegment: "Infrastructure", sectors: { Compute: 25, Infrastructure: 75, Power: 40, Cooling: 30, Grid: 20 }, explanation: "AI cloud and Bitcoin mining company expanding GPU-as-a-Service. Building out DC infrastructure." },
  AMT: { name: "American Tower Corporation", primarySegment: "Infrastructure", sectors: { Compute: 5, Infrastructure: 45, Power: 15, Cooling: 10, Grid: 20 }, explanation: "Telecom tower REIT with edge data center exposure. Indirect beneficiary through edge compute." },
  CEG: { name: "Constellation Energy", primarySegment: "Power", sectors: { Compute: 5, Infrastructure: 15, Power: 90, Cooling: 5, Grid: 35 }, explanation: "Largest US nuclear operator. Contracted to restart TMI Unit 1 for Microsoft. 13-plant nuclear fleet." },
  VST: { name: "Vistra Corp", primarySegment: "Power", sectors: { Compute: 5, Infrastructure: 10, Power: 78, Cooling: 5, Grid: 30 }, explanation: "Largest competitive US power generator. Nuclear and gas assets with DC power supply exposure." },
  ETR: { name: "Entergy Corporation", primarySegment: "Power", sectors: { Compute: 3, Infrastructure: 10, Power: 65, Cooling: 5, Grid: 28 }, explanation: "Southeast utility with nuclear fleet. Growing DC power supply contracts in its territory." },
  NEE: { name: "NextEra Energy", primarySegment: "Power", sectors: { Compute: 3, Infrastructure: 12, Power: 70, Cooling: 5, Grid: 40 }, explanation: "Largest renewable energy company. Signing PPAs with DC operators for dedicated capacity." },
  CCJ: { name: "Cameco Corporation", primarySegment: "Power", sectors: { Compute: 2, Infrastructure: 5, Power: 82, Cooling: 2, Grid: 15 }, explanation: "Largest publicly-traded uranium miner. High direct uranium spot price exposure among large-caps." },
  NXE: { name: "NexGen Energy", primarySegment: "Power", sectors: { Compute: 2, Infrastructure: 5, Power: 78, Cooling: 2, Grid: 10 }, explanation: "Development-stage uranium miner. Rook I project in Saskatchewan holds high-grade deposits." },
  URA: { name: "Global X Uranium ETF", primarySegment: "Power", sectors: { Compute: 2, Infrastructure: 5, Power: 80, Cooling: 2, Grid: 12 }, explanation: "ETF holding uranium miners and nuclear equipment companies. Broad uranium sector exposure." },
  MSFT: { name: "Microsoft Corporation", primarySegment: "Compute", sectors: { Compute: 65, Infrastructure: 40, Power: 25, Cooling: 20, Grid: 10 }, explanation: "Azure AI cloud consumes significant DC power. Signed the TMI nuclear restart deal." },
  GOOGL: { name: "Alphabet Inc", primarySegment: "Compute", sectors: { Compute: 60, Infrastructure: 45, Power: 22, Cooling: 20, Grid: 12 }, explanation: "DeepMind and TPU infrastructure require large power capacity. Signed the first commercial SMR contract." },
  AMZN: { name: "Amazon.com Inc", primarySegment: "Infrastructure", sectors: { Compute: 55, Infrastructure: 50, Power: 20, Cooling: 18, Grid: 12 }, explanation: "AWS is the largest cloud provider. AI capex is driving DC expansion across the US." },
  META: { name: "Meta Platforms Inc", primarySegment: "Compute", sectors: { Compute: 58, Infrastructure: 42, Power: 18, Cooling: 15, Grid: 10 }, explanation: "Llama models and recommendation systems run on custom DC infrastructure. Consumes about 4 GW globally." },
  AAPL: { name: "Apple Inc", primarySegment: "Compute", sectors: { Compute: 30, Infrastructure: 10, Power: 8, Cooling: 5, Grid: 3 }, explanation: "Apple Intelligence runs mostly on-device. Limited DC power infrastructure exposure." },
  TSLA: { name: "Tesla Inc", primarySegment: "ETF", sectors: { Compute: 25, Infrastructure: 5, Power: 15, Cooling: 5, Grid: 45 }, explanation: "Megapack energy storage used in utility-scale projects including DC backup. Dojo is a compute asset." },
  ETN: { name: "Eaton Corporation", primarySegment: "PowerHardware", sectors: { Compute: 5, Infrastructure: 20, Power: 20, Cooling: 35, Grid: 78 }, explanation: "Switchgear, transformers, and UPS connecting grid to DC rack. $9.5B Boyd Thermal acquisition added cooling." },
  SMCI: { name: "Super Micro Computer", primarySegment: "Compute", sectors: { Compute: 82, Infrastructure: 30, Power: 8, Cooling: 45, Grid: 5 }, explanation: "AI server manufacturer building rack-scale systems for NVIDIA GPUs." },
  SPY: { name: "SPDR S&P 500 ETF", primarySegment: "ETF", sectors: { Compute: 25, Infrastructure: 15, Power: 12, Cooling: 10, Grid: 10 }, explanation: "Broad market ETF. AI exposure via NVDA, MSFT, AMZN, GOOGL (~30% combined weight)." },
  QQQ: { name: "Invesco QQQ Trust", primarySegment: "ETF", sectors: { Compute: 45, Infrastructure: 20, Power: 10, Cooling: 12, Grid: 8 }, explanation: "Nasdaq-100 ETF, about 50% in mega-cap tech. Significant AI/compute exposure." },
  XLU: { name: "Utilities Select SPDR ETF", primarySegment: "ETF", sectors: { Compute: 2, Infrastructure: 5, Power: 72, Cooling: 3, Grid: 40 }, explanation: "Utility sector ETF. DC operators are signing long-term PPAs with utilities in this basket." },
  XLK: { name: "Technology Select SPDR ETF", primarySegment: "ETF", sectors: { Compute: 70, Infrastructure: 25, Power: 8, Cooling: 12, Grid: 5 }, explanation: "Technology sector ETF with semiconductor and cloud infrastructure holdings." },
  // Nuclear Operators & Generators
  TLN:  { name: "Talen Energy Corporation", primarySegment: "Nuclear", sectors: { Compute: 8, Infrastructure: 12, Power: 88, Cooling: 3, Grid: 32 }, explanation: "Susquehanna nuclear plant with direct Amazon BTM co-location deal. Clear AI power supply beneficiary." },
  NRG:  { name: "NRG Energy Inc", primarySegment: "Nuclear", sectors: { Compute: 4, Infrastructure: 8, Power: 70, Cooling: 3, Grid: 28 }, explanation: "Competitive power generator with nuclear fleet. Growing DC power contracts for dispatchable capacity." },
  // Uranium Mining & Fuel Cycle
  UEC:  { name: "Uranium Energy Corp", primarySegment: "Uranium", sectors: { Compute: 2, Infrastructure: 3, Power: 80, Cooling: 2, Grid: 8 }, explanation: "US-focused uranium miner using ISR production. Hub-and-spoke model as a low-cost domestic supplier." },
  LEU:  { name: "Centrus Energy Corp", primarySegment: "Uranium", sectors: { Compute: 3, Infrastructure: 5, Power: 88, Cooling: 2, Grid: 12 }, explanation: "Only US company licensed to produce HALEU for advanced reactors and SMRs. Key domestic fuel cycle node." },
  UUUU: { name: "Energy Fuels Inc", primarySegment: "Uranium", sectors: { Compute: 2, Infrastructure: 3, Power: 78, Cooling: 2, Grid: 8 }, explanation: "US uranium and rare earth producer. White Mesa Mill is the only operating conventional US uranium mill." },
  DNN:  { name: "Denison Mines Corp", primarySegment: "Uranium", sectors: { Compute: 2, Infrastructure: 3, Power: 75, Cooling: 2, Grid: 8 }, explanation: "Canadian uranium developer. Wheeler River ISR project in the Athabasca Basin targets low-cost production." },
  PALAF:{ name: "Paladin Energy Ltd", primarySegment: "Uranium", sectors: { Compute: 2, Infrastructure: 3, Power: 76, Cooling: 2, Grid: 8 }, explanation: "Australian uranium producer. Langer Heinrich mine in Namibia restarted production in 2024." },
  // SMR & Advanced Nuclear
  OKLO: { name: "Oklo Inc", primarySegment: "SMR", sectors: { Compute: 10, Infrastructure: 18, Power: 90, Cooling: 5, Grid: 35 }, explanation: "Advanced fission company with 14 GW customer pipeline. Received FERC approval for Aurora powerhouse design." },
  BWXT: { name: "BWX Technologies Inc", primarySegment: "SMR", sectors: { Compute: 5, Infrastructure: 10, Power: 82, Cooling: 5, Grid: 25 }, explanation: "Sole manufacturer of US naval nuclear reactors. $7.4B backlog with expanding commercial SMR business." },
  SMR:  { name: "NuScale Power Corp", primarySegment: "SMR", sectors: { Compute: 8, Infrastructure: 12, Power: 88, Cooling: 5, Grid: 30 }, explanation: "Only NRC-certified SMR design in the US. VOYGR plant expected ~2030 (est.). Expanding internationally." },
  // Power Hardware & Electrical Equipment
  GEV:  { name: "GE Vernova Inc", primarySegment: "PowerHardware", sectors: { Compute: 5, Infrastructure: 12, Power: 38, Cooling: 8, Grid: 88 }, explanation: "Gas turbines indicate DC buildout pace. BWRX-300 SMR adds nuclear optionality. $41-42B revenue guidance for 2026." },
  NVT:  { name: "nVent Electric PLC", primarySegment: "PowerHardware", sectors: { Compute: 5, Infrastructure: 22, Power: 18, Cooling: 75, Grid: 65 }, explanation: "High-density power distribution and enclosures for AI racks. 65% organic order growth from liquid cooling." },
  CARR: { name: "Carrier Global Corp", primarySegment: "PowerHardware", sectors: { Compute: 5, Infrastructure: 15, Power: 10, Cooling: 70, Grid: 20 }, explanation: "DC cooling systems and precision HVAC. Exposure to thermal management for high-density AI compute." },
  ABB:  { name: "ABB Ltd", primarySegment: "PowerHardware", sectors: { Compute: 5, Infrastructure: 18, Power: 22, Cooling: 25, Grid: 80 }, explanation: "Power distribution, automation, and electrification. Major DC power supplier with grid switchgear." },
  EMR:  { name: "Emerson Electric Co", primarySegment: "PowerHardware", sectors: { Compute: 5, Infrastructure: 18, Power: 15, Cooling: 30, Grid: 60 }, explanation: "Automation and power management for DCs. AspenTech software in energy infrastructure." },
  HUBB: { name: "Hubbell Inc", primarySegment: "PowerHardware", sectors: { Compute: 3, Infrastructure: 12, Power: 15, Cooling: 10, Grid: 72 }, explanation: "Electrical products for utility and commercial markets. Beneficiary of grid expansion for DC campuses." },
  JCI:  { name: "Johnson Controls Int'l", primarySegment: "PowerHardware", sectors: { Compute: 3, Infrastructure: 12, Power: 8, Cooling: 65, Grid: 30 }, explanation: "Building automation and HVAC including DC cooling. Retrofit demand from facilities upgrading for AI density." },
  SIEGY:{ name: "Siemens Energy AG", primarySegment: "PowerHardware", sectors: { Compute: 4, Infrastructure: 10, Power: 32, Cooling: 8, Grid: 82 }, explanation: "Gas turbines competing with GEV for DC power orders. Transformer production at capacity." },
  BKR:  { name: "Baker Hughes Co", primarySegment: "PowerHardware", sectors: { Compute: 3, Infrastructure: 8, Power: 30, Cooling: 5, Grid: 55 }, explanation: "Gas turbine technology and LNG equipment. Growing from DC on-site gas generation demand." },
  // Utilities (AI Load Beneficiaries)
  D:    { name: "Dominion Energy Inc", primarySegment: "Utilities", sectors: { Compute: 5, Infrastructure: 15, Power: 78, Cooling: 5, Grid: 42 }, explanation: "Serves Northern Virginia (70% of US internet traffic). 40-47 GW of DC capacity in contract discussions." },
  SO:   { name: "Southern Company", primarySegment: "Utilities", sectors: { Compute: 3, Infrastructure: 12, Power: 72, Cooling: 4, Grid: 38 }, explanation: "Georgia hub for Southeast DC growth. Vogtle units 3-4 provide 24/7 baseload. 50+ GW interconnection pipeline." },
  DUK:  { name: "Duke Energy Corp", primarySegment: "Utilities", sectors: { Compute: 3, Infrastructure: 10, Power: 70, Cooling: 4, Grid: 36 }, explanation: "Carolinas and Southeast utility. Growing DC interconnection requests in its territory." },
  AEP:  { name: "American Electric Power", primarySegment: "Utilities", sectors: { Compute: 3, Infrastructure: 10, Power: 68, Cooling: 4, Grid: 42 }, explanation: "Major PJM utility. 40 GW of new DC interconnection requests filed in its territory." },
  XEL:  { name: "Xcel Energy Inc", primarySegment: "Utilities", sectors: { Compute: 3, Infrastructure: 8, Power: 65, Cooling: 3, Grid: 35 }, explanation: "Midwest utility in Minnesota and Colorado. Microsoft and Google targeting its service territory." },
  EVRG: { name: "Evergy Inc", primarySegment: "Utilities", sectors: { Compute: 2, Infrastructure: 7, Power: 62, Cooling: 3, Grid: 30 }, explanation: "Kansas/Missouri utility with growing DC interest. Favorable land and power costs in its territory." },
  PPL:  { name: "PPL Corporation", primarySegment: "Utilities", sectors: { Compute: 2, Infrastructure: 8, Power: 60, Cooling: 3, Grid: 30 }, explanation: "Mid-Atlantic and Kentucky utility with PJM exposure. Transmission assets near DC clusters." },
  PCG:  { name: "PG&E Corp", primarySegment: "Utilities", sectors: { Compute: 3, Infrastructure: 10, Power: 65, Cooling: 4, Grid: 35 }, explanation: "California utility serving Silicon Valley DC campuses. Grid investment needed for load growth." },
  // Construction & EPC (Infrastructure Builders)
  PWR:  { name: "Quanta Services Inc", primarySegment: "Construction", sectors: { Compute: 5, Infrastructure: 28, Power: 12, Cooling: 8, Grid: 88 }, explanation: "Largest electrical utility contractor in North America. Builds transmission and substations connecting DC campuses." },
  EME:  { name: "EMCOR Group Inc", primarySegment: "Construction", sectors: { Compute: 5, Infrastructure: 35, Power: 10, Cooling: 38, Grid: 65 }, explanation: "Electrical and mechanical DC infrastructure. $4.3B RPO in network segment. Record backlog from DC construction." },
  MTZ:  { name: "MasTec Inc", primarySegment: "Construction", sectors: { Compute: 3, Infrastructure: 25, Power: 10, Cooling: 12, Grid: 70 }, explanation: "Infrastructure builder with growing DC revenue. Builds electrical backbone connecting AI facilities to grid." },
  STRL: { name: "Sterling Infrastructure Inc", primarySegment: "Construction", sectors: { Compute: 5, Infrastructure: 30, Power: 8, Cooling: 10, Grid: 60 }, explanation: "DC site development with 125% YoY revenue growth. Builds foundations and civil infrastructure for campuses." },
  FLR:  { name: "Fluor Corporation", primarySegment: "Construction", sectors: { Compute: 3, Infrastructure: 20, Power: 15, Cooling: 8, Grid: 55 }, explanation: "Engineering and construction for energy infrastructure. Power generation and grid projects." },
  PRIM: { name: "Primoris Services Corp", primarySegment: "Construction", sectors: { Compute: 2, Infrastructure: 18, Power: 10, Cooling: 5, Grid: 68 }, explanation: "Utility infrastructure and power delivery. Growing grid expansion exposure from DC load growth." },
  // Sector ETFs (Benchmarks)
  URNM: { name: "Sprott Uranium Miners ETF", primarySegment: "ETF", sectors: { Compute: 2, Infrastructure: 3, Power: 82, Cooling: 2, Grid: 10 }, explanation: "Pure-play uranium miners ETF. No dilution from utilities or equipment. High-beta uranium exposure." },
  DTCR: { name: "Global X Data Center ETF", primarySegment: "ETF", sectors: { Compute: 15, Infrastructure: 85, Power: 25, Cooling: 35, Grid: 22 }, explanation: "DC and digital infrastructure ETF. Tracks REITs, operators, and tech companies in DC infrastructure." },
  GRID: { name: "First Trust Nasdaq Smart Grid ETF", primarySegment: "ETF", sectors: { Compute: 3, Infrastructure: 15, Power: 22, Cooling: 5, Grid: 85 }, explanation: "Grid infrastructure ETF. Hardware, software, and utility companies modernizing the electrical grid." },
  PAVE: { name: "Global X US Infrastructure ETF", primarySegment: "ETF", sectors: { Compute: 3, Infrastructure: 30, Power: 12, Cooling: 8, Grid: 60 }, explanation: "US infrastructure ETF. Tracks construction and materials companies in DC and grid buildout." },
  // Raw Materials - Mining & Metals
  FCX:  { name: "Freeport-McMoRan Inc", primarySegment: "RawMaterials", sectors: { Compute: 3, Infrastructure: 10, Power: 8, Cooling: 5, Grid: 45 }, explanation: "Largest publicly traded copper producer. Copper is used in every DC power system and grid interconnection." },
  SCCO: { name: "Southern Copper Corp", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 8, Power: 7, Cooling: 4, Grid: 42 }, explanation: "Major copper miner in Mexico and Peru. Copper demand growing from DC electrification and grid expansion." },
  TECK: { name: "Teck Resources Ltd", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 8, Power: 6, Cooling: 3, Grid: 38 }, explanation: "Transitioning to pure-play copper after selling coal. Copper exposure tied to grid buildout." },
  HBM:  { name: "Hudbay Minerals Inc", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 6, Power: 5, Cooling: 3, Grid: 35 }, explanation: "Mid-tier copper and gold miner in Peru, Manitoba, and Arizona. Copper Flat expansion adds supply." },
  NUE:  { name: "Nucor Corporation", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 25, Power: 5, Cooling: 3, Grid: 30 }, explanation: "Largest North American steel producer using electric arc furnaces. Structural steel for DC construction." },
  STLD: { name: "Steel Dynamics Inc", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 22, Power: 4, Cooling: 3, Grid: 28 }, explanation: "Electric arc furnace steelmaker. Structural steel and rebar volumes from DC campus construction." },
  CLF:  { name: "Cleveland-Cliffs Inc", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 20, Power: 4, Cooling: 3, Grid: 25 }, explanation: "Largest North American flat-rolled steel producer. Supplies steel for DC shells and grid infrastructure." },
  X:    { name: "United States Steel Corp", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 18, Power: 4, Cooling: 3, Grid: 24 }, explanation: "Integrated steel producer. Plate and structural products for DC and grid projects." },
  MP:   { name: "MP Materials Corp", primarySegment: "RawMaterials", sectors: { Compute: 5, Infrastructure: 8, Power: 10, Cooling: 3, Grid: 20 }, explanation: "Only integrated Western Hemisphere rare earth operation. Rare earths used in wind turbine and EV magnets." },
  BHP:  { name: "BHP Group Ltd", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 12, Power: 8, Cooling: 3, Grid: 40 }, explanation: "Largest mining company by market cap. Major copper producer with electrification and grid exposure." },
  RIO:  { name: "Rio Tinto Group", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 12, Power: 7, Cooling: 3, Grid: 38 }, explanation: "Global miner with copper and aluminum production. Both metals used in DC electrical infrastructure." },
  VALE: { name: "Vale S.A.", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 10, Power: 6, Cooling: 3, Grid: 35 }, explanation: "Largest nickel producer and major copper producer. Nickel used in DC battery backup systems." },
  COPX: { name: "Global X Copper Miners ETF", primarySegment: "ETF", sectors: { Compute: 2, Infrastructure: 8, Power: 6, Cooling: 3, Grid: 42 }, explanation: "Global copper miners ETF. Exposure to copper demand from DC electrification and grid expansion." },
  // Raw Materials - Natural Gas
  AR:   { name: "Antero Resources Corp", primarySegment: "NatGas", sectors: { Compute: 2, Infrastructure: 5, Power: 55, Cooling: 2, Grid: 15 }, explanation: "Appalachian gas producer. Gas-fired generation serves as bridge fuel for DC power." },
  EQT:  { name: "EQT Corporation", primarySegment: "NatGas", sectors: { Compute: 2, Infrastructure: 5, Power: 58, Cooling: 2, Grid: 18 }, explanation: "Largest US natural gas producer. DC operators signing long-term gas supply agreements." },
  RRC:  { name: "Range Resources Corp", primarySegment: "NatGas", sectors: { Compute: 2, Infrastructure: 5, Power: 52, Cooling: 2, Grid: 14 }, explanation: "Appalachian gas and NGL producer. Benefits from gas demand for DC power in PJM." },
  SWN:  { name: "Southwestern Energy Co", primarySegment: "NatGas", sectors: { Compute: 2, Infrastructure: 5, Power: 50, Cooling: 2, Grid: 14 }, explanation: "Gas producer in Appalachia and Haynesville. DC power generation drives demand growth." },
  LNG:  { name: "Cheniere Energy Inc", primarySegment: "NatGas", sectors: { Compute: 2, Infrastructure: 8, Power: 48, Cooling: 2, Grid: 20 }, explanation: "Largest US LNG exporter. Domestic gas price support indirectly affects DC power costs." },
  // Renewable Generation
  FSLR: { name: "First Solar Inc", primarySegment: "Renewables", sectors: { Compute: 3, Infrastructure: 12, Power: 65, Cooling: 3, Grid: 30 }, explanation: "Largest US solar panel manufacturer. Hyperscalers signing solar PPAs for DC operations." },
  ENPH: { name: "Enphase Energy Inc", primarySegment: "Renewables", sectors: { Compute: 3, Infrastructure: 8, Power: 55, Cooling: 3, Grid: 25 }, explanation: "Microinverter technology for solar. Distributed generation supports DC renewable targets." },
  SEDG: { name: "SolarEdge Technologies", primarySegment: "Renewables", sectors: { Compute: 3, Infrastructure: 8, Power: 52, Cooling: 3, Grid: 22 }, explanation: "Solar inverter and power optimizer manufacturer. Feeds grids facing DC load growth." },
  AES:  { name: "AES Corporation", primarySegment: "Renewables", sectors: { Compute: 3, Infrastructure: 15, Power: 68, Cooling: 4, Grid: 35 }, explanation: "Global power company with large renewable portfolio. Multi-GW PPAs with Google and Microsoft." },
  // Transmission & Grid Hardware
  WIRE: { name: "Encore Wire Corp", primarySegment: "TransmissionGrid", sectors: { Compute: 2, Infrastructure: 15, Power: 10, Cooling: 3, Grid: 72 }, explanation: "Copper and aluminum wire manufacturer. Every DC needs copper wiring from grid interconnection to rack." },
  GNRC: { name: "Generac Holdings Inc", primarySegment: "TransmissionGrid", sectors: { Compute: 2, Infrastructure: 12, Power: 20, Cooling: 3, Grid: 55 }, explanation: "Backup power generator manufacturer. Commercial/industrial segment growing from DC demand." },
  AYI:  { name: "Acuity Brands Inc", primarySegment: "TransmissionGrid", sectors: { Compute: 2, Infrastructure: 10, Power: 5, Cooling: 3, Grid: 45 }, explanation: "Intelligent lighting and building management. DC facilities need advanced electrical controls." },
  AOS:  { name: "A.O. Smith Corporation", primarySegment: "TransmissionGrid", sectors: { Compute: 2, Infrastructure: 8, Power: 8, Cooling: 35, Grid: 30 }, explanation: "Water heating and treatment technology. DC cooling uses water-based thermal management systems." },
  IDA:  { name: "IDACORP Inc", primarySegment: "TransmissionGrid", sectors: { Compute: 2, Infrastructure: 10, Power: 60, Cooling: 3, Grid: 45 }, explanation: "Idaho utility with hydroelectric generation. Meta and others targeting Idaho for low-cost clean power." },
  // Crypto/AI DC Operators
  CLSK: { name: "CleanSpark Inc", primarySegment: "CryptoAIDC", sectors: { Compute: 20, Infrastructure: 60, Power: 35, Cooling: 25, Grid: 15 }, explanation: "Bitcoin miner pivoting excess capacity toward AI/HPC hosting. Growing DC infrastructure." },
  MARA: { name: "MARA Holdings Inc", primarySegment: "CryptoAIDC", sectors: { Compute: 18, Infrastructure: 55, Power: 30, Cooling: 22, Grid: 12 }, explanation: "Largest public Bitcoin miner by hash rate. Exploring AI/HPC hosting for DC infrastructure." },
  // Additional Compute (AI Networking & Servers)
  AVGO: { name: "Broadcom Inc", primarySegment: "Compute", sectors: { Compute: 75, Infrastructure: 20, Power: 8, Cooling: 10, Grid: 5 }, explanation: "Custom AI accelerators (Google TPU, ASICs) and networking silicon. Key DC interconnect supplier." },
  DELL: { name: "Dell Technologies Inc", primarySegment: "Compute", sectors: { Compute: 55, Infrastructure: 35, Power: 8, Cooling: 15, Grid: 5 }, explanation: "PowerEdge AI server line. Growing AI infrastructure revenue from enterprise compute buildout." },
  ANET: { name: "Arista Networks Inc", primarySegment: "Compute", sectors: { Compute: 40, Infrastructure: 30, Power: 5, Cooling: 8, Grid: 5 }, explanation: "DC networking switches and software. Dominates cloud provider network deployments." },
  MRVL: { name: "Marvell Technology Inc", primarySegment: "Compute", sectors: { Compute: 65, Infrastructure: 18, Power: 5, Cooling: 8, Grid: 5 }, explanation: "Custom AI accelerator and DC networking silicon. Electro-optics for hyperscaler infrastructure." },
};

export const STACK_TICKERS = {
  compute:            ["NVDA", "TSM", "AMD", "MU", "MSFT", "GOOGL", "META", "AAPL", "SMCI", "AMZN", "INTC", "AVGO", "DELL", "ANET", "MRVL"],
  nuclear:            ["CEG", "VST", "TLN", "NRG", "OKLO", "BWXT", "SMR"],
  uranium:            ["CCJ", "UEC", "LEU", "UUUU", "DNN", "NXE", "PALAF"],
  powerHardware:      ["GEV", "ETN", "VRT", "NVT", "CARR", "ABB", "EMR", "HUBB", "JCI", "SIEGY", "BKR"],
  utilities:          ["NEE", "D", "SO", "DUK", "AEP", "XEL", "EVRG", "PPL", "PCG", "ETR"],
  dataCenters:        ["EQIX", "DLR", "AMT", "IREN"],
  construction:       ["PWR", "EME", "MTZ", "STRL", "FLR", "PRIM"],
  rawMaterialsMining: ["FCX", "SCCO", "TECK", "HBM", "NUE", "STLD", "CLF", "X", "MP", "BHP", "RIO", "VALE", "COPX"],
  rawMaterialsNatGas: ["AR", "EQT", "RRC", "SWN", "LNG"],
  renewableGeneration:["FSLR", "ENPH", "SEDG", "AES"],
  transmissionGrid:   ["WIRE", "GNRC", "AYI", "AOS", "IDA"],
  cryptoAIDC:         ["CLSK", "MARA"],
  etfsBenchmarks:     ["URA", "URNM", "NLR", "DTCR", "GRID", "XLU", "PAVE", "QQQ", "XLK", "SPY", "TSLA"],
};
export const ALL_STACK_TICKERS = Object.values(STACK_TICKERS).flat();

/** A stock page exists for this ticker (case-insensitive). */
export function knownTicker(ticker: string): boolean {
  return Object.prototype.hasOwnProperty.call(COMPANY_DATABASE, ticker.toUpperCase());
}
