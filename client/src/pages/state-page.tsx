/**
 * A state's page (/state/:slug): its grid operator and NERC outlook, recent
 * public decisions with their documents, the next public dates, the projects
 * GridTilt records there, and what the data cannot say about a bill. The
 * server writes the same record into the HTML and serves it as JSON, so the
 * two cannot differ. The interactive view of the state stays in My Grid.
 */
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/Freshness";
import { PageHeader } from "@/components/PageHeader";

interface StateDocument {
  date: string;
  jurisdiction: string;
  title: string;
  summary: string;
  source: string;
  url: string;
}

interface StateNextDate {
  date: string;
  what: string;
  source: string;
  url: string;
}

interface StateProject {
  id: string;
  name: string;
  operator: string;
  status: string;
  plannedMW: number | null;
  plannedEstimated: boolean;
  city: string | null;
  url: string;
}

interface StatePageData {
  code: string;
  slug: string;
  name: string;
  operatorLabel: string;
  operatorNote: string | null;
  nerc: {
    key: string;
    label: string;
    season: string;
    margin: number;
    reference: number;
    referenceDefault: boolean;
    risk: string;
    outlook: string | null;
    cushion: number;
  } | null;
  nercGap: string | null;
  nercNote: string | null;
  nercSource: { label: string; url: string };
  registry: { floorMW: number; tracked: number };
  projects: StateProject[];
  documents: StateDocument[];
  nextDates: StateNextDate[];
  billSource: { source: string; url: string };
  reviewed: string;
  canonical: string;
  myGridUrl: string;
}

interface RatePoint {
  month: string;
  centsPerKwh: number;
}

type RetailRates =
  | { configured: false; howTo: string }
  | { configured: true; unit: string; source: string; sourceUrl: string; stale?: boolean; byState: Record<string, RatePoint[]> };

/** EIA's own table of average prices by state, for when the feed is unavailable. */
const EIA_STATE_PRICES_URL = "https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a";

const STATUS_WORDS: Record<string, string> = {
  operational: "operating",
  construction: "under construction",
  announced: "announced",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function longDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${d}, ${y}` : day;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${y}` : month;
}

