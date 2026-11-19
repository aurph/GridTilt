/**
 * The video trigger as a page first renders it (no DOM, no network): a button with
 * a title and a length, and no player, so a closed one downloads nothing. Opening,
 * closing and playback are checked in a real browser, not here.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { TooltipProvider } from "../../components/ui/tooltip";
import { Hero } from "../../components/home/Hero";
import { HomeFilm } from "../../components/home/home-film";
import { VideoTrigger } from "../../components/video-trigger";
import { EXPLAINERS, LAUNCH_FILM, WHAT_IS_THE_QUEUE } from "../../data/explainers";
import BlogIndex from "../../pages/BlogIndex";
import Home from "../../pages/Home";
import Queue from "../../pages/Queue";

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

  it("the Queue tab carries its explainer as a trigger, with no player on the page", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <Queue embedded />
        </TooltipProvider>
      </QueryClientProvider>,
    );
    assert.ok(html.includes(WHAT_IS_THE_QUEUE.title));
    assert.ok(!html.includes("<video"));
  });

  it("Research offers the three explainers with small thumbnails and no player", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <Router ssrPath="/blog">
            <BlogIndex />
          </Router>
        </TooltipProvider>
      </QueryClientProvider>,
    );
    assert.ok(!html.includes("<video"));
    for (const e of EXPLAINERS) {
      assert.ok(html.includes(e.title), e.id);
      assert.ok(e.thumb && html.includes(`src="${e.thumb}"`), e.id);
      assert.ok(statSync(join(process.cwd(), "client", "public", e.thumb!)).size <= 20_000, `${e.id}: a thumbnail, not a poster`);
    }
  });

  it("takes a large still when a section of its own features the video", () => {
    const html = renderToStaticMarkup(<VideoTrigger video={WHAT_IS_THE_QUEUE} label="Play the video" still="/y.webp" testId="t" />);
    assert.match(html, /<img[^>]*src="\/y\.webp"/);
    assert.match(html, /<img[^>]*loading="lazy"/, "below the fold, so it loads only when the reader gets there");
    assert.match(html, /<img[^>]*alt=""/, "the button's words already name it");
    assert.ok(html.includes("Play the video"));
    assert.ok(html.includes(WHAT_IS_THE_QUEUE.duration));
    assert.ok(!html.includes("<video"));
  });

  it("Home's hero carries no video link", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <Router ssrPath="/">
          <Hero />
        </Router>
      </QueryClientProvider>,
    );
    assert.ok(!html.includes("hero-film"));
    assert.doesNotMatch(html.replace(/<[^>]+>/g, " "), /\bfilm\b/i);
    assert.ok(!html.includes("<video"));
  });

  it("Home closes with the video: a still, plain words, and no player until it is opened", () => {
    const html = renderToStaticMarkup(<HomeFilm />);
    assert.match(html, /data-testid="home-film"/);
    assert.match(html, /<h2[^>]*>Why GridTilt exists<\/h2>/);
    assert.match(html, /<button[^>]*data-testid="home-film-trigger"/);
    assert.match(html, /<button[^>]*aria-haspopup="dialog"/);
    assert.ok(LAUNCH_FILM.still, "the video has a still");
    assert.ok(html.includes(`src="${LAUNCH_FILM.still}"`));
    assert.ok(html.includes("Play the video"));
    assert.ok(html.includes(LAUNCH_FILM.duration));
    assert.ok(!html.includes("<video"), "no player, so the video itself does not download");
    assert.ok(!html.includes(LAUNCH_FILM.poster), "the full-size poster stays out of the page");
    assert.doesNotMatch(html.replace(/<[^>]+>/g, " "), /\bfilm\b/i, "the page does not call it a film");
  });

  it("the home page puts the video last, under the chart", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <Router ssrPath="/">
            <Home />
          </Router>
        </TooltipProvider>
      </QueryClientProvider>,
    );
    const hero = html.indexOf('data-testid="home-hero"');
    const chart = html.indexOf('data-testid="home-demand-chart"');
    const film = html.indexOf('data-testid="home-film"');
    assert.ok(hero >= 0 && chart > hero, "hero, then the chart");
    assert.ok(film > chart, "then the video");
    assert.equal((html.match(/aria-haspopup="dialog"/g) ?? []).length, 1, "one way into the video on the page");
  });
});
