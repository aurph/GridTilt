import { Hero } from "@/components/home/Hero";
import { HomeRecord } from "@/components/home/home-record";
import { DemandChart } from "@/components/home/DemandChart";

// SiteFooter is rendered by App.tsx inside <main> for every route, including
// "/". This page used to add HomeFooter on top of it, so the landing shipped
// two footers: two brand lockups, two copyright lines, two source lists. The
// GitHub and contact links that only HomeFooter carried moved into SiteFooter.
//
// The first screen leads with the state pages and the map. Below it sit
// three lists read from the records themselves (HomeRecord), then the
// electricity use chart.
export default function Home() {
  return (
    <div className="gt-marketing min-h-screen w-full">
      <Hero />
      <HomeRecord />
      <DemandChart />
    </div>
  );
}
