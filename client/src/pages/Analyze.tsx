/**
 * Consolidation: Analyze = Portfolio Overlay + Scenario Calculator.
 * Both tools score user inputs against the AI power buildout, so they share
 * one screen with URL-persisted tabs (?tab=scenario shareable; old routes
 * can redirect into a tab). Same pattern as GPU Prices (ToolTabs).
 */
import { ToolTabs, useToolTabs, type ToolTab } from "@/components/ToolTabs";
import { PageShell, PageTitle } from "@/components/editorial";
import PortfolioOverlay from "@/pages/PortfolioOverlay";
import TheTrade from "@/pages/TheTrade";

export const ANALYZE_TABS: ToolTab[] = [
  { id: "portfolio", label: "Portfolio" },
  { id: "scenario", label: "Scenario" },
];

export default function Analyze() {
  const [tab, setTab] = useToolTabs(ANALYZE_TABS, "portfolio");

  return (
    <PageShell>
      <PageTitle
        title="Analyze"
        testId="analyze-header"
      />
      <ToolTabs tabs={ANALYZE_TABS} active={tab} onChange={setTab} />
      <div className="mt-6">
        {tab === "scenario" ? <TheTrade embedded /> : <PortfolioOverlay embedded />}
      </div>
    </PageShell>
  );
}
