import { VideoTrigger } from "@/components/video-trigger";
import { LAUNCH_FILM } from "@/data/explainers";

const HORIZ_PAD = "clamp(24px, 5vw, 96px)";

/**
 * The last section of the home page: why the site exists, in three sentences,
 * beside a still from the 34-second video that says the same thing. The still
 * is the button; the player and the video load only when it is opened.
 *
 * The first two sentences are the video's own. The third says only what the
 * site does: the video's "mostly out of sight" is framing, and the proceedings
 * it means are public records, so the page does not repeat it. No figures, so
 * no source line. The video used to hang under the hero's buttons as a text
 * link ("Watch the film"); it moved here on 2026-11-19 (owner's call).
 */
export function HomeFilm() {
  return (
    <section
      style={{
        position: "relative",
        paddingTop: "clamp(72px, 11vh, 128px)",
        paddingBottom: "clamp(72px, 11vh, 128px)",
      }}
      data-testid="home-film"
    >
      <div className="gt-rule-top" style={{ position: "absolute", top: 0, left: 0, right: 0 }} />
      <div
        className="mx-auto grid max-w-[1280px] items-center gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-16"
        style={{ paddingLeft: HORIZ_PAD, paddingRight: HORIZ_PAD }}
      >
        <div>
          <h2 className="gt-section-heading" style={{ marginBottom: 24 }}>Why GridTilt exists</h2>
          <p className="gt-section-dek">
            Every new data center needs power. Someone decides where it comes from, who pays, and when. GridTilt
            keeps a public record of what is decided and what gets built, with a source for every figure.
          </p>
        </div>
        <VideoTrigger video={LAUNCH_FILM} still={LAUNCH_FILM.still} label="Play the video" testId="home-film-trigger" />
      </div>
    </section>
  );
}
