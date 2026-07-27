/**
 * The landing hero: the mission over the real buildout. A quiet live map of
 * every tracked facility is the backdrop; the statement sits on top. No
 * feature narration, just the why and two doors in.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MapContainer, TileLayer, CircleMarker } from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface HeroFacility {
  id: number;
  lat: number;
  lng: number;
  powerMW: number | null;
  status: string;
}

const STATUS_OPACITY: Record<string, number> = {
  operational: 0.9,
  construction: 0.5,
  announced: 0.25,
};

export function LandingHero() {
  const { data: facilities } = useQuery<HeroFacility[]>({ queryKey: ["/api/datacenters"] });

  return (
    <section
      className="relative h-[86vh] min-h-[540px] max-h-[900px] w-full overflow-hidden border-b border-rule"
      data-testid="landing-hero"
    >
      {/* The buildout itself, as the backdrop. `isolate` contains Leaflet's
          internal z-400 panes so the statement can sit above the map. */}
      <div className="absolute inset-0 isolate z-0" aria-hidden>
        <MapContainer
          center={[36.8, -93.5]}
          zoom={4.7}
          zoomControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          touchZoom={false}
          keyboard={false}
          attributionControl={false}
          className="h-full w-full"
          style={{ background: "var(--paper)" }}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png" />
          {facilities?.map((f) => (
            <CircleMarker
              key={f.id}
              center={[f.lat, f.lng]}
              radius={Math.max(4, Math.min(15, Math.sqrt(f.powerMW ?? 100) / 2.4))}
              pathOptions={{
                color: "#F07800",
                weight: 1,
                fillColor: "#F07800",
                fillOpacity: STATUS_OPACITY[f.status] ?? 0.3,
                opacity: (STATUS_OPACITY[f.status] ?? 0.3) + 0.1,
              }}
            />
          ))}
        </MapContainer>
      </div>

      {/* Legibility wash: paper on the reading side, fading over the map */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, var(--paper) 0%, rgba(249,247,242,0.94) 30%, rgba(249,247,242,0.55) 52%, rgba(249,247,242,0) 78%), linear-gradient(0deg, var(--paper) 0%, rgba(249,247,242,0) 18%)",
        }}
        aria-hidden
      />

      {/* The statement */}
      <div className="relative z-10 mx-auto flex h-full max-w-[1200px] flex-col justify-center px-5 sm:px-8">
        <div className="max-w-[620px]">
          <p className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-brand-ink">
            <span className="tilt-glyph" aria-hidden />
            GridTilt
          </p>
          <h1 className="font-serif text-[52px] leading-[0.95] tracking-[-0.01em] text-ink sm:text-[84px]">
            The AI buildout,
            <br />
            made visible.
          </h1>
          <p className="mt-6 max-w-[46ch] text-[16px] leading-[1.6] text-ink-secondary sm:text-[17px]">
            The largest infrastructure project in a generation is underway: data centers, the
            power plants feeding them, and the companies behind both. GridTilt maps it with
            sourced numbers, so anyone can see what is being built, where the electricity comes
            from, and why it shows up on a power bill.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-5">
            <Link
              href="/overview"
              className="bg-ink px-6 py-3 text-[14px] font-semibold text-paper no-underline transition-colors hover:bg-brand-ink"
              data-testid="hero-cta-today"
            >
              Today's read →
            </Link>
            <Link
              href="/power-map"
              className="text-[14px] font-semibold text-ink no-underline hover:text-brand-ink"
              data-testid="hero-cta-map"
            >
              Explore the map →
            </Link>
          </div>
          {facilities && (
            <p className="mt-8 text-[12.5px] text-ink-muted">
              {facilities.length} tracked US facilities · solid marks operational, faint marks
              announced · GridTilt registry
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
