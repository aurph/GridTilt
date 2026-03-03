import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
import TiltOverview from "@/pages/TiltOverview";
import TheStack from "@/pages/TheStack";
import PowerMap from "@/pages/PowerMap";
import TheTrade from "@/pages/TheTrade";
import PortfolioOverlay from "@/pages/PortfolioOverlay";
import { useLocation } from "wouter";

const PAGE_TITLES: Record<string, string> = {
  "/": "Tilt Overview",
  "/stack": "The Stack",
  "/power-map": "Power Map",
  "/trade": "Thesis Calculator",
  "/portfolio": "Portfolio Overlay",
};

function Header() {
  const [location] = useLocation();
  const pageTitle = PAGE_TITLES[location] ?? "GridTilt";

  return (
    <header
      className="flex items-center gap-3 px-4 border-b border-border bg-background/90 backdrop-blur-sm flex-shrink-0"
      style={{ zIndex: 50, height: "42px" }}
    >
      <SidebarTrigger data-testid="button-sidebar-toggle" className="text-muted-foreground h-7 w-7" />
      <div className="w-px h-4 bg-border" />
      <span className="text-xs font-semibold text-foreground tracking-wide">{pageTitle}</span>
      <div className="flex-1" />
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="hidden sm:inline font-mono text-muted-foreground/60">GridTilt</span>
        <span className="text-border hidden sm:inline">·</span>
        <span className="hidden md:inline text-muted-foreground/70">AI Infrastructure and Power Economy</span>
        <span className="text-border hidden md:inline">·</span>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
          <span className="text-muted-foreground/70">Live</span>
        </div>
      </div>
    </header>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={TiltOverview} />
      <Route path="/stack" component={TheStack} />
      <Route path="/power-map" component={PowerMap} />
      <Route path="/trade" component={TheTrade} />
      <Route path="/portfolio" component={PortfolioOverlay} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const style = {
    "--sidebar-width": "17rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <SidebarProvider style={style as React.CSSProperties} defaultOpen={true}>
          <div className="flex h-screen w-full bg-background overflow-hidden">
            <AppSidebar />
            <div className="flex flex-col flex-1 min-w-0">
              <Header />
              <main className="flex-1 overflow-hidden">
                <Router />
              </main>
            </div>
          </div>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
