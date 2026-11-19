/**
 * The card that plays "How the grid works" over the map: one stop at a time,
 * a dot row for progress, Back and Next, and a way out (the close button or
 * Escape). The stops and their words come from lib/grid-tour.ts; the map
 * itself is driven by the page, which reads the current stop.
 */
import { useEffect } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import type { TourStep } from "@/lib/grid-tour";

export function GridTourCard({
  steps,
  index,
  onIndex,
  onClose,
}: {
  steps: TourStep[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const step = steps[index];
  const last = index === steps.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && index < steps.length - 1) onIndex(index + 1);
      else if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, steps.length, onIndex, onClose]);

  if (!step) return null;
  return (
    <div
      // On a phone the card sits at the top of the map: the bottom edge is
      // where the site's floating bar is, and Back and Next must stay reachable.
      className="pointer-events-auto absolute left-1/2 top-3 z-[1060] w-[min(440px,calc(100%-24px))] -translate-x-1/2 rounded-lg border border-brand/35 bg-surface-raised/[0.97] p-4 shadow-2xl backdrop-blur-md sm:bottom-3 sm:top-auto"
      role="dialog"
      aria-label="How the grid works"
      data-testid="grid-tour"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-10 font-semibold uppercase tracking-wide text-brand">
            How the grid works · {index + 1} of {steps.length}
          </p>
          <div key={step.id} className="gt-fade-in" aria-live="polite">
            <h3 className="mt-1 text-[15px] font-bold leading-tight text-white" data-testid="grid-tour-title">
              {step.title}
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/80" data-testid="grid-tour-caption">
              {step.caption}
            </p>
            <p className="mt-1.5 text-10 leading-snug text-white/40">
              Source:{" "}
              {step.sourceHref ? (
                <a href={step.sourceHref} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-white/70">
                  {step.source}
                </a>
              ) : (
                step.source
              )}
            </p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="-mr-1.5 -mt-1.5 rounded p-2 text-white/50 hover:bg-white/10 hover:text-white" aria-label="End the tour" data-testid="grid-tour-close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Tour stops">
          {steps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`${i + 1}. ${s.title}`}
              onClick={() => onIndex(i)}
              className="flex h-5 w-4 items-center justify-center"
              data-testid={`grid-tour-dot-${i}`}
            >
              <span className={`block h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-brand" : "w-1.5 bg-white/25 hover:bg-white/50"}`} />
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => onIndex(index - 1)}
            disabled={index === 0}
            className="flex h-8 items-center gap-1 rounded border border-subtle px-2.5 text-xs text-white/70 hover:text-white disabled:opacity-30"
            data-testid="grid-tour-back"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden /> Back
          </button>
          <button
            type="button"
            onClick={() => (last ? onClose() : onIndex(index + 1))}
            className="flex h-8 items-center gap-1 rounded bg-brand px-3 text-xs font-semibold text-black hover:opacity-90"
            data-testid="grid-tour-next"
          >
            {last ? "Done" : "Next"} {!last && <ArrowRight className="h-3 w-3" aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  );
}
