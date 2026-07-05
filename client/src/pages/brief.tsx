import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AsOf, ErrorState } from "@/components/Freshness";
import { Newspaper, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { FONT } from "@/lib/tokens";

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
// the /brief route still mounts this page directly (until the routing lake),
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
      className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-subtle text-xs font-mono text-muted-foreground hover:text-foreground hover:border-brand/40 transition-colors"
      data-testid="brief-copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-positive" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "copied" : "copy as text"}
    </button>
  );

  // Body shared by both modes: summary, sections, takeaway.
  const body = data && (
    <div className="space-y-5">
      <p className="text-15 leading-relaxed text-foreground/90">{data.summary}</p>

      <div className="space-y-4">
        {data.sections.map((s) => (
          <section key={s.heading} data-testid={`brief-section-${s.heading}`}>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-xs font-mono uppercase tracking-wider text-brand">{s.heading}</h3>
              {SECTION_LINK[s.heading] && (
                <Link href={SECTION_LINK[s.heading]} className="text-10 font-mono text-muted-foreground/50 hover:text-brand">open →</Link>
              )}
            </div>
            <ul className="space-y-1">
              {s.points.map((p, i) => (
                <li key={i} className="text-sm text-foreground/80 leading-relaxed flex gap-2">
                  <span className="text-brand/50 flex-shrink-0">·</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="border-l-2 border-brand pl-4 py-1 bg-brand/5 rounded-r" data-testid="brief-takeaway">
        <p className="text-sm text-foreground/90 leading-relaxed">{data.takeaway}</p>
      </div>
    </div>
  );

  // Embedded mode (Analysis page): the host page owns the hero, so render a
  // single self-contained card — today's read above the long-form archive.
  if (embedded) {
    return (
      <Card className="border-brand/30 p-5 sm:p-6" data-testid="brief-embedded">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-4">
          <div className="flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-brand" />
            <h2 className="text-base font-semibold text-foreground tracking-tight" style={{ fontFamily: FONT.mono }}>
              The Buildout Brief
            </h2>
            <Badge className="text-10 font-mono bg-brand/15 text-brand border-transparent">daily</Badge>
          </div>
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
            <div ref={contentRef} className={expanded ? undefined : "relative max-h-36 overflow-hidden"}>
              <article className="space-y-4">
                <h3 className="text-15 font-semibold text-foreground" style={{ fontFamily: FONT.mono }}>{data.title}</h3>
                {body}
              </article>
              {!expanded && clipped && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-card to-transparent" />
              )}
            </div>
            {(clipped || expanded) && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="mt-3 flex items-center gap-1 text-xs font-mono text-brand hover:text-brand-2 transition-colors"
                data-testid="brief-expand"
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {expanded ? "Collapse" : "Read the full brief"}
              </button>
            )}
          </>
        )}
      </Card>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="border-b border-border px-4 sm:px-6 py-6 sm:py-8" data-testid="brief-header">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 mb-2">
              <Newspaper className="h-5 w-5 text-brand" />
              <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight" style={{ fontFamily: FONT.mono }}>
                The Buildout Brief
              </h1>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              One synthesized read on the state of the AI power buildout, generated from every GridTilt module:
              compute clusters, GPU rental prices, the grid queue, and corporate power deals. Every figure is live and
              sourced in its module. Copy it for a newsletter or a thread.
            </p>
          </div>
          {copyButton}
        </div>
      </div>

      <div className="flex-1 p-4 sm:p-6">
        <Card className="border-card-border p-5 sm:p-7 max-w-3xl mx-auto" data-testid="brief-body">
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
              <header className="border-b border-border pb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xl font-semibold text-foreground" style={{ fontFamily: FONT.mono }}>{data.title}</h2>
                <AsOf updatedAt={dataUpdatedAt} intervalMs={900_000} />
              </header>

              {body}

              <p className="text-11 text-muted-foreground/50 pt-2 border-t border-border">
                Auto-generated from live data. The weekly cadence is what the daily social posts roll up into.
              </p>
            </article>
          )}
        </Card>
      </div>
    </div>
  );
}
