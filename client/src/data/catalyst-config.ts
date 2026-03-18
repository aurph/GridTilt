export type CatalystCategory = 'Regulatory' | 'Policy' | 'Infrastructure' | 'Market' | 'Industry';

export const catalystCategoryColors: Record<CatalystCategory, string> = {
  Regulatory:     '#F0A500',
  Policy:         '#A855F7',
  Infrastructure: '#22C55E',
  Market:         '#3B82F6',
  Industry:       '#F07800',
};

export interface ManualCatalyst {
  id: string;
  category: CatalystCategory;
  title: string;
  description: string;
  dateLabel: string;
  sortDate: string;
  affectedTickers: string[];
  affectedSectors: string[];
}

export const manualCatalysts: ManualCatalyst[] = [
  {
    id: 'palisades-restart',
    category: 'Regulatory',
    title: 'NRC Review: Palisades Nuclear Restart',
    description: 'Decision on restarting Michigan\'s Palisades plant could set precedent for the nuclear comeback wave.',
    dateLabel: 'Apr 2026',
    sortDate: '2026-04-15',
    affectedTickers: ['CEG', 'VST', 'TLN'],
    affectedSectors: ['Nuclear'],
  },
  {
    id: 'pjm-auction',
    category: 'Market',
    title: 'PJM Capacity Auction Results',
    description: 'Largest US grid operator capacity prices signal how much new generation the market needs. Previous auction saw record-high clearing prices.',
    dateLabel: 'Q2 2026',
    sortDate: '2026-05-01',
    affectedTickers: ['VST', 'CEG', 'NRG'],
    affectedSectors: ['Generation'],
  },
  {
    id: 'ferc-order-1920',
    category: 'Infrastructure',
    title: 'FERC Transmission Planning Rule (Order 1920)',
    description: 'Federal rule requiring 20-year transmission planning could unlock billions in grid buildout spending.',
    dateLabel: '2026',
    sortDate: '2026-06-01',
    affectedTickers: ['PWR', 'ETN', 'EMR'],
    affectedSectors: ['Transmission'],
  },
  {
    id: 'doe-loan-programs',
    category: 'Regulatory',
    title: 'DOE Loan Programs for Nuclear/Grid',
    description: '$400B+ in lending authority for clean energy. DOE has accelerated disbursement for grid and nuclear projects.',
    dateLabel: '2026-2027',
    sortDate: '2026-06-15',
    affectedTickers: ['SMR', 'OKLO', 'BWXT', 'GEV'],
    affectedSectors: ['Nuclear', 'Grid'],
  },
  {
    id: 'hyperscaler-capex',
    category: 'Industry',
    title: 'Hyperscaler Capex Guidance Updates',
    description: 'Every quarterly earnings from META, MSFT, AMZN, GOOGL includes updated AI infrastructure capex guidance. The single biggest demand signal for the entire chain.',
    dateLabel: 'Ongoing (quarterly)',
    sortDate: '2026-04-29',
    affectedTickers: ['META', 'MSFT', 'AMZN', 'GOOGL'],
    affectedSectors: ['End Use', 'Distribution'],
  },
  {
    id: 'lpt-tariffs',
    category: 'Market',
    title: 'Large Power Transformer Import Tariff Decisions',
    description: 'Trade policy on LPT imports directly affects the transmission bottleneck. Higher tariffs mean longer domestic queues, benefiting US manufacturers like Eaton.',
    dateLabel: 'Mid-2026',
    sortDate: '2026-07-01',
    affectedTickers: ['ETN', 'ABB', 'PWR'],
    affectedSectors: ['Transmission'],
  },
  {
    id: 'tmi-restart',
    category: 'Infrastructure',
    title: 'Three Mile Island Unit 1 Restart',
    description: 'Constellation\'s deal with Microsoft to restart TMI Unit 1. Approximately 800 MW nuclear capacity targeted for 2028. NRC review and public comment ongoing.',
    dateLabel: '2026-2028',
    sortDate: '2026-08-01',
    affectedTickers: ['CEG', 'MSFT'],
    affectedSectors: ['Nuclear'],
  },
  {
    id: 'epa-emissions',
    category: 'Regulatory',
    title: 'EPA Power Plant Emissions Rules',
    description: 'New EPA rules on gas plant emissions could reshape economics and timelines for new gas generation. Critical for bridging near-term AI power demand.',
    dateLabel: '2026',
    sortDate: '2026-09-01',
    affectedTickers: ['GEV', 'BKR', 'NRG', 'VST'],
    affectedSectors: ['Generation'],
  },
];

export interface EarningsSeed {
  ticker: string;
  company: string;
  date: string;
  time: 'BMO' | 'AMC' | 'TBD';
  quarter: string;
}

