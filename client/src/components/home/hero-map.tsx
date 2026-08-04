import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { geoAlbers, geoPath } from "d3-geo";
import type { FeatureCollection } from "geojson";
import statesGeoRaw from "@/data/us-states.geo.json";

// Faded cluster map behind the hero. Same projection and same dot semantics as
// the social card (server/og-card.ts), so the landing page and the images that
// go out on X read as one system.
//
// geoAlbers, not geoAlbersUsa: the composite projection draws its Alaska and
// Hawaii inset frames over a lower-48-only feature set. We show the lower 48,
// so the plain conic is the honest choice.

interface Cluster {
  status: string;
  plannedPowerMW: number | null;
  location: { lat: number; lng: number };
}

const MAP_W = 760;
const MAP_H = 470;
const SKIP = ["Alaska", "Hawaii", "Puerto Rico"];

const STATES = statesGeoRaw as unknown as FeatureCollection;
const CONTINENTAL: FeatureCollection = {
  type: "FeatureCollection",
  features: STATES.features.filter(
    (f) => !SKIP.includes((f.properties as { name?: string })?.name ?? ""),
  ),
};

const PROJECTION = geoAlbers().fitSize([MAP_W, MAP_H], CONTINENTAL);
const STATE_PATHS = CONTINENTAL.features.map((f) => geoPath(PROJECTION)(f) ?? "").filter(Boolean);

const STATUS_OPACITY: Record<string, number> = {
  operational: 1,
  construction: 0.7,
  announced: 0.38,
};

function radius(mw: number | null): number {
  const v = mw ?? 0;
  if (v >= 1500) return 6.5;
  if (v >= 600) return 5;
  if (v >= 200) return 3.8;
  return 3;
}

export function HeroMap() {
  const { data } = useQuery<Cluster[]>({ queryKey: ["/api/clusters"] });

  const dots = useMemo(() => {
    if (!data) return [];
    return data
      .map((c) => {
        if (typeof c.location?.lat !== "number" || typeof c.location?.lng !== "number") return null;
        const p = PROJECTION([c.location.lng, c.location.lat]);
        if (!p) return null;
        const [x, y] = p;
        if (x < 0 || x > MAP_W || y < 0 || y > MAP_H) return null;
        return { x, y, r: radius(c.plannedPowerMW), o: STATUS_OPACITY[c.status] ?? 0.5 };
      })
      .filter(Boolean) as { x: number; y: number; r: number; o: number }[];
  }, [data]);

  return (
    <svg
      className="gt-hero-map"
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      role="presentation"
      aria-hidden
      data-testid="hero-map"
    >
      <g fill="none" stroke="#6d6862" strokeWidth={0.9} strokeLinejoin="round">
        {STATE_PATHS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g fill="var(--mkt-accent)">
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} fillOpacity={d.o} />
        ))}
      </g>
    </svg>
  );
}
