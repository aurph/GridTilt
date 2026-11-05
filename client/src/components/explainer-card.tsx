import { Fragment } from "react";
import { Card } from "@/components/ui/card";
import type { Explainer } from "@/data/explainers";

/**
 * One explainer: its title and length, the video, and the sources behind the
 * narration. Nothing downloads until the reader presses play. The aspect class
 * holds the player's space, so the page does not move when the poster arrives.
 */
export function ExplainerCard({ explainer, className = "" }: { explainer: Explainer; className?: string }) {
  const { id, title, duration, video, poster, captions, sources } = explainer;
  return (
    <Card id={id} className={`border-card-border overflow-hidden scroll-mt-4 ${className}`} data-testid={`explainer-${id}`}>
      <div className="px-4 py-2 border-b border-border flex items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
        <span className="font-mono text-11 text-muted-foreground tabular-nums">{duration}</span>
      </div>
      <video
        controls
        preload="none"
        playsInline
        poster={poster}
        aria-label={title}
        className="block aspect-video w-full bg-background"
        data-testid={`explainer-video-${id}`}
      >
        <source src={video} type="video/mp4" />
        <track kind="captions" src={captions} srcLang="en" label="English" />
      </video>
      <p className="px-4 py-2 border-t border-border text-10 leading-relaxed text-muted-foreground/70" data-testid={`explainer-sources-${id}`}>
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
    </Card>
  );
}
