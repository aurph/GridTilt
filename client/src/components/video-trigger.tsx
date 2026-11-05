import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Play, X } from "lucide-react";
import type { Explainer } from "@/data/explainers";

/**
 * A quiet way into a video: a play glyph or a small thumbnail, a title and a
 * length. The video opens in an overlay, so the page never moves. Nothing downloads
 * until it opens, and nothing plays until the reader presses play. Esc or a click on
 * the backdrop closes it, which stops it and puts focus back on the trigger.
 *
 * Native <dialog>: the browser handles the focus trap, Esc and the top layer. The
 * player only exists while open, which is what keeps a closed one from downloading.
 * It renders under <body>: moving focus into it from inside a clipped section, like
 * the home hero, scrolled that section and left the page's content out of place.
 */
export function VideoTrigger({
  video,
  label,
  thumb,
  className = "",
  testId,
}: {
  video: Explainer;
  /** The words on the trigger, when they differ from the video's title. */
  label?: string;
  /** A small image for a row of thumbnails. Without it the trigger is one line of text. */
  thumb?: string;
  className?: string;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const player = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    // So Space starts it. The browser would otherwise focus the close button.
    player.current?.focus({ preventScroll: true });
  }, [open]);

  const closed = () => {
    player.current?.pause();
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`${thumb ? "flex items-center gap-3 text-left" : "inline-flex items-center gap-1.5 whitespace-nowrap"} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${className}`}
        data-testid={testId}
      >
        {thumb ? (
          <>
            <span className="relative block h-[54px] w-24 shrink-0 overflow-hidden rounded bg-background">
              <img src={thumb} alt="" width={96} height={54} loading="lazy" decoding="async" className="block h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center">
                <Play className="h-4 w-4 fill-white text-white" aria-hidden />
              </span>
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold leading-tight text-foreground">{label ?? video.title}</span>
              <span className="mt-1 block font-mono text-11 tabular-nums text-muted-foreground">{video.duration}</span>
            </span>
          </>
        ) : (
          <>
            <Play className="h-3 w-3 shrink-0 fill-current" aria-hidden />
            <span>{label ?? video.title}</span>
            <span className="font-mono tabular-nums opacity-70">{video.duration}</span>
          </>
        )}
      </button>

      {open && createPortal(
        <dialog
          ref={dialog}
          onClose={closed}
          // A click on the backdrop lands on the dialog itself: its contents cover the rest of it.
          onClick={(e) => {
            if (e.target === dialog.current) dialog.current?.close();
          }}
          aria-label={video.title}
          className="m-auto w-[min(1000px,calc(100vw-2rem),calc((100dvh-8rem)*16/9))] max-w-none overflow-hidden rounded-xl border border-card-border bg-card p-0 text-left text-foreground backdrop:bg-black/80"
          data-testid={`${testId}-dialog`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
            <h2 className="flex items-baseline gap-2 text-[13px] font-semibold text-foreground">
              {video.title}
              <span className="font-mono text-11 font-normal tabular-nums text-muted-foreground">{video.duration}</span>
            </h2>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
              data-testid={`${testId}-close`}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <video
            ref={player}
            controls
            preload="metadata"
            playsInline
            poster={video.poster}
            aria-label={video.title}
            className="block aspect-video w-full bg-black"
            data-testid={`${testId}-video`}
          >
            <source src={video.video} type="video/mp4" />
            {/* On by default: the re-cuts have no captions burned in, so this is the only text. */}
            <track kind="captions" src={video.captions} srcLang="en" label="English" default />
          </video>
          {video.sources.length > 0 && (
            <p className="border-t border-border px-4 py-2 text-10 leading-relaxed text-muted-foreground/70" data-testid={`${testId}-sources`}>
              Sources:{" "}
              {video.sources.map((s, i) => (
                <Fragment key={s.url}>
                  {i > 0 && " · "}
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand-2">
                    {s.label}
                  </a>
                </Fragment>
              ))}
            </p>
          )}
        </dialog>,
        document.body,
      )}
    </>
  );
}
