/**
 * Consolidation: Analyze = Portfolio Overlay + Scenario Calculator.
 * Both tools score user inputs against the AI power buildout, so they share
 * one screen with URL-persisted tabs (?tab=scenario shareable; old routes
 * can redirect into a tab). Same pattern as GPU Prices (ToolTabs).
 */
import { BarChart3 } from "lucide-react";
import { ToolTabs, useToolTabs, type ToolTab } from "@/components/ToolTabs";
import PortfolioOverlay from "@/pages/PortfolioOverlay";
import TheTrade from "@/pages/TheTrade";
import { FONT } from "@/lib/tokens";

export const ANALYZE_TABS: ToolTab[] = [
  { id: "portfolio", label: "Portfolio" },
  { id: "scenario", label: "Scenario" },
];

export default function Analyze() {
  const [tab, setTab] = useToolTabs(ANALYZE_TABS, "portfolio");

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="grid-bg border-b border-border px-4 sm:px-6 py-6 sm:py-8" data-testid="analyze-header">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-5 w-5 text-brand" />
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight" style={{ fontFamily: FONT.mono }}>
              Analyze
            </h1>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your inputs, scored against the AI power buildout - portfolio exposure and buildout scenarios.
          </p>
          <ToolTabs className="mt-3" tabs={ANALYZE_TABS} active={tab} onChange={setTab} />
        </div>
      </div>

      <div className="flex-1 p-4 sm:p-6">
        {tab === "scenario" ? <TheTrade embedded /> : <PortfolioOverlay embedded />}
      </div>
    </div>
  );
}
