import { AmbientClip } from "@/components/ambient-clip";

/** A row of transformers, between the tools and the electricity chart. */
export function GridGearBand() {
  return (
    <section className="w-full aspect-video sm:aspect-[21/9] sm:max-h-[560px] border-b border-border bg-background" data-testid="home-clip-band">
      <AmbientClip src="/media/clips/thu-grid-backlog-v1.mp4" poster="/media/clips/thu-grid-backlog-v1.webp" testId="home-clip" />
    </section>
  );
}
