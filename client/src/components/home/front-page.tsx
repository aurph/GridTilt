/**
 * The front page: GridTilt's cover. Lead story from the server-authored
 * weekly Brief, a print-style buildout figure, today's market movers, the
 * key numbers with provenance, latest headlines, latest analysis, and the
 * section directory. Marketing and product share this one surface.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PageShell, Provenance, PullStat, RuleSection } from "@/components/editorial";

interface BriefPayload {
  title: string;
  asOf: string;
  summary: string;
  sections: { heading: string; points: string[] }[];
}

interface ClusterMetrics {
  clusterCount: number;
  operationalMW: number;
  totalPlannedMW: number;
  byStatus: { status: string; count: number; ratedMW: number; plannedMW: number }[];
  byOperator: { operator: string }[];
}

interface DealMetrics {
  dealCount: number;
  totalContractedMW: number;
}

interface GpuMetrics {
  asOf: string;
  fleetAvg: number;
  fleetAvg1yChange: number;
  modelCount: number;
}

interface Mover {
  ticker: string;
  name: string;
  price: number | null;
  changePercent: number | null;
}

interface NewsItem {
  headline: string;
  source: string;
  url: string;
  publishedAt: string;
}

interface BlogEntry {
  slug: string;
  title: string;
  description: string;
  date: string;
}

const SECTION_DIRECTORY: { label: string; href: string; note: string }[] = [
  { label: "Today", href: "/overview", note: "Daily read" },
  { label: "The Stack", href: "/stack", note: "Equities" },
  { label: "Power", href: "/power-map", note: "Map, deals, queue" },
  { label: "Compute", href: "/compute-frontier", note: "Cluster registry" },
  { label: "GPUs", href: "/neocloud-intel", note: "Price index" },
  { label: "Analyze", href: "/analyze", note: "Worksheets" },
  { label: "Catalysts", href: "/catalysts", note: "Calendar" },
  { label: "Analysis", href: "/blog", note: "Articles and the Brief" },
];

function fmtGW(mw: number): string {
  return `${(mw / 1000).toFixed(1).replace(/\.0$/, "")} GW`;
}

function fmtTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtArticleDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Print figure: one stacked hairline bar of planned capacity by status. */
function BuildoutBar({ metrics }: { metrics: ClusterMetrics }) {
  const rows = metrics.byStatus;
  const total = rows.reduce((s, r) => s + r.plannedMW, 0);
  if (!total) return null;
  const color: Record<string, string> = {
    operational: "var(--brand)",
    construction: "var(--rule-strong)",
    announced: "var(--paper-deep)",
  };
  const label: Record<string, string> = {
    operational: "Operational",
    construction: "Under construction",
    announced: "Announced",
  };
  return (
    <figure className="mt-5" data-testid="front-buildout-bar">
      <div className="flex h-3 w-full overflow-hidden" aria-hidden>
        {rows.map((r, i) => (
          <div
            key={r.status}
            style={{
              width: `${(r.plannedMW / total) * 100}%`,
              background: color[r.status] ?? "var(--rule)",
              marginLeft: i > 0 ? 2 : 0,
            }}
          />
        ))}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-ink-secondary">
        {rows.map((r) => (
          <span key={r.status} className="inline-flex items-baseline gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 translate-y-px"
              style={{ background: color[r.status] ?? "var(--rule)" }}
            />
            {label[r.status] ?? r.status} <span className="tnum">{fmtGW(r.plannedMW)}</span>
          </span>
        ))}
        <span className="text-ink-muted">planned capacity, {metrics.clusterCount} tracked clusters</span>
      </figcaption>
    </figure>
  );
}

