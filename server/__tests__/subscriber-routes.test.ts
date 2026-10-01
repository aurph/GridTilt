// T17's routes over real HTTP: a success means the write reached storage,
// a missing or failing store answers 503 (never a success page), an opt-out
// is idempotent and remembered, and admin deletion leaves a suppression.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { newDb } from "pg-mem";
import { postgresStore, type PoolLike, type SubscriberStore } from "../subscriber-store";
import { registerSubscriberRoutes, SIGNUPS_UNAVAILABLE, SUPPRESSED_MESSAGE } from "../subscriber-routes";

function memStore(): SubscriberStore {
  const db = newDb({ noAstCoverageCheck: true });
  const { Pool } = db.adapters.createPg();
  return postgresStore(new Pool() as unknown as PoolLike);
}

function brokenStore(): SubscriberStore {
  const fail = async () => {
    throw new Error("connection refused");
  };
  return postgresStore({ query: fail, connect: fail, end: async () => {} } as unknown as PoolLike);
}

const ADMIN = "test-admin";
const token = (email: string) => `t-${email}`;

async function serve(store: SubscriberStore | null, afterSubscribe?: (email: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  const logged: string[] = [];
  registerSubscriberRoutes(app, {
    store,
    tokenMatches: (email, t) => token(email) === t,
    requireAdmin: (req: Request, res: Response) => {
      if (req.headers["x-admin-key"] === ADMIN) return true;
      res.status(401).json({ error: "Unauthorized" });
      return false;
    },
    afterSubscribe,
    logError: (m, d) => logged.push(`${m} ${d}`),
  });
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url,
    logged,
    close: () => new Promise<void>((r) => server.close(() => r())),
    signup: (body: unknown) =>
      fetch(`${url}/api/subscribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    unsubscribe: (t?: string) => fetch(`${url}/api/unsubscribe${t === undefined ? "" : `?token=${encodeURIComponent(t)}`}`),
  };
}

describe("subscriber routes", () => {
  it("signup, repeat, opt-out twice, then a re-signup that the form does not reactivate", async () => {
    const s = await serve(memStore());
    try {
      let r = await s.signup({ email: "Reader@Example.com " });
      assert.equal(r.status, 200);
      assert.equal(((await r.json()) as { status: string }).status, "subscribed");

      r = await s.signup({ email: "reader@example.com" });
      assert.equal(((await r.json()) as { status: string }).status, "exists");

      r = await s.unsubscribe(token("reader@example.com"));
      assert.equal(r.status, 200);
      assert.match(await r.text(), /<h2>Unsubscribed<\/h2>/);

      r = await s.unsubscribe(token("reader@example.com"));
      assert.equal(r.status, 200, "an existing signed link keeps working");
      assert.match(await r.text(), /<h2>Unsubscribed<\/h2>/);

      r = await s.signup({ email: "reader@example.com" });
      const body = (await r.json()) as { status: string; message: string };
      assert.equal(body.status, "suppressed");
      assert.equal(body.message, SUPPRESSED_MESSAGE);
    } finally {
      await s.close();
    }
  });

  it("rejects bad input and unknown links without a success page", async () => {
    const s = await serve(memStore());
    try {
      assert.equal((await s.signup({})).status, 400);
      assert.equal((await s.signup({ email: 42 })).status, 400);
      assert.equal((await s.signup({ email: "not-an-email" })).status, 400);
      assert.equal((await s.unsubscribe()).status, 400);
      const r = await s.unsubscribe("t-nobody@example.com");
      assert.equal(r.status, 404);
      assert.doesNotMatch(await r.text(), /<h2>Unsubscribed<\/h2>/);
    } finally {
      await s.close();
    }
  });

  it("with no storage configured, signups and opt-outs answer 503 with a retry hint", async () => {
    const s = await serve(null);
    try {
      let r = await s.signup({ email: "a@example.com" });
      assert.equal(r.status, 503);
      assert.ok(r.headers.get("retry-after"));
      assert.deepEqual(await r.json(), { error: SIGNUPS_UNAVAILABLE, status: "unavailable" });
      r = await s.unsubscribe(token("a@example.com"));
      assert.equal(r.status, 503);
      assert.doesNotMatch(await r.text(), /<h2>Unsubscribed<\/h2>/);
      r = await fetch(`${s.url}/api/admin/subscribers`, { headers: { "x-admin-key": ADMIN } });
      assert.equal(r.status, 503);
    } finally {
      await s.close();
    }
  });

  it("a database failure is a 503, never a false success, and the log carries the reason", async () => {
    const s = await serve(brokenStore());
    try {
      let r = await s.signup({ email: "a@example.com" });
      assert.equal(r.status, 503);
      assert.equal(((await r.json()) as { status: string }).status, "unavailable");
      r = await s.unsubscribe(token("a@example.com"));
      assert.equal(r.status, 503);
      assert.doesNotMatch(await r.text(), /<h2>Unsubscribed<\/h2>/);
      assert.ok(s.logged.some((l) => l.includes("connection refused")));
    } finally {
      await s.close();
    }
  });

  it("syncs the provider only for a new signup, and a sync failure does not change the answer", async () => {
    const synced: string[] = [];
    const s = await serve(memStore(), async (email) => {
      synced.push(email);
      throw new Error("provider down");
    });
    try {
      const r = await s.signup({ email: "new@example.com" });
      assert.equal(((await r.json()) as { status: string }).status, "subscribed");
      await s.signup({ email: "new@example.com" });
      await s.unsubscribe(token("new@example.com"));
      await s.signup({ email: "new@example.com" });
      assert.deepEqual(synced, ["new@example.com"]);
      assert.ok(s.logged.some((l) => l.includes("provider down")));
    } finally {
      await s.close();
    }
  });

  it("admin list needs the key; admin deletion leaves a marker the form honors", async () => {
    const s = await serve(memStore());
    try {
      await s.signup({ email: "x@example.com" });
      assert.equal((await fetch(`${s.url}/api/admin/subscribers`)).status, 401);
      let r = await fetch(`${s.url}/api/admin/subscribers`, { headers: { "x-admin-key": ADMIN } });
      const list = (await r.json()) as { count: number; byState: Record<string, number> };
      assert.deepEqual({ count: list.count, byState: list.byState }, { count: 1, byState: { active: 1 } });

      r = await fetch(`${s.url}/api/admin/subscribers/${encodeURIComponent("X@example.com")}`, {
        method: "DELETE",
        headers: { "x-admin-key": ADMIN },
      });
      assert.deepEqual(await r.json(), { message: "Removed", found: true });
      r = await s.signup({ email: "x@example.com" });
      assert.equal(((await r.json()) as { status: string }).status, "suppressed");

      r = await fetch(`${s.url}/api/admin/subscribers/not-an-address`, { method: "DELETE", headers: { "x-admin-key": ADMIN } });
      assert.equal(r.status, 400);
    } finally {
      await s.close();
    }
  });
});
