/** The Brief's masthead shows on Subscribe with its alt text, and its file is web weight. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { TooltipProvider } from "../../components/ui/tooltip";
import { BRIEF_MASTHEAD_SRC } from "../../components/brief-masthead";
import Subscribe from "../../pages/Subscribe";
import { getPageMeta } from "../../../../server/seo";

function render(page: React.ReactElement, path: string): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <Router ssrPath={path}>{page}</Router>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("Brief masthead", () => {
  it("its file is in client/public at web weight", () => {
    assert.ok(statSync(join(process.cwd(), "client", "public", BRIEF_MASTHEAD_SRC)).size <= 200_000);
  });

  it("shows on Subscribe, with an alt text that says it is an illustration", () => {
    const html = render(<Subscribe />, "/subscribe");
    assert.ok(html.includes(`src="${BRIEF_MASTHEAD_SRC}"`));
    assert.match(html, /alt="Illustration: /);
  });

  it("Subscribe shares with the masthead, as a JPEG on disk", () => {
    const { ogImage } = getPageMeta("/subscribe");
    assert.ok(ogImage.startsWith("https://gridtilt.com/media/share/"), ogImage);
    const buf = readFileSync(join(process.cwd(), "client", "public", ogImage.replace("https://gridtilt.com", "")));
    assert.equal(buf[0], 0xff);
    assert.ok(buf.length <= 300_000, `${buf.length} bytes`);
  });
});
