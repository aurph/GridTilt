import { useQuery } from "@tanstack/react-query";

interface Headline {
  id: number;
  headline: string;
  source: string;
  url: string;
}

export function NewsTicker() {
  const { data: headlines } = useQuery<Headline[]>({
    queryKey: ["/api/headlines"],
    staleTime: 5 * 60 * 1000,
  });

  if (!headlines || headlines.length === 0) return null;

  const tickerText = headlines
    .map((h) => `${h.headline}  ·  ${h.source}`)
    .join("   ◆   ");

  const doubledText = `${tickerText}   ◆   ${tickerText}`;

  return (
    <div
      className="flex items-center border-b border-[#F07800]/20 bg-[#F07800]/5 overflow-hidden flex-shrink-0"
      style={{ height: "28px" }}
      data-testid="news-ticker"
    >
      <div
        className="flex-shrink-0 px-3 flex items-center gap-1.5 border-r border-[#F07800]/20 h-full bg-[#F07800]/10"
        style={{ minWidth: "fit-content" }}
      >
        <div className="relative h-1.5 w-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-[#F07800]" />
          <div className="animate-ping absolute inset-0 h-1.5 w-1.5 rounded-full bg-[#F07800] opacity-75" />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#F07800]">
          News
        </span>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <div className="ticker-scroll whitespace-nowrap text-[11px] text-muted-foreground font-mono">
          {doubledText}
        </div>
      </div>
    </div>
  );
}
