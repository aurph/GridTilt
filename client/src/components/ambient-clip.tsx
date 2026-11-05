import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

/**
 * A silent clip with no words or data in it. The poster shows first. The clip
 * plays through once when it is on screen, pauses when it leaves, and rests on
 * its last frame, because these clips do not loop cleanly. It stays on the poster
 * for a reader who asked for reduced motion or less data, and the button lets
 * anyone start or stop it. Nothing downloads until it plays.
 */
export function AmbientClip({ src, poster, testId }: { src: string; poster: string; testId: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const stoppedByReader = useRef(false);
  const startedByReader = useRef(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const saveData = Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
    let onScreen = false;
    const sync = () => {
      const allowed = startedByReader.current || (!motion.matches && !saveData);
      if (onScreen && allowed && !stoppedByReader.current && !document.hidden && !v.ended) {
        // Refused when the browser blocks autoplay (iOS Low Power Mode): the poster stays.
        void v.play().catch(() => {});
      } else {
        v.pause();
      }
    };
    const seen = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      },
      { threshold: 0.25 },
    );
    seen.observe(v);
    motion.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      seen.disconnect();
      motion.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (playing) {
      stoppedByReader.current = true;
      v.pause();
    } else {
      stoppedByReader.current = false;
      startedByReader.current = true;
      if (v.ended) v.currentTime = 0;
      void v.play().catch(() => {});
    }
  };

  return (
    <div className="relative h-full w-full" data-testid={testId}>
      <video
        ref={ref}
        muted
        playsInline
        preload="none"
        poster={poster}
        aria-hidden="true"
        tabIndex={-1}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className="absolute inset-0 h-full w-full object-cover"
      >
        <source src={src} type="video/mp4" />
      </video>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause the clip" : "Play the clip"}
        className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded bg-black/60 text-white/80 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        data-testid={`${testId}-toggle`}
      >
        {playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
      </button>
    </div>
  );
}
