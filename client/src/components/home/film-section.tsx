/**
 * The launch film, under the hero. The reader starts it, and nothing downloads
 * until then. Files under /media are cached for a year (server/static.ts), so a
 * re-cut needs a new file name here.
 */
const FILM = {
  video: "/media/film/gridtilt-film-v1.mp4",
  poster: "/media/film/gridtilt-film-v1.jpg",
  captions: "/media/film/gridtilt-film-v1.vtt",
  duration: "0:35",
};

export function FilmSection() {
  return (
    <section className="border-b border-border bg-background" data-testid="home-film">
      <div className="mx-auto max-w-[1200px] px-6 py-16 sm:py-20">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[28px] font-bold leading-tight tracking-tight text-foreground sm:text-[36px]">The film</h2>
          <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{FILM.duration}</span>
        </div>
        <video
          controls
          preload="none"
          playsInline
          poster={FILM.poster}
          aria-label="The film"
          className="mt-8 block aspect-video w-full rounded-md border border-border bg-card"
          data-testid="home-film-video"
        >
          <source src={FILM.video} type="video/mp4" />
          {/* On by default: the re-cut has no captions burned in. */}
          <track kind="captions" src={FILM.captions} srcLang="en" label="English" default />
        </video>
      </div>
    </section>
  );
}