export function FrontPage() {
  const { data: brief } = useQuery<BriefPayload>({ queryKey: ["/api/brief"] });
  const { data: clusters } = useQuery<ClusterMetrics>({ queryKey: ["/api/clusters/metrics"] });
  const { data: deals } = useQuery<DealMetrics>({ queryKey: ["/api/deals/metrics"] });
  const { data: gpu } = useQuery<GpuMetrics>({ queryKey: ["/api/gpu-prices/metrics"] });
  const { data: movers } = useQuery<Mover[]>({ queryKey: ["/api/top-movers"] });
  const { data: news } = useQuery<NewsItem[]>({ queryKey: ["/api/news"] });
  const { data: articles } = useQuery<BlogEntry[]>({ queryKey: ["/api/blog"] });

  const operatorCount = clusters?.byOperator?.length;

  return (
    <PageShell>
      {/* Lead band: the Brief + markets today, broadsheet proportions */}
      <div className="grid gap-8 lg:grid-cols-[2.1fr_1fr] pt-6 sm:pt-8">
        <article data-testid="front-lead">
          <p className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-brand-ink">
            <span className="tilt-glyph" aria-hidden />
            This week
          </p>
          {brief ? (
            <>
              <h1 className="font-serif font-medium text-[42px] sm:text-[64px] leading-[0.97] tracking-[-0.02em] text-ink max-w-[18ch]">
                {brief.title.replace(/,? (— )?week of.*$/, "")}
              </h1>
              <p className="mt-4 max-w-[58ch] font-serif text-[18px] sm:text-[19px] leading-[1.55] text-ink">
                {brief.summary}
              </p>
              {clusters && <BuildoutBar metrics={clusters} />}
              <p className="mt-4">
                <Link
                  href="/blog"
                  className="text-[13.5px] font-semibold text-ink no-underline hover:text-brand-ink"
                >
                  Full brief →
                </Link>
              </p>
            </>
          ) : (
            <p className="font-serif text-[17px] text-ink-muted">Loading…</p>
          )}
        </article>

        <aside className="lg:border-l lg:border-rule lg:pl-8" data-testid="front-markets">
          <div className="flex items-baseline justify-between border-b border-rule-strong pb-1.5 mb-1">
            <h2 className="text-[15px] font-semibold text-ink">Markets today</h2>
            <Link href="/stack" className="text-[12.5px] text-ink no-underline hover:text-brand-ink">
              The Stack →
            </Link>
          </div>
          {movers && movers.length > 0 ? (
            <ul>
              {movers.slice(0, 5).map((m) => (
                <li key={m.ticker} className="flex items-baseline gap-3 border-b border-rule py-2 last:border-b-0">
                  <Link
                    href={`/stock/${m.ticker}`}
                    className="w-14 shrink-0 text-[13px] font-semibold text-ink no-underline hover:text-brand-ink"
                  >
                    {m.ticker}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink-secondary">{m.name}</span>
                  <span
                    className={`shrink-0 text-[13px] font-semibold tnum ${
                      (m.changePercent ?? 0) >= 0 ? "text-positive" : "text-negative"
                    }`}
                  >
                    {m.changePercent == null
                      ? "—"
                      : `${m.changePercent >= 0 ? "+" : ""}${m.changePercent.toFixed(2)}%`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-3 text-[13px] text-ink-muted">Market data unavailable right now.</p>
          )}
          <Provenance source="Yahoo Finance" extra="quotes may be delayed" className="mt-1" />
        </aside>
      </div>

      {/* Key numbers: the figures band under a Scotch rule, column rules
          between figures like a broadsheet stats strip */}
      <div className="mt-9 rule-scotch border-b border-rule pt-5 pb-5" data-testid="front-key-numbers">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4 lg:divide-x lg:divide-rule lg:[&>div+div]:pl-6">
          <div>
            <PullStat
              label="Operational AI power"
              value={clusters ? fmtGW(clusters.operationalMW) : "—"}
              note={clusters ? `${fmtGW(clusters.totalPlannedMW)} planned` : undefined}
            />
            <Provenance source="GridTilt cluster registry" />
          </div>
          <div>
            <PullStat
              label="Contracted power deals"
              value={deals ? fmtGW(deals.totalContractedMW) : "—"}
              note={deals ? `${deals.dealCount} corporate deals` : undefined}
            />
            <Provenance source="GridTilt deal registry" />
          </div>
          <div>
            <PullStat
              label="Cost of AI compute"
              value={gpu ? `$${gpu.fleetAvg.toFixed(2)}/hr` : "—"}
              delta={
                gpu ? (
                  <span className={`text-[13px] font-semibold tnum ${gpu.fleetAvg1yChange <= 0 ? "text-positive" : "text-negative"}`}>
                    {gpu.fleetAvg1yChange > 0 ? "+" : ""}
                    {gpu.fleetAvg1yChange}% 1y
                  </span>
                ) : undefined
              }
              note={gpu ? `fleet average across ${gpu.modelCount} GPUs` : undefined}
            />
            <Provenance source="GridTilt GPU index" updated={gpu?.asOf} />
          </div>
          <div>
            <PullStat
              label="Named AI clusters"
              value={clusters ? String(clusters.clusterCount) : "—"}
              note={operatorCount ? `across ${operatorCount} operators` : undefined}
            />
            <Provenance source="GridTilt cluster registry" />
          </div>
        </div>
      </div>

      {/* Headlines + analysis */}
      <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
        <RuleSection
          head="Headlines"
                    testId="front-headlines"
        >
          {news && news.length > 0 ? (
            <ul>
              {news.slice(0, 6).map((n) => (
                <li key={n.url} className="border-b border-rule py-2.5 last:border-b-0">
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[14px] leading-snug text-ink no-underline hover:text-brand-ink"
                  >
                    {n.headline}
                  </a>
                  <p className="mt-1 text-[12px] text-ink-muted">
                    {n.source} · {fmtTimeAgo(n.publishedAt)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-muted">No headlines available right now.</p>
          )}
        </RuleSection>

        <RuleSection
          head="Analysis"
          aside={
            <Link href="/blog" className="text-ink no-underline hover:text-brand-ink">
              All articles →
            </Link>
          }
          testId="front-analysis"
        >
          {articles && articles.length > 0 ? (
            <div className="space-y-5">
              {articles.slice(0, 3).map((a) => (
                <article key={a.slug} className="border-b border-rule pb-5 last:border-b-0 last:pb-0">
                  <h3 className="font-serif font-medium text-[21px] leading-snug text-ink">
                    <Link href={`/blog/${a.slug}`} className="no-underline hover:text-brand-ink">
                      {a.title}
                    </Link>
                  </h3>
                  <p className="mt-1.5 max-w-[70ch] text-[13.5px] leading-relaxed text-ink-secondary">
                    {a.description}
                  </p>
                  <p className="mt-1.5 text-[12px] text-ink-muted">{fmtArticleDate(a.date)}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-ink-muted">No articles yet.</p>
          )}
        </RuleSection>
      </div>

      {/* Section index: compact ruled listing, tilt glyph as the bullet,
          two columns with a column rule */}
      <RuleSection head="Sections" testId="front-directory">
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x sm:divide-rule">
          {[SECTION_DIRECTORY.slice(0, 4), SECTION_DIRECTORY.slice(4)].map((col, ci) => (
            <div key={ci} className={ci === 1 ? "sm:pl-8" : "sm:pr-8"}>
              {col.map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  className="group flex items-baseline gap-2.5 border-b border-rule py-2.5 no-underline last:border-b-0"
                  data-testid={`front-directory-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <span className="tilt-glyph shrink-0" aria-hidden />
                  <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                    <span className="text-[14.5px] font-semibold text-ink group-hover:text-brand-ink">
                      {s.label}
                    </span>
                    <span className="text-[12.5px] text-ink-muted">{s.note}</span>
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </RuleSection>

      {/* Subscribe band */}
      <div className="mt-10 rule-scotch pt-6 pb-2" data-testid="front-subscribe">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
          <div className="max-w-[52ch]">
            <p className="font-serif font-medium text-[22px] leading-snug text-ink">
              The weekly brief.
            </p>
          </div>
          <Link
            href="/subscribe"
            className="inline-block border border-ink px-5 py-2.5 text-[13.5px] font-semibold text-ink no-underline transition-colors hover:border-brand-ink hover:text-brand-ink"
          >
            Subscribe free
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
