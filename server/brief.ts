// ─── Weekly Buildout Brief (pure) ────────────────────────────────────────
//
// A deterministic synthesis of the live module metrics (Compute Frontier, GPU
// rental prices, the grid queue, AI power deals) into one short, readable report.
// composeBrief() builds the structured brief; renderBriefText() flattens it to
// plaintext for the newsletter body and social. No fabricated numbers — every
// line is one of the figures the modules already compute.

export interface BriefInput {
  asOf: string;
  compute: {
    clusterCount: number;
    plannedGW: number;
    operationalGW: number;
    operatorCount: number;
    topOperator: string | null;
    topOperatorSharePct: number;
    biggestName: string | null;
    biggestGW: number;
  };
  gpu: {
    fleetAvg: number;
    fleetAvg1yChange: number | null;
    h100: number;
    gb200: number;
    moverModel: string;
    moverChangePct: number;
    cheapestModel: string;
    cheapestPrice: number;
  };
  grid: { queueGW: number; medianWaitMonths: number; ercotGW: number };
  deals: {
    dealCount: number;
    contractedGW: number;
    topBuyer: string | null;
    topBuyerGW: number;
    topType: string | null;
    topTypeGW: number;
  };
}

export interface BriefSection {
  heading: string;
  points: string[];
}

export interface Brief {
  title: string;
  asOf: string;
  summary: string;
  sections: BriefSection[];
  takeaway: string;
}

const commas = (n: number) => n.toLocaleString("en-US");
const gw = (n: number) => (Number.isInteger(n) ? `${n} GW` : `${n.toFixed(1)} GW`);
const usd = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);
const pct = (n: number | null) => (n == null ? "flat" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);

function moverPhrase(model: string, changePct: number): string {
  const dir = changePct < 0 ? "down" : "up";
  return `${model} ${dir} ${Math.abs(Math.round(changePct))}%`;
}

export function composeBrief(input: BriefInput): Brief {
  const { compute: c, gpu: g, grid: q, deals: d } = input;

  const summary =
    `The US AI buildout we track now spans ${c.clusterCount} named compute clusters and ${gw(c.plannedGW)} of planned power ` +
    `across ${c.operatorCount} operators, with ${gw(c.operationalGW)} already live. ` +
    `${d.dealCount} corporate power deals cover ${gw(d.contractedGW)}, and on-demand GPUs rent for an average of ${usd(g.fleetAvg)}/GPU-hr.`;

  const compute: BriefSection = {
    heading: "Compute",
    points: [
      `${c.clusterCount} named clusters, ${gw(c.plannedGW)} planned, ${gw(c.operationalGW)} operational.`,
      ...(c.topOperator ? [`${c.topOperator} leads with ${Math.round(c.topOperatorSharePct)}% of planned capacity.`] : []),
      ...(c.biggestName ? [`Largest single site: ${c.biggestName} at ${gw(c.biggestGW)}.`] : []),
    ],
  };

  const gpu: BriefSection = {
    heading: "GPUs",
    points: [
      `Fleet on-demand average ${usd(g.fleetAvg)}/GPU-hr, ${pct(g.fleetAvg1yChange)} over the past year.`,
      `H100 ${usd(g.h100)}, GB200 ${usd(g.gb200)} per GPU-hr; cheapest is ${g.cheapestModel} at ${usd(g.cheapestPrice)}.`,
      `Biggest 12-month move: ${moverPhrase(g.moverModel, g.moverChangePct)}.`,
    ],
  };

  const grid: BriefSection = {
    heading: "Power & grid",
    points: [
      `${commas(q.queueGW)} GW waiting in US interconnection queues, ${q.medianWaitMonths}-month median wait.`,
      `ERCOT large-load queue alone: ${commas(q.ercotGW)} GW.`,
    ],
  };

  const deals: BriefSection = {
    heading: "Deals",
    points: [
      `${d.dealCount} corporate power deals, ${gw(d.contractedGW)} contracted.`,
      ...(d.topBuyer ? [`${d.topBuyer} is the largest buyer at ${gw(d.topBuyerGW)}.`] : []),
      ...(d.topType ? [`${d.topType} leads the contracted mix at ${gw(d.topTypeGW)}.`] : []),
    ],
  };

  const takeaway =
    `Demand keeps outrunning the grid: ${gw(c.plannedGW)} of planned compute against a ${q.medianWaitMonths}-month interconnection queue, ` +
    `while ${d.topBuyer ?? "hyperscalers"} and peers lock in their own power.`;

  return {
    title: `The AI Buildout — week of ${input.asOf}`,
    asOf: input.asOf,
    summary,
    sections: [compute, gpu, grid, deals],
    takeaway,
  };
}

/** Flatten the brief to plaintext for the newsletter body / a social thread. */
export function renderBriefText(b: Brief): string {
  const lines: string[] = [b.title, "", b.summary, ""];
  for (const s of b.sections) {
    lines.push(s.heading);
    for (const p of s.points) lines.push(`- ${p}`);
    lines.push("");
  }
  lines.push(b.takeaway, "", "https://gridtilt.com");
  return lines.join("\n");
}
