import { Fragment } from "react";
import { PosterVideo } from "@/components/poster-video";
import { Card } from "@/components/ui/card";
import type { Explainer } from "@/data/explainers";

/**
 * One explainer: its title and length, the video, and the sources behind the
 * narration.
 *
 * `row` is for a page whose data comes first: from lg up the player sits beside
 * the title and sources, so the card costs the page one short band.
 */
export function ExplainerCard({ explainer, layout = "stack" }: { explainer: Explainer; layout?: "stack" | "row" }) {
  const { id, title, duration, video, poster, captions, sources } = explainer;
  const row = layout === "row";

  const heading = (
    <div className="px-4 py-2 border-b border-border flex items-baseline justify-between gap-2">
      <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
      <span className="font-mono text-11 text-muted-foreground tabular-nums">{duration}</span>
    </div>
  );
  const player = (
    <PosterVideo
      video={video}
      poster={poster}
      captions={captions}
      title={title}
      className={row ? "lg:border-r lg:border-border" : ""}
      testId={`explainer-video-${id}`}
    />
  );
  const sourceLine = (
    <p className="px-4 py-2 text-10 leading-relaxed text-muted-foreground/70" data-testid={`explainer-sources-${id}`}>
      Sources:{" "}
      {sources.map((s, i) => (
        <Fragment key={s.url}>
          {i > 0 && " · "}
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand-2">
            {s.label}
          </a>
        </Fragment>
      ))}
    </p>
  );

  return (
    <Card id={id} className="border-card-border overflow-hidden scroll-mt-4" data-testid={`explainer-${id}`}>
      {row ? (
        <>
          <div className="lg:hidden">{heading}</div>
          <div className="lg:grid lg:grid-cols-[320px_minmax(0,1fr)]">
            {player}
            <div>
              <div className="hidden lg:block">{heading}</div>
              {sourceLine}
            </div>
          </div>
        </>
      ) : (
        <>
          {heading}
          {player}
          <div className="border-t border-border">{sourceLine}</div>
        </>
      )}
    </Card>
  );
}
