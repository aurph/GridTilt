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
  Zap,
  Activity,
} from "lucide-react";

const navItems = [
  {
    title: "Tilt Overview",
    url: "/",
    icon: LayoutDashboard,
    description: "Live KPIs & demand chart",
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
    title: "The Trade",
    url: "/trade",
    icon: TrendingUp,
    description: "Financial thesis builder",
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
          <div className="relative flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 border border-primary/20">
            <Zap className="h-5 w-5 text-primary" />
            <Activity className="h-3 w-3 text-amber absolute -top-1 -right-1" />
          </div>
          <div>
            <div className="font-bold text-base tracking-tight text-foreground">GridTilt</div>
            <div className="text-xs text-muted-foreground">AI Power Economy</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="pt-4">
          <SidebarGroupLabel className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
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
                      className="h-auto py-2.5 px-3 rounded-md"
                    >
                      <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                        <div className={`flex h-7 w-7 items-center justify-center rounded-sm ${isActive ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>
                          <item.icon className="h-4 w-4" />
                        </div>
                        <div className="flex flex-col gap-0.5 ml-1">
                          <span className={`text-sm font-medium leading-none ${isActive ? "text-primary" : "text-foreground"}`}>
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
      </SidebarFooter>
    </Sidebar>
  );
}