export default function StatePage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, isError, error, refetch } = useQuery<StatePageData>({
    queryKey: [`/api/state-pages/${slug}`],
  });
  const notFound = isError && /^404/.test(String((error as Error)?.message ?? ""));

  const { data: rates, isError: ratesError } = useQuery<RetailRates>({
    queryKey: ["/api/physical/retail-rates"],
    // 503 is an honest "not configured" payload, not a failure.
    queryFn: async () => {
      const res = await fetch("/api/physical/retail-rates");
      if (!res.ok && res.status !== 503) throw new Error(`retail-rates ${res.status}`);
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
    enabled: Boolean(data),
  });

  if (notFound) {
    return (
      <div className="p-6 text-sm text-muted-foreground" data-testid="state-page-missing">
        There is no state page at this address yet. Every state is in{" "}
        <Link href="/my-grid" className="text-brand hover:text-brand-2">My Grid</Link>.
      </div>
    );
  }

  const series = data && rates && "byState" in rates ? rates.byState[data.code] ?? [] : [];
  const latest = series.length ? series[series.length - 1] : null;
  const yearAgo = series.length >= 13 ? series[series.length - 13] : null;
  const yoy = latest && yearAgo ? ((latest.centsPerKwh - yearAgo.centsPerKwh) / yearAgo.centsPerKwh) * 100 : null;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <PageHeader
        title={data ? `${data.name}'s grid` : "State"}
        testId="state-page-header"
        about="One state's grid operator and reliability outlook, recent public decisions with their documents, the next public dates, and the projects GridTilt records there. Each item carries its date and source."
        right={
          data ? (
            <span className="flex items-center gap-3 text-11 text-muted-foreground">
              <span data-testid="state-page-reviewed">Reviewed {longDate(data.reviewed)}</span>
              <Link href={`/my-grid?state=${data.code}`} className="text-brand hover:text-brand-2" data-testid="state-page-my-grid">
                Open in My Grid →
              </Link>
            </span>
          ) : undefined
        }
      />

      <div className="flex-1 w-full max-w-[1000px] mx-auto p-4 sm:p-6 space-y-4">
        {isError ? (
          <ErrorState label="This state's page failed to load." onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <div className="space-y-3" aria-hidden="true">
            {Array(4).fill(null).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : (
          <>
            <Card className="border-card-border" data-testid="state-page-grid">
              <SectionTitle>Grid operator and reliability</SectionTitle>
              <div className="p-4 space-y-2 text-sm">
                <p className="text-foreground">
                  {data.operatorLabel}.{data.operatorNote ? <span className="text-muted-foreground"> {data.operatorNote}</span> : null}
                </p>
                {data.nerc ? (
                  <p className="text-muted-foreground" data-testid="state-page-nerc">
                    NERC area {data.nerc.key}: anticipated reserve margin{" "}
                    <span className="font-mono text-foreground">{data.nerc.margin.toFixed(1)}%</span> for {data.nerc.season}, against{" "}
                    {data.nerc.referenceDefault ? "NERC's default" : "its"} reference level of {data.nerc.reference}% ({data.nerc.cushion >= 0 ? "+" : ""}
                    {data.nerc.cushion.toFixed(1)} points). NERC rates the area {data.nerc.risk.toLowerCase()} risk
                    {data.nerc.outlook ? `; later years: ${data.nerc.outlook}` : ""}.
                  </p>
                ) : (
                  <p className="text-muted-foreground">{data.nercGap}</p>
                )}
                {data.nercNote && <p className="text-11 text-muted-foreground">{data.nercNote}</p>}
                <p className="text-10 text-muted-foreground/70">
                  <a href={data.nercSource.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-foreground">
                    {data.nercSource.label}
                  </a>
                </p>
              </div>
            </Card>

            <Card className="border-card-border" data-testid="state-page-documents">
              <SectionTitle>Recent public decisions</SectionTitle>
              {data.documents.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">None recorded yet.</p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {data.documents.map((d) => (
                    <li key={`${d.date}-${d.title}`} className="p-4 space-y-1">
                      <p className="text-11 text-muted-foreground">
                        {longDate(d.date)} · {d.jurisdiction}
                      </p>
                      <p className="text-sm font-semibold text-foreground">{d.title}</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">{d.summary}</p>
                      <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-11 text-brand hover:text-brand-2">
                        {d.source}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="border-card-border" data-testid="state-page-dates">
              <SectionTitle>Next public dates</SectionTitle>
              {data.nextDates.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">None recorded.</p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {data.nextDates.map((n) => (
                    <li key={`${n.date}-${n.what}`} className="p-4 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
                      <span className="font-mono text-xs text-foreground sm:w-40 shrink-0">{longDate(n.date)}</span>
                      <span className="text-xs text-muted-foreground">
                        {n.what}.{" "}
                        <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand-2">
                          {n.source}
                        </a>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="border-card-border" data-testid="state-page-projects">
              <SectionTitle>Data center projects GridTilt records here</SectionTitle>
              {data.projects.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">None recorded.</p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {data.projects.map((p) => (
                    <li key={p.id} className="p-4 flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm">
                        <Link href={`/compute-frontier/${p.id}`} className="text-foreground hover:text-brand underline decoration-dotted underline-offset-2">
                          {p.name}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {" "}· {p.operator}{p.city ? `, ${p.city}` : ""} · {STATUS_WORDS[p.status] ?? p.status}
                        </span>
                      </span>
                      {p.plannedMW != null && (
                        <span className="font-mono text-xs text-foreground tabular-nums">
                          {p.plannedMW.toLocaleString("en-US")} MW planned{p.plannedEstimated && <span className="ml-1 text-8 text-estimate">est.</span>}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="px-4 py-3 border-t border-border/50 text-11 leading-relaxed text-muted-foreground" data-testid="state-page-coverage">
                My Grid's facility map covers campuses of {data.registry.floorMW} MW and up and lists {data.registry.tracked} in {data.name}.
                Neither list is a complete count of the state's data centers; a project missing here is not evidence that none exists.
              </p>
            </Card>

            <Card className="border-card-border" data-testid="state-page-bill">
              <SectionTitle>Electricity prices, and what they cannot tell you about a bill</SectionTitle>
              <div className="p-4 space-y-2 text-xs leading-relaxed text-muted-foreground">
                {latest ? (
                  <p data-testid="state-page-rate">
                    Residential average, {monthLabel(latest.month)}:{" "}
                    <span className="font-mono text-sm text-foreground">{latest.centsPerKwh.toFixed(1)}¢/kWh</span>
                    {yoy != null && ` (${yoy >= 0 ? "+" : "−"}${Math.abs(yoy).toFixed(1)}% from a year earlier)`}.
                    {rates && "byState" in rates && rates.stale ? " The latest refresh from EIA failed; this is the previous figure." : ""}
                  </p>
                ) : (
                  <p data-testid="state-page-rate-unavailable">
                    {ratesError || (rates && !("byState" in rates)) || (rates && series.length === 0)
                      ? "EIA's price feed is not available here right now."
                      : "Loading EIA's prices."}{" "}
                    EIA publishes the averages by state in{" "}
                    <a href={EIA_STATE_PRICES_URL} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand-2">
                      Electric Power Monthly, Table 5.6.A
                    </a>
                    .
                  </p>
                )}
                <p>
                  A bill has a delivery part, set by the state's utility regulator in rate cases, and a supply part bought on the market (
                  <a href={data.billSource.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand-2">
                    {data.billSource.source}
                  </a>
                  ). A statewide average blends every utility and customer, and nothing on this page shows how much any project or power line
                  added to a household's bill.
                </p>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="px-4 py-2 border-b border-border text-[13px] font-semibold text-foreground">{children}</div>;
}
