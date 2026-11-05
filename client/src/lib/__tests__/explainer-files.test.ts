/**
 * The video files: H.264 with sound, index first, poster, captions and https
 * sources. Also holds the site's video to the repo's 60 MB limit.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { EXPLAINERS, LAUNCH_FILM } from "../../data/explainers";

const onDisk = (f: string) => join(process.cwd(), "client", "public", f);

function mp4s(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? mp4s(join(dir, e.name)) : e.name.endsWith(".mp4") ? [join(dir, e.name)] : [],
  );
}

describe("explainer files", () => {
  it("there are three, each with a poster, captions and sources over https", () => {
    assert.equal(EXPLAINERS.length, 3);
    for (const e of EXPLAINERS) {
      assert.ok(existsSync(onDisk(e.poster)), e.poster);
      assert.ok(readFileSync(onDisk(e.captions), "utf-8").startsWith("WEBVTT"), e.captions);
      assert.ok(e.sources.length > 0, e.id);
      for (const s of e.sources) assert.ok(s.url.startsWith("https://"), s.url);
    }
  });

  it("every video is H.264 with sound and its index first, so it starts while downloading", () => {
    for (const e of [...EXPLAINERS, LAUNCH_FILM]) {
      const buf = readFileSync(onDisk(e.video));
      assert.ok(buf.includes("avc1"), e.video);
      assert.ok(buf.includes("soun"), e.video);
      assert.ok(buf.indexOf("moov") < buf.indexOf("mdat"), e.video);
    }
  });

  it("the site's video files stay under the repo's 60 MB limit", () => {
    const bytes = mp4s(onDisk("media")).reduce((sum, f) => sum + statSync(f).size, 0);
    assert.ok(bytes <= 60_000_000, `${(bytes / 1_000_000).toFixed(2)} MB of video`);
  });

  it("the film has its poster and captions", () => {
    assert.ok(existsSync(onDisk(LAUNCH_FILM.poster)));
    assert.ok(readFileSync(onDisk(LAUNCH_FILM.captions), "utf-8").startsWith("WEBVTT"));
  });
});
