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
              <header className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-background/80 backdrop-blur-sm flex-shrink-0" style={{ zIndex: 50 }}>
                <SidebarTrigger data-testid="button-sidebar-toggle" className="text-muted-foreground" />
                <div className="flex-1" />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="hidden sm:inline">GridTilt v1.0</span>
                  <span className="text-border">·</span>
                  <span>AI Infrastructure & Power Economy</span>
                </div>
              </header>
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
