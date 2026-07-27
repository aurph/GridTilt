import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, CircleMarker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Zap, Handshake, Cpu, MapPin } from "lucide-react";
import { Wordmark } from "./Wordmark";
import { BRAND } from "@/lib/tokens";

interface HeroFacility {
  id: number;
  lat: number;
  lng: number;
  powerMW: number | null;
  status: string;
}

interface ClusterMetrics {
  clusterCount: number;
  operationalMW: number;
  totalPlannedMW: number;
  byOperator: { operator: string }[];
}
interface DealMetrics { dealCount: number; totalContractedMW: number; }
interface GpuMetrics { fleetAvg: number; fleetAvg1yChange: number; modelCount: number; }

const STATUS_OPACITY: Record<string, number> = { operational: 0.9, construction: 0.5, announced: 0.25 };

function gw(mw: number): string {
  return `${(mw / 1000).toFixed(1).replace(/\.0$/, "")} GW`;
}

export function Hero() {
  const { data: facilities } = useQuery<HeroFacility[]>({ queryKey: ["/api/datacenters"] });
  const { data: clusters } = useQuery<ClusterMetrics>({ queryKey: ["/api/clusters/metrics"] });
  const { data: deals } = useQuery<DealMetrics>({ queryKey: ["/api/deals/metrics"] });
  const { data: gpu } = useQuery<GpuMetrics>({ queryKey: ["/api/gpu-prices/metrics"] });

  const stats: { icon: typeof Zap; label: string; value: string; sub?: string }[] = [
    { icon: Zap, label: "Operational power for compute", value: clusters ? gw(clusters.operationalMW) : "--", sub: clusters ? `${gw(clusters.totalPlannedMW)} planned` : undefined },
    { icon: Handshake, label: "Contracted power deals", value: deals ? gw(deals.totalContractedMW) : "--", sub: deals ? `${deals.dealCount} corporate deals` : undefined },
    { icon: Cpu, label: "Cost of compute", value: gpu ? `$${gpu.fleetAvg.toFixed(2)}/hr` : "--", sub: gpu ? `${gpu.fleetAvg1yChange}% over a year` : undefined },
    { icon: MapPin, label: "Tracked clusters", value: clusters ? String(clusters.clusterCount) : "--", sub: clusters?.byOperator ? `${clusters.byOperator.length} operators` : undefined },
  ];

  return (
    <section
      className="gt-marketing relative w-full overflow-hidden border-b border-border"
      style={{ minHeight: "calc(100vh - 88px)" }}
      data-testid="home-hero"
    >
      {/* The buildout itself, live, as the backdrop. isolate contains
          Leaflet's internal z-panes below the content. */}
      <div className="absolute inset-0 isolate z-0" aria-hidden>
        <MapContainer
          center={[37.2, -93]}
          zoom={4.5}
          zoomControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          touchZoom={false}
          keyboard={false}
          attributionControl={false}
          className="h-full w-full"
          style={{ background: "#101010" }}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png" />
          {facilities?.map((f) => (
            <CircleMarker
              key={f.id}
              center={[f.lat, f.lng]}
              radius={Math.max(4, Math.min(14, Math.sqrt(f.powerMW ?? 100) / 2.5))}
              pathOptions={{
                color: BRAND.primary,
                weight: 1,
                fillColor: BRAND.primary,
                fillOpacity: STATUS_OPACITY[f.status] ?? 0.25,
                opacity: (STATUS_OPACITY[f.status] ?? 0.25) + 0.1,
              }}
            />
          ))}
        </MapContainer>
      </div>
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            "linear-gradient(180deg, rgba(16,16,16,0.92) 0%, rgba(16,16,16,0.55) 34%, rgba(16,16,16,0.35) 60%, rgba(16,16,16,0.96) 100%)",
        }}
        aria-hidden
      />

      {/* The statement */}
      <div className="relative z-10 mx-auto flex min-h-[inherit] max-w-[1200px] flex-col items-center justify-center px-6 py-16 text-center">
        <Wordmark />
        <p className="mt-5 text-[16px] font-semibold text-foreground sm:text-[18px]">
          Energy infrastructure, in plain sight.
        </p>
        <p className="mx-auto mt-3 max-w-[54ch] text-[14px] leading-[1.65] text-muted-foreground sm:text-[15px]">
          Data centers are rewriting the American power grid. GridTilt maps who is building,
          where the electricity comes from, and what it means for the bill you pay.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/overview"
            className="bg-brand px-6 py-3 text-[14px] font-semibold text-black no-underline transition-opacity hover:opacity-90 rounded"
            data-testid="hero-cta-dashboard"
          >
            Open the dashboard
          </Link>
          <Link
            href="/power-map"
            className="rounded border border-border bg-card/60 px-6 py-3 text-[14px] font-semibold text-foreground no-underline transition-colors hover:border-brand/50"
            data-testid="hero-cta-map"
          >
            Explore the map
          </Link>
        </div>

        {/* Live figures, icon-led */}
        <div className="mt-14 grid w-full grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" data-testid="hero-stats">
          {stats.map(({ icon: Icon, label, value, sub }) => (
            <div
              key={label}
              className="rounded-md border border-border bg-card/70 px-4 py-3.5 text-left backdrop-blur-sm"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-brand" aria-hidden />
                <span className="text-[12px] leading-tight text-muted-foreground">{label}</span>
              </div>
              <p className="mt-1.5 font-mono text-[24px] font-bold leading-none tracking-tight text-foreground">
                {value}
              </p>
              {sub && <p className="mt-1 text-[11.5px] text-muted-foreground/80">{sub}</p>}
            </div>
          ))}
        </div>
        {facilities && (
          <p className="mt-5 text-[11.5px] text-muted-foreground/70">
            {facilities.length} tracked US facilities live on the map · solid marks operational, faint marks announced
          </p>
        )}
      </div>
    </section>
  );
}
