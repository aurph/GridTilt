import { useLocation, Link } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Layers,
  Map,
  Link2,
  BarChart3,
  CalendarDays,
  FileText,
} from "lucide-react";
import logoPath from "@assets/Untitled_design_(4)_1772554897403.png";

const navItems = [
  {
    title: "Tilt Overview",
    url: "/",
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
    title: "Power Map",
    url: "/power-map",
    icon: Map,
    description: "US data center locations",
  },
  {
    title: "Supply Chain",
    url: "/supply-chain",
    icon: Link2,
    description: "Power flow bottlenecks",
  },
  {
    title: "Portfolio Overlay",
    url: "/portfolio",
    icon: BarChart3,
    description: "AI Power Exposure score",
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
            className="h-9 w-9 rounded-md object-cover"
          />
          <div>
            <div className="font-bold text-base tracking-tight text-foreground">
              Grid<span className="text-[#F07800]">Tilt</span>
            </div>
            <div className="text-xs text-muted-foreground tracking-wide">AI Power Economy</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="pt-4">
          <SidebarGroupLabel className="text-xs uppercase tracking-widest text-muted-foreground mb-2 px-3">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.url || (item.url !== "/" && location.startsWith(item.url));
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive}
                      className="h-auto py-2.5 px-3 rounded-md relative"
                    >
                      <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                        {isActive && (
                          <span
                            className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[#F07800]"
                            style={{ left: "0.5rem", boxShadow: "0 0 8px rgba(240,120,0,0.6), 0 0 16px rgba(240,120,0,0.2)" }}
                          />
                        )}
                        <div className={`flex h-7 w-7 items-center justify-center rounded-sm ml-3 ${isActive ? "text-[#F07800]" : "text-muted-foreground"}`}>
                          <item.icon className="h-4 w-4" />
                        </div>
                        <div className="flex flex-col gap-0.5 ml-1">
                          <span className={`text-sm font-medium leading-none ${isActive ? "text-[#F07800]" : "text-foreground"}`}>
                            {item.title}
                          </span>
                          <span className="text-xs text-muted-foreground leading-none mt-1">{item.description}</span>
                        </div>
                      </Link>
                    </SidebarMenuButton>
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
              <div className="h-2 w-2 rounded-full bg-green-500 live-pulse" />
            </div>
            <span className="text-[11px] font-mono text-green-400/80">Live</span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground/50">15-min refresh</span>
        </div>
        <p className="text-[10px] text-muted-foreground/40 mt-2">
          Yahoo Finance · EIA · Public Sources
        </p>
        <p className="text-[10px] text-muted-foreground/35 mt-1.5 tracking-wide">
          Made by <span className="text-muted-foreground/50">Jack Schwartz</span> · aurph
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
