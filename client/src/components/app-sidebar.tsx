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
  TrendingUp,
  BarChart3,
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
    title: "Thesis Calculator",
    url: "/trade",
    icon: TrendingUp,
    description: "Scenario analysis",
  },
  {
    title: "Portfolio Overlay",
    url: "/portfolio",
    icon: BarChart3,
    description: "AI Power Exposure score",
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
                            className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-[#F07800]"
                            style={{ left: "0.5rem" }}
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
        <div className="flex items-center gap-2">
          <div className="relative h-2 w-2">
            <div className="h-2 w-2 rounded-full bg-green-500 live-pulse" />
          </div>
          <span className="text-xs text-muted-foreground">Live market data</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
          Data: Yahoo Finance · EIA · Public Sources
        </p>
        <p className="text-xs text-muted-foreground/50 mt-2 leading-relaxed tracking-wide">
          Made by <span className="text-muted-foreground/70">Jack Schwartz</span> · aurph
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
