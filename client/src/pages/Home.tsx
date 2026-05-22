import { HeroIndexStrip } from "@/components/home/HeroIndexStrip";
import { DemandChartSwiss } from "@/components/home/DemandChartSwiss";
import { ModulesTableOfContents } from "@/components/home/ModulesTableOfContents";
import { LiveSignals } from "@/components/home/LiveSignals";
import { BuildYourOwnTeaser } from "@/components/home/BuildYourOwnTeaser";
import { ThesisSection } from "@/components/home/ThesisSection";
import { HomeFooter } from "@/components/home/HomeFooter";

export default function Home() {
  return (
    <div className="anchor-swiss min-h-screen w-full">
      <HeroIndexStrip />
      <DemandChartSwiss />
      <ModulesTableOfContents />
      <LiveSignals />
      <BuildYourOwnTeaser />
      <ThesisSection />
      <HomeFooter />
    </div>
  );
}
