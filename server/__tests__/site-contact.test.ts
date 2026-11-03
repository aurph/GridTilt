import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { buildSitemap, getPageMeta } from "../seo";

// The privacy page reads its contact and mailing address from this route,
// which prints the same values the email footer does. Nothing else leaks.
process.env.UNSUB_TOKEN_SECRET ||= "test-secret-for-site-contact";
process.env.ADMIN_API_KEY ||= "test-admin-key";
process.env.NODE_ENV = "test";

async function serve() {
  const { registerRoutes } = await import("../routes");
  const app = express();
  const server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((r) => server.close(() => r())) };
}

test("/api/site/contact is public and carries exactly the footer's contact fields", async () => {
  const postalBefore = process.env.NEWSLETTER_POSTAL_ADDRESS;
  const contactBefore = process.env.NEWSLETTER_CONTACT_EMAIL;
  delete process.env.NEWSLETTER_POSTAL_ADDRESS;
  delete process.env.NEWSLETTER_CONTACT_EMAIL;
  const s = await serve();
  try {
    let res = await fetch(`${s.url}/api/site/contact`);
    assert.equal(res.status, 200);
    let body = (await res.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ["contactEmail", "postalAddress"]);
    assert.match(String(body.contactEmail), /@/);
    assert.equal(body.postalAddress, null, "no address is invented when none is approved");

    process.env.NEWSLETTER_POSTAL_ADDRESS = "1 Example St, Baltimore, MD 21201";
    process.env.NEWSLETTER_CONTACT_EMAIL = "privacy@example.test";
    res = await fetch(`${s.url}/api/site/contact`);
    body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.postalAddress, "1 Example St, Baltimore, MD 21201");
    assert.equal(body.contactEmail, "privacy@example.test");
  } finally {
    await s.close();
    if (postalBefore === undefined) delete process.env.NEWSLETTER_POSTAL_ADDRESS;
    else process.env.NEWSLETTER_POSTAL_ADDRESS = postalBefore;
    if (contactBefore === undefined) delete process.env.NEWSLETTER_CONTACT_EMAIL;
    else process.env.NEWSLETTER_CONTACT_EMAIL = contactBefore;
  }
});

test("/privacy is a real page: it has metadata and is in the sitemap", () => {
  const meta = getPageMeta("/privacy");
  assert.equal(meta.robots ?? "", "", "indexable");
  assert.match(meta!.title, /Privacy/);
  const xml = buildSitemap({ tickers: [], clusters: [], articles: [] });
  assert.ok(xml.includes("<loc>https://gridtilt.com/privacy</loc>"), "sitemap lists /privacy");
});
