/** The Brief's masthead shows on Research with its size and alt text, and its file is web weight. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { TooltipProvider } from "../../components/ui/tooltip";
import { BRIEF_MASTHEAD_SRC } from "../../components/brief-masthead";
import BlogIndex from "../../pages/BlogIndex";

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

  it("shows on Research, with an alt text that says it is an illustration", () => {
    const html = render(<BlogIndex />, "/blog");
    assert.ok(html.includes(`src="${BRIEF_MASTHEAD_SRC}"`));
    assert.match(html, /alt="Illustration: /);
  });
});
