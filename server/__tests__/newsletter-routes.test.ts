// The newsletter's HTTP surface: prepare, inspect, send only with a typed
// confirmation, the retired one-shot route, and verified provider webhooks.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createHmac } from "node:crypto";
import { newDb } from "pg-mem";
import { postgresStore, type PoolLike } from "../subscriber-store";
import { registerNewsletterRoutes, type RenderedIssue } from "../newsletter-routes";
import type { OutgoingEmail, SendOutcome } from "../resend";

const ADMIN = "admin-key";
const KEY = Buffer.from("route-test-signing-key-0123456789");
const SECRET = `whsec_${KEY.toString("base64")}`;

function rendered(over: Partial<RenderedIssue> = {}): RenderedIssue {
  return {
    subject: "The GridTilt Weekly",
    html: '<a href="https://gridtilt.com/api/unsubscribe?token=PREVIEW">u</a> on SIGNED_UP_PREVIEW',
    text: "Unsubscribe: https://gridtilt.com/api/unsubscribe?token=PREVIEW on SIGNED_UP_PREVIEW",
    blockers: [],
    suggestedIssueId: "weekly-2026-10-05",
    ...over,
  };
}

async function serve(opts: { pool?: boolean; render?: () => RenderedIssue; blockers?: string[]; secret?: string | undefined } = {}) {
  const db = newDb({ noAstCoverageCheck: true });
  const { Pool } = db.adapters.createPg();
  const pool = new Pool() as unknown as PoolLike;
  const store = postgresStore(pool);
  await store.subscribe("a@example.com", {}, new Date("2026-05-01T12:00:00.000Z"));
  const sent: OutgoingEmail[] = [];
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody: Buffer }).rawBody = buf;
      },
    }),
  );
  registerNewsletterRoutes(app, {
    pool: opts.pool === false ? null : pool,
    store: opts.pool === false ? null : store,
    requireAdmin: (req: Request, res: Response) => {
      if (req.headers["x-admin-key"] === ADMIN) return true;
      res.status(401).json({ error: "Unauthorized" });
      return false;
    },
    renderCurrent: opts.render ?? (() => rendered()),
    sendBlockers: () => opts.blockers ?? [],
    sendDeps: () => ({
      pool,
      store,
      send: async (email: OutgoingEmail): Promise<SendOutcome> => {
        sent.push(email);
        return { kind: "accepted", providerId: `em_${sent.length}` };
      },
      tokenFor: (e: string) => `tok-${e}`,
      config: { from: "GridTilt <brief@news.gridtilt.com>", siteUrl: "https://gridtilt.com" },
      sleep: async () => {},
    }),
    webhookSecret: () => ("secret" in opts ? opts.secret : SECRET),
    logError: () => {},
  });
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const admin = (path: string, init: RequestInit = {}) =>
    fetch(`${url}${path}`, { ...init, headers: { "Content-Type": "application/json", "x-admin-key": ADMIN, ...(init.headers ?? {}) } });
  return { url, store, sent, admin, close: () => new Promise<void>((r) => server.close(() => r())) };
}

function signed(body: string, id = "msg_1", ts = Math.floor(Date.now() / 1000)) {
  const sig = createHmac("sha256", KEY).update(`${id}.${ts}.${body}`).digest("base64");
  return { "svix-id": id, "svix-timestamp": String(ts), "svix-signature": `v1,${sig}`, "Content-Type": "application/json" };
}

