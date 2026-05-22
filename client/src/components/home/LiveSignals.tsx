import { useQuery } from "@tanstack/react-query";
import type { TopMover, SectorPulseItem, AllCatalystsResponse } from "@/lib/types";
import { daysUntil } from "@/lib/dates";

const HORIZ_PAD = "clamp(20px, 4vw, 64px)";
const RULE = "#E5E5E5";

export function LiveSignals() {
  return (
    <section className="w-full" style={{ paddingTop: 80, paddingBottom: 80 }}>
      <div
        className="mx-auto"
        style={{
          maxWidth: 1280,
          paddingLeft: HORIZ_PAD,
          paddingRight: HORIZ_PAD,
        }}
      >
        <div className="anchor-rule-top" style={{ marginBottom: 56 }} />

        <div className="grid grid-cols-12 gap-x-6" style={{ marginBottom: 56 }}>
          <div className="col-span-12 md:col-span-2" style={{ marginBottom: 16 }}>
            <div className="anchor-section-num" style={{ marginBottom: 8 }}>04</div>
            <div className="anchor-eyebrow">THE TAPE</div>
          </div>
          <div className="col-span-12 md:col-span-10">
            <h2
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: "clamp(28px, 3.4vw, 44px)",
                fontWeight: 600,
                lineHeight: 1.2,
                color: "#111111",
                marginBottom: 12,
              }}
            >
              What's moving right now.
            </h2>
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 18,
                lineHeight: 1.5,
                color: "#5A5A5A",
                maxWidth: 680,
              }}
            >
              Updated every few minutes from public market data. Same numbers you'd see on a terminal — without the terminal.
            </p>
          </div>
        </div>

        <div
          className="grid grid-cols-1 md:grid-cols-3"
          style={{ gap: "clamp(32px, 3vw, 56px)" }}
        >
          <TopMoversColumn />
          <SectorPulseColumn />
          <NextCatalystsColumn />
        </div>
      </div>
    </section>
  );
}

function ColumnHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="anchor-eyebrow"
      style={{
        paddingBottom: 10,
        borderBottom: `1px solid ${RULE}`,
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

function TopMoversColumn() {
  const { data, isError } = useQuery<TopMover[]>({
    queryKey: ["/api/top-movers"],
    refetchInterval: 5 * 60_000,
  });
  return (
    <div data-testid="live-top-movers">
      <ColumnHeader>TOP MOVERS · TODAY</ColumnHeader>
      {isError && <UnavailableNote>Top movers unavailable right now.</UnavailableNote>}
      {!isError && !data && <SkeletonRows count={5} />}
      {data && data.length === 0 && <UnavailableNote>No movement worth noting.</UnavailableNote>}
      {data && data.slice(0, 5).map((m) => (
        <div
          key={m.ticker}
          className="flex items-baseline justify-between"
          style={{ padding: "12px 0", borderBottom: `1px solid ${RULE}`, gap: 12 }}
        >
          <div className="flex items-baseline" style={{ gap: 8, minWidth: 0, flex: 1 }}>
            <span className="anchor-mono" style={{ fontSize: 13, color: "#111111", fontWeight: 500 }}>
              {m.ticker}
            </span>
            <span
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                color: "#5A5A5A",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}
            >
              {m.name}
            </span>
          </div>
          <span className="anchor-mono" style={{ fontSize: 14, color: "#111111", fontWeight: 500, flexShrink: 0 }}>
            {formatPct(m.changePercent)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SectorPulseColumn() {
  const { data, isError } = useQuery<SectorPulseItem[]>({
    queryKey: ["/api/sector-pulse"],
    refetchInterval: 5 * 60_000,
  });
  return (
    <div data-testid="live-sector-pulse">
      <ColumnHeader>SECTOR PULSE</ColumnHeader>
      {isError && <UnavailableNote>Sector data unavailable right now.</UnavailableNote>}
      {!isError && !data && <SkeletonRows count={6} />}
      {data && data.slice(0, 8).map((s) => (
        <div
          key={s.sector}
          className="flex items-baseline justify-between"
          style={{ padding: "12px 0", borderBottom: `1px solid ${RULE}`, gap: 12 }}
        >
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "#111111" }}>
            {s.label}
          </span>
          <span className="anchor-mono" style={{ fontSize: 14, color: "#111111", fontWeight: 500 }}>
            {formatPct(s.avgChange)}
          </span>
        </div>
      ))}
    </div>
  );
}

function NextCatalystsColumn() {
  const { data, isError } = useQuery<AllCatalystsResponse>({
    queryKey: ["/api/catalysts/all"],
    refetchInterval: 15 * 60_000,
  });
  const upcoming = (data?.items || []).filter((c) => daysUntil(c.sortDate) >= 0).slice(0, 5);

  return (
    <div data-testid="live-catalysts">
      <ColumnHeader>NEXT 5 CATALYSTS</ColumnHeader>
      {isError && <UnavailableNote>Calendar unavailable right now.</UnavailableNote>}
      {!isError && !data && <SkeletonRows count={5} />}
      {data && upcoming.length === 0 && (
        <UnavailableNote>No catalysts on the calendar this week.</UnavailableNote>
      )}
      {upcoming.map((c) => {
        const isEarnings = c.type === "earnings";
        const title = isEarnings ? `${c.ticker} Earnings` : c.title || "Event";
        const days = daysUntil(c.sortDate);
        return (
          <div
            key={c.id}
            style={{ padding: "14px 0", borderBottom: `1px solid ${RULE}` }}
          >
            <div className="anchor-mono" style={{ fontSize: 11, color: "#5A5A5A", marginBottom: 4, letterSpacing: 0.3 }}>
              {formatShortDate(c.sortDate)} · {days === 0 ? "TODAY" : `IN ${days}D`}
            </div>
            <div
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 14,
                color: "#111111",
                fontWeight: 500,
                lineHeight: 1.35,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {title}
            </div>
            {c.ticker && !isEarnings && (
              <span
                className="anchor-mono"
                style={{
                  marginTop: 6,
                  display: "inline-block",
                  fontSize: 11,
                  color: "#5A5A5A",
                  border: `1px solid ${RULE}`,
                  padding: "1px 6px",
                  borderRadius: 2,
                }}
              >
                {c.ticker}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{ padding: "14px 0", borderBottom: `1px solid ${RULE}` }}
        >
          <div style={{ height: 13, background: RULE, width: "55%", marginBottom: 6 }} />
          <div style={{ height: 11, background: RULE, width: "32%" }} />
        </div>
      ))}
    </div>
  );
}

function UnavailableNote({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "#9A9A9A", padding: "16px 0" }}>
      {children}
    </p>
  );
}

function formatPct(pct: number): string {
  if (!Number.isFinite(pct)) return "—";
  const sign = pct >= 0 ? "+" : "−";
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getDate().toString().padStart(2, "0");
  const month = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  return `${day} ${month}`;
}
