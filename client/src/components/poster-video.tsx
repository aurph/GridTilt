import { useRef, useState } from "react";
import { Play } from "lucide-react";

/**
 * A native player that downloads nothing until the reader starts it. Desktop
 * Chrome ignores a click on the picture until a video has loaded, and with
 * preload="none" that left the poster dead under the cursor, so a button covers
 * the poster until the first play. After that the browser's own controls take over.
 * The aspect class holds the player's space while the poster loads.
 */
export function PosterVideo({
  video,
  poster,
  captions,
  title,
  className = "",
  testId,
}: {
  video: string;
  poster: string;
  captions: string;
  title: string;
  className?: string;
  testId: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  return (
    <div className={`relative aspect-video w-full ${className}`}>
      <video
        ref={ref}
        controls
        preload="none"
        playsInline
        poster={poster}
        aria-label={title}
        onPlay={() => setStarted(true)}
        className="block h-full w-full bg-background"
        data-testid={testId}
      >
        <source src={video} type="video/mp4" />
        {/* On by default: the re-cuts have no captions burned in, so this is the only text. */}
        <track kind="captions" src={captions} srcLang="en" label="English" default />
      </video>
      {!started && (
        <button
          type="button"
          onClick={() => void ref.current?.play().catch(() => {})}
          aria-label={`Play ${title}`}
          className="group absolute inset-0 flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
          data-testid={`${testId}-play`}
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/25 bg-black/60 text-white transition-colors group-hover:border-brand group-hover:text-brand">
            <Play className="h-7 w-7 translate-x-0.5" aria-hidden />
          </span>
        </button>
      )}
    </div>
  );
}
