/**
 * The nine regions drawn small, for a page with no map on it: the region the
 * page is about is filled, the others are outlines you can click to open
 * their pages, and the dots are mapped data center sites and tracked
 * campuses. Plain SVG from the same shapes file the map draws (lib/grid-regions
 * regionLocator), so no map library loads for it.
 */
import { useMemo } from "react";
import { useLocation } from "wouter";
import { SITE_COLOR } from "@/components/map/points-layer";
import { GRID_REGIONS, gridRegion, type GridRegionId } from "@/data/grid-regions";
import { regionLocator, type RegionShape } from "@/lib/grid-regions";
import { STATUS_COLORS } from "@/lib/tokens";

const W = 460;
const H = 290;

interface Dot {
  lat: number;
  lng: number;
}

export function RegionLocator({
  shapes,
  id,
  sites,
  campuses,
}: {
  shapes: RegionShape[];
  id: GridRegionId;
  /** Mapped data center sites: locations only. */
  sites?: Dot[] | null;
  /** Tracked campuses inside this region. */
  campuses?: Array<Dot & { id: number; status: "operational" | "construction" | "announced" }>;
}) {
  const [, navigate] = useLocation();
  const drawn = useMemo(() => regionLocator(shapes, W, H, 6), [shapes]);
  const siteDots = useMemo(() => (sites ?? []).map((s) => drawn.point(s.lat, s.lng)), [sites, drawn]);
  const region = gridRegion(id);
  // The selected region last, so its outline is never painted over by a neighbor's.
  const ordered = [...drawn.paths.filter((p) => p.id !== id), ...drawn.paths.filter((p) => p.id === id)];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="img"
      aria-label={`${region.fullName} among the nine grid regions of the lower 48`}
      data-testid="region-locator"
    >
      {ordered.map((p) => {
        const here = p.id === id;
        const other = GRID_REGIONS.find((r) => r.id === p.id);
        const shape = (
          <path
            d={p.d}
            fill={here ? region.color : "rgba(255,255,255,0.045)"}
            fillOpacity={here ? 0.42 : 1}
            stroke={here ? "#F07800" : "rgba(255,255,255,0.22)"}
            strokeWidth={here ? 1.4 : 0.6}
            strokeLinejoin="round"
            className={here ? undefined : "transition-[fill] hover:fill-white/[0.12]"}
          />
        );
        if (here || !other) return <g key={p.id}>{shape}</g>;
        return (
          <a
            key={p.id}
            href={`/region/${p.id}`}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/region/${p.id}`);
            }}
            aria-label={`${other.name} region page`}
            data-testid={`locator-${p.id}`}
          >
            <title>{other.name}</title>
            {shape}
          </a>
        );
      })}
      <g pointerEvents="none">
        {siteDots.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={0.9} fill={SITE_COLOR} fillOpacity={0.55} />
        ))}
        {(campuses ?? []).map((c) => {
          const [x, y] = drawn.point(c.lat, c.lng);
          return (
            <g key={c.id}>
              <circle cx={x} cy={y} r={5} fill={STATUS_COLORS[c.status]} fillOpacity={0.25} />
              <circle cx={x} cy={y} r={2.4} fill={STATUS_COLORS[c.status]} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