export const earningsSeed: EarningsSeed[] = [
  { ticker: 'MU',   company: 'Micron Technology',       date: '2026-03-18', time: 'AMC', quarter: 'Q2 FY2026' },
  { ticker: 'TSM',  company: 'Taiwan Semiconductor',    date: '2026-04-16', time: 'BMO', quarter: 'Q1 2026' },
  { ticker: 'GEV',  company: 'GE Vernova',              date: '2026-04-22', time: 'BMO', quarter: 'Q1 2026' },
  { ticker: 'INTC', company: 'Intel Corp',              date: '2026-04-23', time: 'AMC', quarter: 'Q1 2026' },
  { ticker: 'DLR',  company: 'Digital Realty Trust',     date: '2026-04-23', time: 'AMC', quarter: 'Q1 2026' },
  { ticker: 'NEE',  company: 'NextEra Energy',          date: '2026-04-28', time: 'BMO', quarter: 'Q1 2026' },
  { ticker: 'ENPH', company: 'Enphase Energy',          date: '2026-04-28', time: 'AMC', quarter: 'Q1 2026' },
  { ticker: 'META', company: 'Meta Platforms',           date: '2026-04-29', time: 'AMC', quarter: 'Q1 2026' },
  { ticker: 'MSFT', company: 'Microsoft',               date: '2026-04-29', time: 'AMC', quarter: 'Q1 2026' },
  { ticker: 'AAPL', company: 'Apple',                   date: '2026-04-30', time: 'AMC', quarter: 'Q2 FY2026' },
  { ticker: 'AMZN', company: 'Amazon',                  date: '2026-04-30', time: 'AMC', quarter: 'Q1 2026' },
  { ticker: 'AMD',  company: 'Advanced Micro Devices',  date: '2026-05-05', time: 'AMC', quarter: 'Q1 2026' },
  { ticker: 'ETN',  company: 'Eaton Corporation',       date: '2026-05-05', time: 'BMO', quarter: 'Q1 2026' },
  { ticker: 'FSLR', company: 'First Solar',             date: '2026-05-05', time: 'AMC', quarter: 'Q1 2026' },
  { ticker: 'GNRC', company: 'Generac Holdings',        date: '2026-05-06', time: 'BMO', quarter: 'Q1 2026' },
  { ticker: 'NRG',  company: 'NRG Energy',              date: '2026-05-11', time: 'BMO', quarter: 'Q1 2026' },
  { ticker: 'VST',  company: 'Vistra Corp',             date: '2026-05-13', time: 'BMO', quarter: 'Q1 2026' },
  { ticker: 'NVDA', company: 'NVIDIA',                  date: '2026-05-20', time: 'AMC', quarter: 'Q1 FY2027' },
];

export const SUPPLY_CHAIN_STAGE_MAP: Record<string, string> = {
  CCJ: 'Raw Materials', UEC: 'Raw Materials', NXE: 'Raw Materials', DNN: 'Raw Materials',
  UUUU: 'Raw Materials', LEU: 'Raw Materials', FCX: 'Raw Materials', SCCO: 'Raw Materials',
  TECK: 'Raw Materials', HBM: 'Raw Materials', NUE: 'Raw Materials', STLD: 'Raw Materials',
  CLF: 'Raw Materials', X: 'Raw Materials', MP: 'Raw Materials', BHP: 'Raw Materials',
  RIO: 'Raw Materials', VALE: 'Raw Materials', AR: 'Raw Materials', EQT: 'Raw Materials',
  RRC: 'Raw Materials', SWN: 'Raw Materials', LNG: 'Raw Materials',
  CEG: 'Generation', VST: 'Generation', TLN: 'Generation', NRG: 'Generation',
  GEV: 'Generation', SIEGY: 'Generation', BKR: 'Generation', SMR: 'Generation',
  OKLO: 'Generation', BWXT: 'Generation', NEE: 'Generation', AES: 'Generation',
  FSLR: 'Generation', ENPH: 'Generation', SEDG: 'Generation', SO: 'Generation',
  DUK: 'Generation', AEP: 'Generation',
  ETN: 'Transmission', ABB: 'Transmission', PWR: 'Transmission', EMR: 'Transmission',
  HUBB: 'Transmission', AYI: 'Transmission', WIRE: 'Transmission', GNRC: 'Transmission',
  IDA: 'Transmission', NVT: 'Transmission',
  VRT: 'Distribution', CARR: 'Distribution', JCI: 'Distribution', EME: 'Distribution',
  MTZ: 'Distribution', STRL: 'Distribution', FLR: 'Distribution', J: 'Distribution',
  ACM: 'Distribution', PRIM: 'Distribution',
  EQIX: 'End Use', DLR: 'End Use', AMT: 'End Use', NVDA: 'End Use', AMD: 'End Use',
  AVGO: 'End Use', TSM: 'End Use', MU: 'End Use', INTC: 'End Use', SMCI: 'End Use',
  META: 'End Use', AMZN: 'End Use', MSFT: 'End Use', GOOGL: 'End Use', AAPL: 'End Use',
  IREN: 'End Use', CLSK: 'End Use', MARA: 'End Use',
};

export const STAGE_COLORS: Record<string, string> = {
  'Raw Materials': '#C87533',
  'Generation': '#F07800',
  'Transmission': '#3B82F6',
  'Distribution': '#22C55E',
  'End Use': '#A855F7',
};
