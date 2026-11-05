import { PosterVideo } from "@/components/poster-video";

/**
 * The launch film, under the hero. The reader starts it, and nothing downloads
 * until then. Files under /media are cached for a year (server/static.ts), so a
 * re-cut needs a new file name here.
 */
const FILM = {
  video: "/media/film/gridtilt-film-v1.mp4",
  poster: "/media/film/gridtilt-film-v1.jpg",
  captions: "/media/film/gridtilt-film-v1.vtt",
  duration: "0:34",
};

export function FilmSection() {
  return (
    <section className="border-b border-border bg-background" data-testid="home-film">
      <div className="mx-auto max-w-[1200px] px-6 py-16 sm:py-20">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[28px] font-bold leading-tight tracking-tight text-foreground sm:text-[36px]">The film</h2>
          <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{FILM.duration}</span>
        </div>
        <PosterVideo
          video={FILM.video}
          poster={FILM.poster}
          captions={FILM.captions}
          title="The film"
          className="mt-8 overflow-hidden rounded-md border border-border bg-card"
          testId="home-film-video"
        />
      </div>
    </section>
  );
}
