import { useQuery } from "@tanstack/react-query";

interface Mover { ticker: string; changePercent: number | null; }

/**
 * Live market tape: the day's movers scrolling across the hero base.
 * Real data only; hidden entirely until movers arrive. Static under
 * reduced motion.
 */
export function MarketTape() {
  const { data } = useQuery<Mover[]>({ queryKey: ["/api/top-movers"], refetchInterval: 900000 });
  const rows = (data ?? []).filter((m) => m.changePercent != null);
  if (rows.length === 0) return null;
  const loop = [...rows, ...rows, ...rows, ...rows];
  return (
    <div className="gt-tape pointer-events-none absolute inset-x-0 bottom-0 z-10 border-t border-border bg-background/80 backdrop-blur-sm" aria-hidden>
      <div className="gt-tape-track flex items-center gap-8 whitespace-nowrap py-2">
        {loop.map((m, i) => (
          <span key={`${m.ticker}-${i}`} className="flex items-baseline gap-2 font-mono text-[12px] tabular-nums">
            <span className="font-bold text-foreground">{m.ticker}</span>
            <span className={m.changePercent! >= 0 ? "text-positive" : "text-negative"}>
              {m.changePercent! >= 0 ? "+" : ""}{m.changePercent!.toFixed(2)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
