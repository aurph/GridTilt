import { useQuery } from "@tanstack/react-query";

interface NewsItem {
  headline: string;
  source: string;
  url: string;
  publishedAt: string;
}

export function NewsTicker() {
  const { data: items } = useQuery<NewsItem[]>({
    queryKey: ["/api/news"],
    staleTime: 30 * 60 * 1000,
    queryFn: () => fetch("/api/news").then((r) => r.json()),
  });

  if (!items || items.length === 0) return null;

  const segments = items.map((h) => ({
    text: `${h.source.toUpperCase()}  ${h.headline}`,
    url: h.url,
  }));

  return (
    <div
      className="flex items-center border-b border-brand/20 bg-brand/5 overflow-hidden flex-shrink-0"
      style={{ height: "28px" }}
      data-testid="news-ticker"
    >
      <div
        className="flex-shrink-0 px-3 flex items-center gap-1.5 border-r border-brand/20 h-full bg-brand/10"
        style={{ minWidth: "fit-content" }}
      >
        <div className="relative h-1.5 w-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-brand" />
          <div className="animate-ping absolute inset-0 h-1.5 w-1.5 rounded-full bg-brand opacity-75" />
        </div>
        <span className="text-10 font-bold uppercase tracking-widest text-brand">
          News
        </span>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <div
          className="ticker-scroll whitespace-nowrap text-11 text-muted-foreground font-mono"
          style={{ animationPlayState: "running" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.animationPlayState = "paused"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.animationPlayState = "running"; }}
        >
          {[...segments, ...segments].map((seg, i) => (
            <span key={i}>
              {i > 0 && <span className="mx-4 text-brand/40">◆</span>}
              <a
                href={seg.url !== "#" ? seg.url : undefined}
                target="_blank"
                rel="noopener noreferrer"
                className={seg.url !== "#" ? "hover:text-brand-2 transition-colors cursor-pointer" : undefined}
                onClick={(e) => { if (seg.url === "#") e.preventDefault(); }}
              >
                {seg.text}
              </a>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
