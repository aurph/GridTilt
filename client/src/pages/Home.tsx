import { Hero } from "@/components/home/Hero";
import { FeaturesShowcase } from "@/components/home/FeaturesShowcase";
import { DemandChart } from "@/components/home/DemandChart";
import { FloatingScrollCue } from "@/components/home/FloatingScrollCue";

// SiteFooter is rendered by App.tsx inside <main> for every route, including
// "/". This page used to add HomeFooter on top of it, so the landing shipped
// two footers: two brand lockups, two copyright lines, two source lists. The
// GitHub and contact links that only HomeFooter carried moved into SiteFooter.
export default function Home() {
  return (
    <div className="gt-marketing min-h-screen w-full">
      <Hero />
      <FeaturesShowcase />
      <DemandChart />
      <FloatingScrollCue />
    </div>
  );
}
