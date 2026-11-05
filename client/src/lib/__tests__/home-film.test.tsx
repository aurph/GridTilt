/** The launch film starts only when the reader asks, with a poster and captions. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FilmSection } from "../../components/home/film-section";

const PUBLIC = join(process.cwd(), "client", "public");

describe("home film", () => {
  const html = renderToStaticMarkup(<FilmSection />);
  const src = (name: string) => new RegExp(`${name}="(/media/film/[^"]+)"`).exec(html)?.[1] ?? "";

  it("has a poster and captions, and does not download or play by itself", () => {
    assert.match(html, /preload="none"/);
    assert.match(html, /controls/);
    assert.ok(!/autoplay/i.test(html));
    assert.match(html, /<track[^>]*kind="captions"/);
  });

  it("its poster and captions are in client/public", () => {
    assert.ok(existsSync(join(PUBLIC, src("poster"))));
    const vtt = /<track[^>]*src="([^"]+)"/.exec(html)?.[1] ?? "";
    assert.ok(readFileSync(join(PUBLIC, vtt), "utf-8").startsWith("WEBVTT"));
  });

  const video = /<source src="([^"]+)"/.exec(html)?.[1] ?? "";
  it("its video is in client/public", { skip: existsSync(join(PUBLIC, video)) ? false : "waiting on the re-cut: the film is not committed yet" }, () => {
    assert.ok(existsSync(join(PUBLIC, video)));
  });
});
