/**
 * Buildout over time: the cluster map, animated. Press play and facilities
 * light up in the year they came online (solid = running, sized by rated
 * MW); announced targets appear hollow at their promised year and stay
 * hollow until reality catches up. The honesty rules live in
 * lib/buildout-timeline.ts; this component is choreography.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip as MapTooltip, ZoomControl } from "react-leaflet";
import { Card } from "@/components/ui/card";
import { BRAND, INK, STATUS_COLORS, SURFACE } from "@/lib/tokens";
import { prefersReducedMotion } from "@/lib/chart-theme";
import {
  buildTimeline,
  totalsAt,
  type TimelineClusterInput,
} from "@/lib/buildout-timeline";

const STATUS_COLOR: Record<string, string> = STATUS_COLORS;
const TICK_MS = 900;

const gw = (mw: number) => (mw / 1000).toFixed(1);

export default function BuildoutReplay({ clusters }: { clusters: TimelineClusterInput[] }) {
  const timeline = useMemo(() => buildTimeline(clusters), [clusters]);
  const { entries, minYear, maxYear, unknownCount } = timeline;

  const nowYear = new Date().getFullYear();
  const [year, setYear] = useState(() => Math.min(Math.max(nowYear, minYear), maxYear));
  const [playing, setPlaying] = useState(false);
  const playRef = useRef(playing);
  playRef.current = playing;

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setYear((y) => {
        if (y >= maxYear) {
          setPlaying(false);
          return y;
        }
        return y + 1;
      });
    }, TICK_MS);
    return () => clearInterval(t);
  }, [playing, maxYear]);

  const play = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (year >= maxYear) setYear(minYear);
    setPlaying(true);
  };

  const visible = useMemo(() => entries.filter((e) => e.year <= year), [entries, year]);
  const totals = useMemo(() => totalsAt(entries, year), [entries, year]);
  const animate = !prefersReducedMotion();

  if (entries.length === 0) return null;

  return (
    <Card className="border-card-border overflow-hidden" data-testid="cf-timeline">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-surface-base border-b border-border">
        <span className="text-[13px] font-semibold text-foreground">Buildout over time</span>
        <div className="flex items-center gap-3 text-10 text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.operational }} />
            came online
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: "transparent", border: `1.5px solid ${STATUS_COLOR.announced}` }}
            />
            announced target
          </span>
        </div>
      </div>

      <div className="relative" style={{ height: 420 }}>
        <MapContainer
          center={[39.5, -98.5]}
          zoom={4}
          minZoom={3}
          maxZoom={10}
          zoomControl={false}
          style={{ width: "100%", height: "100%", background: SURFACE.base }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            subdomains="abcd"
          />
          {visible.map((e) => {
            const live = e.kind === "live";
            const color = STATUS_COLOR[e.status] ?? INK.muted;
            return (
              <CircleMarker
                key={e.id}
                center={[e.lat, e.lng]}
                radius={Math.max(4, Math.min(22, Math.sqrt(e.mw) / 3.2))}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: live ? 0.55 : 0.08,
                  weight: live ? 1 : 1.25,
                  dashArray: live ? undefined : "3 3",
                  className: animate && e.year === year ? "gt-tl-pop" : undefined,
                }}
              >
                <MapTooltip>
                  <div className="text-xs">
                    <div className="font-semibold">{e.name}</div>
                    <div>
                      {e.operator} · {e.mw.toLocaleString()} MW{" "}
                      {live ? `· online ${e.year}` : `· targets ${e.year}`}
                    </div>
                  </div>
                </MapTooltip>
              </CircleMarker>
            );
          })}
          <ZoomControl position="bottomright" />
        </MapContainer>

        {/* Instrument overlay: the year and the running tally, on the map */}
        <div className="absolute left-3 top-3 z-[1000] pointer-events-none select-none rounded border border-border/60 bg-[#101010]/85 px-3 py-2 backdrop-blur-sm">
          <div className="font-mono text-3xl font-bold tabular-nums leading-none" style={{ color: BRAND.primary }} data-testid="cf-timeline-year">
            {year}
          </div>
          <div className="mt-1.5 text-11 leading-snug" aria-live="polite">
            <div className="text-foreground">
              <span className="font-mono font-semibold tabular-nums">{gw(totals.liveMW)} GW</span>{" "}
              <span className="text-muted-foreground">live · {totals.liveCount} clusters</span>
            </div>
            <div className="text-muted-foreground">
              <span className="font-mono tabular-nums">+{gw(totals.targetMW)} GW</span> targeted ·{" "}
              {totals.targetCount} announced
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-2.5 border-t border-border bg-surface-base">
        <button
          onClick={play}
          aria-label={playing ? "Pause" : "Play the buildout"}
          data-testid="cf-timeline-play"
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded border border-brand/50 text-brand hover:bg-brand/10 transition-colors"
        >
          {playing ? (
            <span className="flex gap-[3px]" aria-hidden="true">
              <span className="h-2.5 w-[3px] bg-current" />
              <span className="h-2.5 w-[3px] bg-current" />
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="ml-[2px] h-0 w-0 border-y-[6px] border-l-[9px] border-y-transparent border-l-current"
            />
          )}
        </button>
        <span className="font-mono text-11 tabular-nums text-muted-foreground">{minYear}</span>
        <input
          type="range"
          min={minYear}
          max={maxYear}
          step={1}
          value={year}
          onChange={(e) => {
            setPlaying(false);
            setYear(Number(e.target.value));
          }}
          aria-label="Buildout year"
          className="w-full"
          style={{ accentColor: BRAND.primary }}
          data-testid="cf-timeline-scrub"
        />
        <span className="font-mono text-11 tabular-nums text-muted-foreground">{maxYear}</span>
      </div>
      <div className="px-4 py-1.5 border-t border-border/50 text-10 text-muted-foreground/60">
        Solid circles came online in the shown year or earlier (sized by running MW); hollow circles are
        announced targets (planned MW) and stay hollow until they actually energize.
        {unknownCount > 0 && ` ${unknownCount} clusters without a dated estimate aren't animated.`}
      </div>
    </Card>
  );
}
