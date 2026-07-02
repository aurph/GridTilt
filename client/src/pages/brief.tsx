import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Newspaper, Copy, Check } from "lucide-react";
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

export default function BriefPage() {
  const { data, isLoading, isError } = useQuery<Brief>({ queryKey: ["/api/brief"] });
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!data?.text) return;
    try {
      await navigator.clipboard.writeText(data.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked; ignore */ }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="grid-bg border-b border-border px-4 sm:px-6 py-6 sm:py-8" data-testid="brief-header">
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
          {data && (
            <button
              onClick={copy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-subtle text-xs font-mono text-muted-foreground hover:text-foreground hover:border-brand/40 transition-colors"
              data-testid="brief-copy"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-positive" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "copied" : "copy as text"}
            </button>
          )}
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
            <div className="py-12 text-center text-sm text-muted-foreground">Brief unavailable right now.</div>
          ) : (
            <article className="space-y-5">
              <header className="border-b border-border pb-4">
                <h2 className="text-xl font-semibold text-foreground" style={{ fontFamily: FONT.mono }}>{data.title}</h2>
              </header>

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
