import { useEffect } from "react";
import { ExplainerCard } from "@/components/explainer-card";
import { PageHeader } from "@/components/PageHeader";
import { EXPLAINERS } from "@/data/explainers";

export default function Explainers() {
  // This page's code arrives after the browser has already looked for the
  // address's #anchor, so a link to one video has to be honored here.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  return (
    <div className="flex flex-col h-full overflow-y-auto" data-testid="explainers-page">
      <PageHeader title="Explainers" testId="explainers-header" />
      <div className="flex-1 w-full max-w-[1000px] mx-auto p-4 sm:p-6 space-y-4">
        {EXPLAINERS.map((e) => (
          <ExplainerCard key={e.id} explainer={e} />
        ))}
      </div>
    </div>
  );
}
