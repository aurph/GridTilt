// T21: robots.txt opens the read-only data public pages fetch while they
// render, and the share images, and nothing private. The client's own API
// calls are the inventory: a new public read must be added here on purpose.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { robotsAllows, robotsTxt } from "../seo";

function clientSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "__tests__") out.push(...clientSources(p));
    } else if (/\.(ts|tsx)$/.test(name)) out.push(readFileSync(p, "utf-8"));
  }
  return out;
}

// Calls only signed-in or admin screens make, or that write (POST).
const NOT_PUBLIC_READS = [/^\/api\/admin\//, /^\/api\/subscribe$/, /^\/api\/social\//, /^\/api\/portfolio-score$/];

describe("robots.txt", () => {
  it("lets crawlers fetch every read-only endpoint the public pages call", () => {
    const paths = new Set<string>();
    for (const src of clientSources(join(process.cwd(), "client", "src"))) {
      for (const m of src.matchAll(/["'`](\/api\/[a-zA-Z0-9/_-]+)/g)) paths.add(m[1].replace(/\/$/, ""));
    }
    const publicReads = Array.from(paths).filter((p) => !NOT_PUBLIC_READS.some((r) => r.test(p)));
    assert.ok(publicReads.length > 15, "the inventory found the client's calls");
    for (const p of publicReads) assert.ok(robotsAllows(p), `${p} is fetched by a public page but blocked`);
    assert.ok(robotsAllows("/api/og?page=home"), "share images");
  });

  it("keeps private, writing and admin routes disallowed", () => {
    for (const p of [
      "/api/admin/subscribers",
      "/api/newsletter/preview",
      "/api/newsletter/send",
      "/api/subscribe",
      "/api/unsubscribe?token=x",
      "/api/webhooks/resend",
      "/api/export/daily",
      "/api/kpis",
      "/api/social/generate",
      "/api/portfolio-score",
      "/admin/datacenters",
    ]) {
      assert.equal(robotsAllows(p), false, p);
    }
    assert.ok(robotsAllows("/my-grid?state=MD"));
  });

  it("applies the longest matching rule, as Google does", () => {
    const txt = "User-agent: *\nAllow: /\nDisallow: /api/\nAllow: /api/news\nDisallow: /api/newsletter/\n";
    assert.equal(robotsAllows("/api/news", txt), true);
    assert.equal(robotsAllows("/api/newsletter/send", txt), false);
    assert.equal(robotsAllows("/api/other", txt), false);
    assert.ok(robotsTxt().includes("Sitemap: https://gridtilt.com/sitemap.xml"));
  });
});
