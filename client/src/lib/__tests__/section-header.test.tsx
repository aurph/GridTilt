/**
 * The section header stays one tight, left-aligned line above the chips, and
 * a feature whose chip already names it shows no second title row, so the
 * content (the map first of all) starts near the top of the screen. Jack,
 * 2026-11-18: "the top margin for this page is far too huge".
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import GridLive from "../../pages/grid-live";
import { SectionStatement } from "../../pages/section-page";

const CLIENT = join(process.cwd(), "client", "src");

function render(node: React.ReactNode, path = "/"): string {
  const qc = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <Router ssrPath={path}>{node}</Router>
    </QueryClientProvider>,
  );
}

describe("the section header", () => {
  it("is one left-aligned line, not a centered hero", () => {
    const html = render(<SectionStatement statement="A statement." dek="A dek." />);
    assert.match(html, /<h1[^>]*>A statement\.<\/h1>/);
    assert.ok(html.includes("A dek."));
    const wrapper = /<div class="([^"]+)" data-testid="section-statement">/.exec(html);
    assert.ok(wrapper, "the statement wrapper renders");
    const classes = wrapper[1].split(/\s+/);
    assert.ok(!classes.includes("text-center"), "not centered");
    assert.ok(!classes.some((c) => /^(sm:)?mx-auto$/.test(c)), "sits on the chips' left edge");
    // Top padding of 16px or less at every width (Tailwind's pt-4 is 16px).
    const tops = classes.filter((c) => /^(sm:|md:|lg:)?pt-/.test(c)).map((c) => Number(c.split("pt-")[1]));
    assert.ok(tops.length > 0 && tops.every((n) => n <= 4), `top padding stays tight, got ${tops.join(", ")}`);
  });
});

describe("a feature under a chip", () => {
  it("Live grid keeps its heading for the outline but shows no title row repeating the chip", () => {
    const html = render(<GridLive />, "/grid");
    assert.match(html, /<h1 class="sr-only"[^>]*>Live grid<\/h1>/);
    assert.ok(!/<div class="border-b[^"]*"[^>]*data-testid="grid-live-header"/.test(html), "no title strip");
  });

  it("the map keeps its heading for the outline only, so the map starts under the chip row", () => {
    const src = readFileSync(join(CLIENT, "pages", "PowerMap.tsx"), "utf-8");
    assert.match(src, /<SectionHeading className="sr-only" testId="power-header">\s*US data center map\s*<\/SectionHeading>/);
  });
});
