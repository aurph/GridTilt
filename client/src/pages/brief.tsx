import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { AsOf, ErrorState } from "@/components/Freshness";
import { PageShell, PageTitle } from "@/components/editorial";
import { Copy, Check, ChevronDown, ChevronUp } from "lucide-react";

interface BriefSection { heading: string; points: string[]; }
interface Brief {
  title: string;
  asOf: string;
  summary: string;
  sections: BriefSection[];
  takeaway: string;
  text: string;
}

const SECTION_LINK: Record<string, string> = {
  Compute: "/compute-frontier",
  GPUs: "/neocloud-intel",
  "Power & grid": "/queue",
  Deals: "/power-deals",
};

// `params` keeps the signature compatible with wouter's RouteComponentProps:
// the /brief route still mounts this page directly (it 301s to /blog),
// while the Analysis page renders <BriefPage embedded />.
export default function BriefPage({ embedded = false }: { embedded?: boolean; params?: unknown }) {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<Brief>({ queryKey: ["/api/brief"] });
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Embedded collapse: only offer "Read the full brief" when the content
  // actually overflows the collapsed window.
  useEffect(() => {
    if (!embedded || expanded) return;
    const el = contentRef.current;
    if (el) setClipped(el.scrollHeight > el.clientHeight + 1);
  }, [embedded, expanded, data]);

  const copy = async () => {
    if (!data?.text) return;
    try {
      await navigator.clipboard.writeText(data.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked; ignore */ }
  };

  const copyButton = data && (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-rule text-[12.5px] text-ink-secondary hover:text-ink hover:border-rule-strong transition-colors"
      data-testid="brief-copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-positive" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy as text"}
    </button>
  );

  // Body shared by both modes: summary, sections, takeaway.
  const body = data && (
    <div className="space-y-5">
      <p className="font-serif text-[16.5px] leading-relaxed text-ink">{data.summary}</p>

      <div className="space-y-4">
        {data.sections.map((s) => (
          <section key={s.heading} data-testid={`brief-section-${s.heading}`}>
            <div className="flex items-baseline justify-between border-b border-rule pb-1 mb-2">
              <h3 className="text-[14px] font-semibold text-ink">{s.heading}</h3>
              {SECTION_LINK[s.heading] && (
                <Link href={SECTION_LINK[s.heading]} className="text-[12.5px] text-brand-ink no-underline hover:text-ink">
                  Open →
                </Link>
              )}
            </div>
            <ul className="space-y-1">
              {s.points.map((p, i) => (
                <li key={i} className="text-[14px] text-ink-secondary leading-relaxed flex gap-2">
                  <span className="text-brand flex-shrink-0" aria-hidden>·</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="border-l-2 border-brand pl-4 py-1" data-testid="brief-takeaway">
        <p className="font-serif italic text-[15.5px] text-ink leading-relaxed">{data.takeaway}</p>
      </div>
    </div>
  );

  // Embedded mode (Analysis page): the host page owns the hero, so render a
  // single self-contained block above the long-form archive.
  if (embedded) {
    return (
      <section className="border-y-2 border-rule-strong py-5" data-testid="brief-embedded">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 mb-4">
          <h2 className="text-[17px] font-semibold text-ink">
            The Buildout Brief
            <span className="ml-2 text-[12.5px] font-normal text-ink-muted">today's read</span>
          </h2>
          <div className="flex items-center gap-3">
            <AsOf updatedAt={dataUpdatedAt} intervalMs={900_000} />
            {copyButton}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : isError || !data ? (
          <ErrorState label="The brief failed to load." onRetry={() => refetch()} className="py-8" />
        ) : (
          <>
            <div ref={contentRef} className={expanded ? undefined : "relative max-h-40 overflow-hidden"}>
              <article className="space-y-4">
                <h3 className="font-serif font-medium text-[20px] text-ink">{data.title}</h3>
                {body}
              </article>
              {!expanded && clipped && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-paper to-transparent" />
              )}
            </div>
            {(clipped || expanded) && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="mt-3 flex items-center gap-1 text-[13px] font-semibold text-brand-ink hover:text-ink transition-colors"
                data-testid="brief-expand"
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {expanded ? "Collapse" : "Read the full brief"}
              </button>
            )}
          </>
        )}
      </section>
    );
  }

  return (
    <PageShell>
      <div className="max-w-3xl mx-auto">
        <PageTitle
          title="The Buildout Brief"
          dek="One synthesized read on the state of the AI power buildout, generated from every GridTilt dataset. Every figure is live and sourced in its section."
          right={copyButton}
          testId="brief-header"
        />
        <div data-testid="brief-body">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-16 w-full" />
              {Array(4).fill(null).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : isError || !data ? (
            <ErrorState label="The brief failed to load." onRetry={() => refetch()} className="py-12" />
          ) : (
            <article className="space-y-5">
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-serif font-medium text-[24px] text-ink">{data.title}</h2>
                <AsOf updatedAt={dataUpdatedAt} intervalMs={900_000} />
              </header>

              {body}

              <p className="text-[12.5px] text-ink-muted pt-2 border-t border-rule">
                Auto-generated from live data. The weekly cadence is what the daily social posts roll up into.
              </p>
            </article>
          )}
        </div>
      </div>
    </PageShell>
  );
}
