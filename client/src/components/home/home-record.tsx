/**
 * The home page's second screen: three short lists read from the records the
 * site already serves. Next public dates come from the state-pages registry,
 * agreements from the agreements file (rows with a sourced announcement day
 * only), research from the published posts. Nothing here is written by hand:
 * an empty source shows an honest line, never a placeholder row.
 */
import type { ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { STATE_GRID } from "@/data/state-grid";
import { chipHref } from "@/lib/sections";
import { longDay, stateIndexRows, type PublishedStatePage, type StateIndexRow } from "@/lib/state-pages";

export interface AgreementLike {
  id: string;
  name: string;
  capacityMW: number | null;
  firmness: string;
  announced: string | null;
}

const FIRMNESS_LABEL: Record<string, string> = {
  signed: "Signed",
  framework: "Framework",
  option: "Option",
  preliminary: "Preliminary",
  portfolio: "Portfolio",
  unreviewed: "Not yet reviewed",
};

/** The newest agreements that carry a sourced announcement day. */
export function latestAgreements<T extends AgreementLike>(rows: T[] | undefined, limit = 4): T[] {
  return (rows ?? [])
    .filter((r) => typeof r.announced === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.announced))
    .sort((a, b) => ((a.announced as string) < (b.announced as string) ? 1 : -1))
    .slice(0, limit);
}

/** States with a public date ahead, soonest first. */
export function upcomingStateDates(rows: StateIndexRow[]): StateIndexRow[] {
  return rows
    .filter((r) => r.nextDate)
    .sort((a, b) => ((a.nextDate as { date: string }).date < (b.nextDate as { date: string }).date ? -1 : 1));
}

function Column({
  title,
  href,
  linkLabel,
  testId,
  children,
}: {
  title: string;
  href: string;
  linkLabel: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col" data-testid={testId}>
      <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground/80">{title}</h2>
      <div className="mt-3 flex-1 divide-y divide-dashed divide-border border-y border-dashed border-border">{children}</div>
      <Link
        href={href}
        className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 text-[13px] font-semibold text-brand no-underline hover:text-brand-2"
      >
        {linkLabel}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </section>
  );
}

function Row({ href, date, title, detail }: { href: string; date: string; title: string; detail?: string }) {
  return (
    <Link href={href} className="group block py-3 no-underline">
      <span className="block font-mono text-[11px] tabular-nums text-muted-foreground/80">{date}</span>
      <span className="mt-0.5 block text-[14px] font-semibold leading-snug text-foreground group-hover:text-brand">{title}</span>
      {detail && <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{detail}</span>}
    </Link>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-3 text-[13px] text-muted-foreground">{children}</p>;
}

function Loading() {
  return (
    <div className="space-y-3 py-3" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

interface Article {
  slug: string;
  title: string;
  date: string;
}

export function HomeRecord() {
  const states = useQuery<PublishedStatePage[]>({ queryKey: ["/api/state-pages"] });
  const deals = useQuery<{ rows: AgreementLike[] }>({ queryKey: ["/api/deals/metrics"] });
  const posts = useQuery<Article[]>({ queryKey: ["/api/blog"] });

  const dates = upcomingStateDates(stateIndexRows(states.data, STATE_GRID));
  const agreements = latestAgreements(deals.data?.rows);
  const articles = [...(posts.data ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3);

  return (
    <div className="border-b border-dashed border-border" data-testid="home-record">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-6 py-14 md:grid-cols-3 md:gap-8">
        <Column title="Next public dates" href="/states" linkLabel="All state pages" testId="home-next-dates">
          {states.isLoading ? (
            <Loading />
          ) : dates.length === 0 ? (
            <Empty>No public date is listed on a state page right now.</Empty>
          ) : (
            dates.map((r) => (
              <Row
                key={r.slug}
                href={r.href}
                date={longDay((r.nextDate as { date: string }).date)}
                title={r.name}
                detail={(r.nextDate as { what: string }).what}
              />
            ))
          )}
        </Column>

        <Column
          title="Latest agreements"
          href={chipHref("grid", "deals")}
          linkLabel="All power agreements"
          testId="home-agreements"
        >
          {deals.isLoading ? (
            <Loading />
          ) : agreements.length === 0 ? (
            <Empty>No agreement with a sourced announcement date is on file.</Empty>
          ) : (
            agreements.map((d) => (
              <Row
                key={d.id}
                href={`${chipHref("grid", "deals")}&deal=${encodeURIComponent(d.id)}`}
                date={longDay(d.announced as string)}
                title={d.name}
                detail={`${FIRMNESS_LABEL[d.firmness] ?? d.firmness} · ${
                  d.capacityMW ? `${d.capacityMW.toLocaleString()} MW` : "capacity not disclosed"
                }`}
              />
            ))
          )}
        </Column>

        <Column title="Research" href="/blog" linkLabel="All research and the Brief" testId="home-research">
          {posts.isLoading ? (
            <Loading />
          ) : articles.length === 0 ? (
            <Empty>No research post is published right now.</Empty>
          ) : (
            articles.map((a) => <Row key={a.slug} href={`/blog/${a.slug}`} date={longDay(a.date)} title={a.title} />)
          )}
        </Column>
      </div>
    </div>
  );
}
