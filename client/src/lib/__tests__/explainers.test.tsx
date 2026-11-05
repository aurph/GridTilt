/**
 * The explainers page as a reader's browser receives it (no DOM, no network):
 * each video only downloads on play, carries captions and links its sources,
 * and the page is a real, listed address.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router, Route } from "wouter";
import { TooltipProvider } from "../../components/ui/tooltip";
import { EXPLAINERS, WHAT_IS_THE_QUEUE } from "../../data/explainers";
import Explainers from "../../pages/explainers";
import Queue from "../../pages/Queue";
import { buildSitemap, getPageMeta } from "../../../../server/seo";

function render(): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <Router ssrPath="/explainers">
          <Route path="/explainers" component={Explainers} />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const PUBLIC = join(process.cwd(), "client", "public");
const onDisk = (f: string) => join(PUBLIC, f);

describe("explainers page", () => {
  it("offers three videos with a poster and captions, and downloads nothing until play", () => {
    const html = render();
    assert.equal(EXPLAINERS.length, 3);
    assert.equal((html.match(/<video/g) ?? []).length, 3);
    assert.equal((html.match(/preload="none"/g) ?? []).length, 3);
    assert.ok(!/autoplay/i.test(html), "no video starts by itself");
    for (const e of EXPLAINERS) {
      assert.ok(html.includes(`src="${e.video}"`), e.id);
      assert.ok(html.includes(`poster="${e.poster}"`), e.id);
      assert.match(html, new RegExp(`<track[^>]*kind="captions"[^>]*src="${e.captions}"`));
      assert.ok(html.includes(`>${e.title}</h2>`), e.id);
    }
  });

  it("links the sources for each narration over https", () => {
    const html = render();
    for (const e of EXPLAINERS) {
      assert.ok(e.sources.length > 0, e.id);
      for (const s of e.sources) {
        assert.ok(s.url.startsWith("https://"), s.url);
        assert.ok(html.includes(`href="${s.url}"`), s.url);
      }
    }
  });

  it("the queue explainer plays on the Queue tab, with its sources", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <Queue embedded />
        </TooltipProvider>
      </QueryClientProvider>,
    );
    assert.ok(html.includes(`src="${WHAT_IS_THE_QUEUE.video}"`));
    assert.match(html, /preload="none"/);
    for (const s of WHAT_IS_THE_QUEUE.sources) assert.ok(html.includes(`href="${s.url}"`), s.url);
  });

  it("is a real page: it has metadata and is in the sitemap", () => {
    const meta = getPageMeta("/explainers");
    assert.equal(meta.status, undefined);
    assert.equal(meta.canonical, "https://gridtilt.com/explainers");
    assert.ok(buildSitemap({ tickers: [], clusters: [], articles: [] }).includes("<loc>https://gridtilt.com/explainers</loc>"));
  });

  it("every poster and captions file is in client/public", () => {
    for (const e of EXPLAINERS) {
      for (const f of [e.poster, e.captions]) assert.ok(existsSync(onDisk(f)), f);
      assert.ok(readFileSync(onDisk(e.captions), "utf-8").startsWith("WEBVTT"), e.captions);
    }
  });

  it("every video is in client/public as H.264 with sound, fast start", () => {
    for (const e of EXPLAINERS) {
      const buf = readFileSync(onDisk(e.video));
      assert.ok(buf.includes("avc1"), `${e.video}: H.264 plays everywhere`);
      assert.ok(buf.includes("soun"), `${e.video}: has narration`);
      assert.ok(buf.indexOf("moov") < buf.indexOf("mdat"), `${e.video}: index before data, so it starts while downloading`);
    }
  });
});
