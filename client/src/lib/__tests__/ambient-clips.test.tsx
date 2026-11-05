/**
 * The silent clips: poster first, no autoplay attribute, no sound track in the
 * file, light enough to play on a phone. Also holds the site's video files to the
 * repo's 60 MB limit.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GridGearBand } from "../../components/home/grid-gear-band";

const PUBLIC = join(process.cwd(), "client", "public");

function mp4s(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? mp4s(join(dir, e.name)) : e.name.endsWith(".mp4") ? [join(dir, e.name)] : [],
  );
}

describe("ambient clips", () => {
  const html = renderToStaticMarkup(<GridGearBand />);
  const video = /<source src="([^"]+)"/.exec(html)?.[1] ?? "";
  const poster = /poster="([^"]+)"/.exec(html)?.[1] ?? "";

  it("shows a poster and downloads nothing until it plays", () => {
    assert.match(html, /preload="none"/);
    assert.ok(!/autoplay/i.test(html), "playback is started by code that checks reduced motion and visibility");
    assert.ok(!/controls/.test(html.split("<button")[0]), "a decorative clip has no player chrome");
    assert.ok(statSync(join(PUBLIC, poster)).size <= 200_000, poster);
  });

  it("the file has no sound track and is light", () => {
    const buf = readFileSync(join(PUBLIC, video));
    assert.ok(buf.length <= 3_000_000, `${video} is ${buf.length} bytes`);
    assert.equal(buf.indexOf("soun"), -1, "no audio track");
  });

  it("the site's video files stay under the repo's 60 MB limit", () => {
    const bytes = mp4s(join(PUBLIC, "media")).reduce((sum, f) => sum + statSync(f).size, 0);
    assert.ok(bytes <= 60_000_000, `${(bytes / 1_000_000).toFixed(2)} MB of video`);
  });
});
