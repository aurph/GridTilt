import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Map, Link2, Layers } from "lucide-react";

interface BacklogHeadline {
  trackedProjects: number;
  trackedCapacityGW: number;
  queueOverallGW: number;
  queueOverallProjects: number;
  medianWaitMonths: number;
  historicalWithdrawalPct: number;
  dominionContractedGW: number;
  metaHyperionGW: number;
  stargateAbileneGW: number;
}

interface BacklogResponse {
  lastRefreshed: string;
  headline: BacklogHeadline;
}

interface CapexComponent {
  ticker: string;
  company: string;
  usdBillions: number;
  sourceUrl: string;
  sourceLabel: string;
}

interface CapexResponse {
  fy2025: {
    totalUsdBillions: number;
    components: CapexComponent[];
    asOf: string;
    notes: string;
  };
  lastRefreshed: string;
}

// Today's date for the lede dateline. Lowercased.
function formatDateline(): string {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).toLowerCase();
}

export default function WhatsHappening() {
  const { data: queue } = useQuery<BacklogResponse>({
    queryKey: ["/api/queue"],
    refetchInterval: 24 * 60 * 60 * 1000,
  });
  const { data: capex } = useQuery<CapexResponse>({
    queryKey: ["/api/hyperscaler-capex"],
    refetchInterval: 24 * 60 * 60 * 1000,
  });

  return (
    <section className="space-y-8 sm:space-y-10 py-4 sm:py-6" data-testid="whats-happening">
      <Lede />
      <TwoQuestions queue={queue?.headline} capex={capex?.fy2025} />
      <ScaleStrip queue={queue?.headline} />
      <LookNext />
      <SourcesFooter />
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function Lede() {
  return (
    <div className="max-w-3xl" data-testid="lede">
      <h1
        className="font-serif font-normal text-foreground leading-[1.05] text-3xl sm:text-4xl lg:text-5xl"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        american electricity demand was flat for fifteen years.{" "}
        <span className="italic text-[#F07800]">then it wasn't.</span>
      </h1>

      <div className="flex items-center gap-3 mt-5 mb-5">
        <div className="h-px w-16 bg-[#F07800]" />
        <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground/70">
          {formatDateline()}
        </span>
      </div>

      <p className="text-base sm:text-lg text-foreground/80 leading-relaxed max-w-2xl">
        something is being built in your country. you are paying for part of it on your electric bill.
        this page is an attempt to say what it is, in plain numbers, without pretending it's good or bad.
        all the data is sourced. the projections are clearly marked as projections.
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function TwoQuestions({
  queue,
  capex,
}: {
  queue: BacklogHeadline | undefined;
  capex: CapexResponse["fy2025"] | undefined;
}) {
  const capexTotal = capex?.totalUsdBillions ?? null;
  const stargateGW = queue?.stargateAbileneGW ?? 1.2;
  // Simultaneous residential draw equivalence: average US home pulls ~1.3 kW
  // averaged across the day. 1.2 GW / 1.3 kW ≈ 920,000 homes drawing at once.
  const homesEquivalent = Math.round((stargateGW * 1000) / 1.3 / 1000) * 1000;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" data-testid="two-questions">
      <QuestionCard
        question={
          <>
            why is my <em className="text-[#F0A500] not-italic font-serif italic">electricity bill</em> going up?
          </>
        }
        body={
          <>
            the same grid that powers your house powers the buildings where chatgpt,
            instagram recommendations, and netflix recommendations actually run.
            for fifteen years, total us electricity demand barely moved.
            in the last three, it has climbed about ten percent and is projected to keep climbing.
            utilities have to add generation, transmission, and substations to keep up,
            and those costs eventually land in regulated rates. that's the mechanism.
          </>
        }
        stats={[
          { value: "+10.6%", label: "total us electricity demand, 2022 → 2025 (EIA)" },
          { value: "+33%",   label: "datacenter electricity demand, 2024 → 2025 (EIA)" },
        ]}
        deepLink={{
          label: "see the demand chart below",
          href: "#demand-chart",
          isAnchor: true,
        }}
        deepLinkSecondary={{
          label: "and the virginia case →",
          href: "/queue",
        }}
        testId="question-bill"
      />
      <QuestionCard
        question={
          <>
            why are we <em className="text-[#F0A500] not-italic font-serif italic">building</em> datacenters in the first place?
          </>
        }
        body={
          <>
            the four largest us tech companies told their investors they will spend roughly{" "}
            {capexTotal ? `$${capexTotal} billion` : "hundreds of billions"} on infrastructure this year,
            mostly for ai compute. that money buys two things: rooms full of expensive chips,
            and the power to run them. a single new ai campus can draw as much electricity as a midsize city.
            the buildings have to go somewhere physical, the wires have to connect to a real substation,
            and a real transformer has to sit in front of them.
          </>
        }
        stats={[
          { value: `${stargateGW.toFixed(1)} GW`, label: "stargate abilene, texas (oracle + openai)" },
          { value: `~${(homesEquivalent / 1000).toFixed(0)}k homes`, label: "equivalent simultaneous residential draw" },
        ]}
        deepLink={{
          label: "see all named datacenters →",
          href: "/power-map",
        }}
        deepLinkSecondary={{
          label: "and 60 projects in the queue →",
          href: "/queue",
        }}
        testId="question-building"
      />
    </div>
  );
}

function QuestionCard({
  question,
  body,
  stats,
  deepLink,
  deepLinkSecondary,
  testId,
}: {
  question: React.ReactNode;
  body: React.ReactNode;
  stats: { value: string; label: string }[];
  deepLink: { label: string; href: string; isAnchor?: boolean };
  deepLinkSecondary?: { label: string; href: string };
  testId: string;
}) {
  return (
    <article
      className="relative bg-card border border-card-border rounded-[0.35rem] p-6 sm:p-7 group hover:border-border transition-colors"
      data-testid={testId}
    >
      {/* Left accent rail — the page's single biggest "this is editorial" cue */}
      <span
        className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#F07800] rounded-l-[0.35rem] group-hover:w-[4px] transition-all"
        aria-hidden
      />

      <h2
        className="font-serif text-xl sm:text-2xl text-foreground leading-tight mb-3"
        style={{ fontFamily: "var(--font-serif)", fontWeight: 500 }}
      >
        {question}
      </h2>

      <p className="text-sm text-foreground/80 leading-relaxed mb-5">
        {body}
      </p>

      <dl className="grid grid-cols-2 gap-4 mb-5 pt-5 border-t border-border/40">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="font-mono text-2xl sm:text-3xl font-bold tabular-nums text-[#F07800]">
              {s.value}
            </dt>
            <dd className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mt-1 leading-snug">
              {s.label}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {deepLink.isAnchor ? (
          <a
            href={deepLink.href}
            className="text-[#F07800] hover:text-[#F0A500] hover:underline"
          >
            {deepLink.label}
          </a>
        ) : (
          <Link href={deepLink.href} className="text-[#F07800] hover:text-[#F0A500] hover:underline">
            {deepLink.label}
          </Link>
        )}
        {deepLinkSecondary && (
          <Link href={deepLinkSecondary.href} className="text-muted-foreground hover:text-foreground hover:underline">
            {deepLinkSecondary.label}
          </Link>
        )}
      </div>
    </article>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function ScaleStrip({ queue }: { queue: BacklogHeadline | undefined }) {
  const tiles = [
    {
      value: queue ? `${queue.queueOverallGW.toLocaleString()} GW` : "— GW",
      label: "pending in the us power queue",
      anchor: "roughly two full us grids waiting in line.",
    },
    {
      value: queue ? `${queue.medianWaitMonths} months` : "— months",
      label: "median wait, request to energization",
      anchor: "enough time to start and finish a college degree.",
    },
    {
      value: queue ? `${queue.historicalWithdrawalPct}%` : "—%",
      label: "of projects historically get withdrawn",
      anchor: "most of what's in the queue won't get built.",
    },
    {
      value: queue ? `${queue.dominionContractedGW} GW` : "— GW",
      label: "already under contract in virginia",
      anchor: "one state, roughly the load of new york city twice.",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="scale-strip">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="border border-card-border rounded-[0.35rem] p-4 sm:p-5"
          data-testid={`scale-tile-${t.label.split(" ")[0]}`}
        >
          <div className="font-mono text-2xl sm:text-3xl font-bold tabular-nums text-foreground leading-none">
            {t.value}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mt-2 leading-snug">
            {t.label}
          </div>
          <div
            className="text-xs sm:text-sm text-foreground/70 italic mt-3 leading-snug"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {t.anchor}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function LookNext() {
  const cards = [
    {
      icon: Map,
      title: "the power map",
      body: "58 named us datacenter facilities, each with its operator, grid region, and megawatt rating. zoom and click.",
      href: "/power-map",
    },
    {
      icon: Link2,
      title: "the supply chain",
      body: "a force graph of 24 nodes from raw uranium and copper to the gpus you're paying for. green means flowing, red means stuck.",
      href: "/supply-chain",
    },
    {
      icon: Layers,
      title: "the backlog",
      body: "60 named real projects waiting on the grid: tmi restart, susquehanna-amazon, meta hyperion, stargate abilene. all sourced.",
      href: "/queue",
    },
  ];
  return (
    <div data-testid="look-next">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 mb-3">
        where to look next
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.href} href={c.href}>
              <article
                className="border border-card-border rounded-[0.35rem] p-4 cursor-pointer hover:border-border transition-colors h-full bg-card"
                data-testid={`look-next-${c.href.slice(1)}`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">{c.title}</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{c.body}</p>
              </article>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function SourcesFooter() {
  return (
    <p
      className="text-[11px] font-mono text-muted-foreground/60 leading-relaxed pt-3 border-t border-border/40"
      data-testid="sources-footer"
    >
      sources: u.s. energy information administration · lawrence berkeley national lab queued up 2025 ·
      pjm, ercot, miso operator filings · sec 10-ks and 8-ks · ferc and nrc dockets.
      every project on{" "}
      <Link href="/queue" className="text-[#F07800] hover:text-[#F0A500] hover:underline">/queue</Link>
      {" "}links its sources.
      this site is research, not investment advice. no ads, no affiliate links, no paid placements.
      built solo by Jack Schwartz.
    </p>
  );
}
