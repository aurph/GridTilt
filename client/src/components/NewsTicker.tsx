import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pause, Play } from "lucide-react";
import { fetchJson } from "@/lib/queryClient";

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
    queryFn: () => fetchJson<NewsItem[]>("/api/news"),
  });
  // Pause is real state so touch and keyboard users can stop the marquee,
  // not just mouse hover (Lake 7D/E).
  const [pinnedPause, setPinnedPause] = useState(false);
  const [hoverPause, setHoverPause] = useState(false);
  const paused = pinnedPause || hoverPause;

  // Shape guard, not just a length guard: `undefined === 0` is false, so a
  // non-array payload used to slip past a `.length` check straight into .map().
  if (!Array.isArray(items) || items.length === 0) return null;

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
        <button
          onClick={() => setPinnedPause((p) => !p)}
          aria-label={pinnedPause ? "Resume news ticker" : "Pause news ticker"}
          aria-pressed={pinnedPause}
          className="ml-1 text-brand/60 hover:text-brand transition-colors"
          data-testid="ticker-pause"
        >
          {pinnedPause ? <Play className="h-2.5 w-2.5" /> : <Pause className="h-2.5 w-2.5" />}
        </button>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <div
          className="ticker-scroll whitespace-nowrap text-11 text-muted-foreground font-mono"
          style={{ animationPlayState: paused ? "paused" : "running" }}
          onMouseEnter={() => setHoverPause(true)}
          onMouseLeave={() => setHoverPause(false)}
          onFocusCapture={() => setHoverPause(true)}
          onBlurCapture={() => setHoverPause(false)}
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
                tabIndex={i < segments.length ? 0 : -1}
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
