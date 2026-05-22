import { Hero } from "@/components/home/Hero";
import { FeaturesShowcase } from "@/components/home/FeaturesShowcase";
import { DemandChart } from "@/components/home/DemandChart";
import { BuildYourOwnTeaser } from "@/components/home/BuildYourOwnTeaser";
import { HomeFooter } from "@/components/home/HomeFooter";
import { FloatingScrollCue } from "@/components/home/FloatingScrollCue";

export default function Home() {
  return (
    <div className="gt-marketing min-h-screen w-full">
      <Hero />
      <FeaturesShowcase />
      <DemandChart />
      <BuildYourOwnTeaser />
      <HomeFooter />
      <FloatingScrollCue />
    </div>
  );
}
