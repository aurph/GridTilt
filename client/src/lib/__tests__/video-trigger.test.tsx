/**
 * The video trigger as a page first renders it (no DOM, no network): a button with
 * a title and a length, and no player, so a closed one downloads nothing. Opening,
 * closing and playback are checked in a real browser, not here.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VideoTrigger } from "../../components/video-trigger";
import { WHAT_IS_THE_QUEUE } from "../../data/explainers";

describe("video trigger", () => {
  it("renders a button with the title and length, and no player until opened", () => {
    const html = renderToStaticMarkup(<VideoTrigger video={WHAT_IS_THE_QUEUE} testId="t" />);
    assert.match(html, /<button[^>]*aria-haspopup="dialog"/);
    assert.ok(html.includes(WHAT_IS_THE_QUEUE.title));
    assert.ok(html.includes(WHAT_IS_THE_QUEUE.duration));
    assert.ok(!html.includes("<video"), "no player, so nothing downloads");
    assert.ok(!html.includes("<dialog"));
    assert.ok(!html.includes(WHAT_IS_THE_QUEUE.poster), "not even the poster");
  });

  it("takes other words and a thumbnail when a placement needs them", () => {
    const html = renderToStaticMarkup(<VideoTrigger video={WHAT_IS_THE_QUEUE} label="Watch it" thumb="/x.webp" testId="t" />);
    assert.ok(html.includes("Watch it"));
    assert.match(html, /<img[^>]*src="\/x\.webp"[^>]*width="96"[^>]*height="54"/);
    assert.match(html, /alt=""/, "the button's words already name it");
  });
});
