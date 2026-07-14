import { useLocation, Link } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Layers,
  Map,
  Cpu,
  CalendarDays,
  FileText,
  Calculator,
  LineChart,
} from "lucide-react";
import logoPath from "@assets/Image_[Vectorized]_(2)_1773890483514.png";
import { BORDER, BRAND, FONT, INK } from "@/lib/tokens";

const navItems = [
  {
    title: "Tilt Overview",
    url: "/overview",
    icon: LayoutDashboard,
    description: "Live KPIs and demand chart",
  },
  {
    title: "The Stack",
    url: "/stack",
    icon: Layers,
    description: "Sector breakdown",
  },
  {
    title: "Power",
    url: "/power-map",
    icon: Map,
    description: "Facilities map, deals, grid queue",
  },
  {
    title: "Compute Frontier",
    url: "/compute-frontier",
    icon: Cpu,
    description: "AI superclusters by GPU and power",
  },
  {
    title: "GPU Prices",
    url: "/neocloud-intel",
    icon: LineChart,
    description: "Rental price index + cost of compute",
  },
  {
    title: "Analyze",
    url: "/analyze",
    icon: Calculator,
    description: "Portfolio exposure + scenarios",
  },
  {
    title: "Catalyst Tracker",
    url: "/catalysts",
    icon: CalendarDays,
    description: "Upcoming market events",
  },
  {
    title: "Analysis",
    url: "/blog",
    icon: FileText,
    description: "Research and data",
  },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <img
            src={logoPath}
            alt="GridTilt logo"
            className="h-16 w-16 rounded-md object-contain"
          />
          <div>
            <div className="font-bold text-base tracking-tight text-foreground" style={{ fontFamily: FONT.mono }}>
              Grid<span className="text-brand">Tilt</span>
            </div>
            <div className="text-10 text-muted-foreground tracking-wide font-mono">AI Power Economy</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="pt-3 px-2">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {navItems.map((item) => {
                const isActive = location === item.url || (item.url !== "/" && location.startsWith(item.url));
                return (
                  <SidebarMenuItem key={item.title}>
                    <Link
                      href={item.url}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                      className={`sidebar-nav-link flex items-center gap-3 px-3 py-2.5 no-underline ${isActive ? "sidebar-nav-active" : ""}`}
                      style={{
                        background: isActive ? BRAND.wash : "transparent",
                        borderLeft: isActive ? `3px solid ${BRAND.primary}` : "3px solid transparent",
                      }}
                    >
                      <div
                        className="sidebar-nav-icon-box flex items-center justify-center flex-shrink-0"
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 7,
                          background: isActive ? BRAND.glow : BORDER.subtle,
                        }}
                      >
                        <item.icon
                          style={{
                            width: 20,
                            height: 20,
                            color: isActive ? BRAND.primary : INK.faint,
                          }}
                        />
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span
                          className="sidebar-nav-title text-13 font-medium leading-tight"
                          style={{ color: isActive ? BRAND.primary : INK.secondary }}
                        >
                          {item.title}
                        </span>
                        <span
                          className="text-11 leading-tight truncate"
                          style={{ color: INK.faint }}
                        >
                          {item.description}
                        </span>
                      </div>
                    </Link>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-4 py-3 border-t border-sidebar-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative h-2 w-2">
              <div className="h-2 w-2 rounded-full bg-positive-deep live-pulse" />
            </div>
            <span className="text-11 font-mono text-positive/80">Live</span>
          </div>
          <span className="text-10 font-mono text-muted-foreground/50">15-min refresh</span>
        </div>
        <p className="text-10 text-muted-foreground/40 mt-2">
          Yahoo Finance · EIA · Public Sources
        </p>
        <p className="text-10 text-muted-foreground/35 mt-1.5 tracking-wide">
          Made by <span className="text-muted-foreground/50">Jack Schwartz</span> · aurph
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