describe("newsletter routes", () => {
  it("prepares, previews and sends only with the typed confirmation", async () => {
    const s = await serve();
    try {
      let r = await s.admin("/api/admin/newsletter/issues", { method: "POST", body: "{}" });
      assert.equal(r.status, 201);
      const prepared = (await r.json()) as { issueId: string; revision: number; blockers: string[]; recipientsNow: number };
      assert.deepEqual({ ...prepared, contentSha256: undefined }, { issueId: "weekly-2026-10-05", revision: 1, blockers: [], recipientsNow: 1, contentSha256: undefined });

      r = await s.admin("/api/admin/newsletter/issues/weekly-2026-10-05/1/preview?format=text");
      assert.match(await r.text(), /token=PREVIEW/);

      r = await s.admin("/api/admin/newsletter/issues/weekly-2026-10-05/1/send", { method: "POST", body: "{}" });
      assert.equal(r.status, 400);
      r = await s.admin("/api/admin/newsletter/issues/weekly-2026-10-05/1/send", { method: "POST", body: JSON.stringify({ confirm: "weekly-2026-10-05/2" }) });
      assert.equal(r.status, 400);
      assert.equal(s.sent.length, 0);

      r = await s.admin("/api/admin/newsletter/issues/weekly-2026-10-05/1/send", { method: "POST", body: JSON.stringify({ confirm: "weekly-2026-10-05/1" }) });
      assert.equal(r.status, 200);
      assert.deepEqual(((await r.json()) as { counts: Record<string, number> }).counts, { accepted: 1 });
      assert.equal(s.sent.length, 1);

      r = await s.admin("/api/admin/newsletter/issues/weekly-2026-10-05/1");
      assert.deepEqual(((await r.json()) as { counts: Record<string, number> }).counts, { accepted: 1 });

      // Preparing the same issue again is a correction and needs a reason.
      r = await s.admin("/api/admin/newsletter/issues", { method: "POST", body: "{}" });
      assert.equal(r.status, 400);
    } finally {
      await s.close();
    }
  });

  it("a test copy goes to one current subscriber, marked [Test], and is not a delivery of the issue", async () => {
    const s = await serve();
    try {
      await s.admin("/api/admin/newsletter/issues", { method: "POST", body: "{}" });
      const path = "/api/admin/newsletter/issues/weekly-2026-10-05/1/test";
      let r = await s.admin(path, { method: "POST", body: JSON.stringify({ to: "a@example.com" }) });
      assert.equal(r.status, 400, "needs the typed confirmation");
      r = await s.admin(path, { method: "POST", body: JSON.stringify({ to: "stranger@example.com", confirm: "test:stranger@example.com" }) });
      assert.equal(r.status, 409, "only a subscribed address, so its unsubscribe link is real");
      assert.equal(s.sent.length, 0);

      r = await s.admin(path, { method: "POST", body: JSON.stringify({ to: "a@example.com", confirm: "test:a@example.com" }) });
      assert.equal(r.status, 200);
      assert.equal(s.sent.length, 1);
      assert.equal(s.sent[0].subject, "[Test] The GridTilt Weekly");
      assert.ok(s.sent[0].html.includes("token=tok-a%40example.com"));
      r = await s.admin("/api/admin/newsletter/issues/weekly-2026-10-05/1");
      assert.deepEqual(((await r.json()) as { counts: Record<string, number> }).counts, {}, "no delivery rows");
    } finally {
      await s.close();
    }
  });

  it("a render failure stores nothing", async () => {
    const s = await serve({
      render: () => {
        throw new Error("brief data missing");
      },
    });
    try {
      const r = await s.admin("/api/admin/newsletter/issues", { method: "POST", body: "{}" });
      assert.equal(r.status, 500);
      assert.equal((await s.admin("/api/admin/newsletter/issues/weekly-2026-10-05/1")).status, 404);
    } finally {
      await s.close();
    }
  });

  it("missing configuration or a blocked footer stops the send with the reasons", async () => {
    const s = await serve({ blockers: ["RESEND_API_KEY is not set"] });
    try {
      await s.admin("/api/admin/newsletter/issues", { method: "POST", body: "{}" });
      const r = await s.admin("/api/admin/newsletter/issues/weekly-2026-10-05/1/send", {
        method: "POST",
        body: JSON.stringify({ confirm: "weekly-2026-10-05/1" }),
      });
      assert.equal(r.status, 409);
      assert.deepEqual(await r.json(), { status: "blocked", blockers: ["RESEND_API_KEY is not set"] });
      assert.equal(s.sent.length, 0);
    } finally {
      await s.close();
    }
    const b = await serve({ render: () => rendered({ blockers: ["no approved mailing address (NEWSLETTER_POSTAL_ADDRESS)"] }) });
    try {
      const p = (await (await b.admin("/api/admin/newsletter/issues", { method: "POST", body: "{}" })).json()) as { blockers: string[] };
      assert.deepEqual(p.blockers, ["no approved mailing address (NEWSLETTER_POSTAL_ADDRESS)"]);
      const r = await b.admin("/api/admin/newsletter/issues/weekly-2026-10-05/1/send", {
        method: "POST",
        body: JSON.stringify({ confirm: "weekly-2026-10-05/1" }),
      });
      assert.equal(r.status, 409);
      assert.equal(b.sent.length, 0);
    } finally {
      await b.close();
    }
  });

  it("the one-shot send route is retired, and admin routes need the key and a ledger", async () => {
    const s = await serve();
    try {
      assert.equal((await fetch(`${s.url}/api/newsletter/send`, { method: "POST" })).status, 401);
      assert.equal((await s.admin("/api/newsletter/send", { method: "POST", body: "{}" })).status, 410);
      assert.equal((await fetch(`${s.url}/api/admin/newsletter/issues`, { method: "POST" })).status, 401);
    } finally {
      await s.close();
    }
    const n = await serve({ pool: false });
    try {
      assert.equal((await n.admin("/api/admin/newsletter/issues", { method: "POST", body: "{}" })).status, 503);
    } finally {
      await n.close();
    }
  });

  it("webhooks: verified, applied once, and a bounce suppresses the address", async () => {
    const s = await serve();
    try {
      const body = JSON.stringify({ type: "email.bounced", data: { email_id: "em_9", to: ["a@example.com"], bounce: { type: "Permanent", subType: "General" } } });
      let r = await fetch(`${s.url}/api/webhooks/resend`, { method: "POST", headers: { ...signed(body), "svix-signature": "v1,AAAA" }, body });
      assert.equal(r.status, 401);
      assert.equal(await s.store.isSendable("a@example.com"), true, "nothing applied from an unverified call");

      r = await fetch(`${s.url}/api/webhooks/resend`, { method: "POST", headers: signed(body), body });
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), { received: true, duplicate: false });
      assert.equal(await s.store.isSendable("a@example.com"), false);

      r = await fetch(`${s.url}/api/webhooks/resend`, { method: "POST", headers: signed(body), body });
      assert.deepEqual(await r.json(), { received: true, duplicate: true });
    } finally {
      await s.close();
    }
    const n = await serve({ secret: undefined });
    try {
      const r = await fetch(`${n.url}/api/webhooks/resend`, { method: "POST", headers: signed("{}"), body: "{}" });
      assert.equal(r.status, 503);
    } finally {
      await n.close();
    }
  });
});
