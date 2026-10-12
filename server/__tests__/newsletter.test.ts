// T18's failure cases on pg-mem with a fake provider that behaves like
// Resend's documented idempotency: the same key and payload answer with the
// original id and send nothing new; a timeout can hide an accepted send.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { newDb } from "pg-mem";
import { postgresStore, type PoolLike } from "../subscriber-store";
import { dumpSubscribers, restoreSubscribers } from "../subscriber-backup";
import { createIssue, issueStats } from "../newsletter-ledger";
import { sendIssue, type SendDeps } from "../newsletter-send";
import { applyResendEvent } from "../newsletter-events";
import type { OutgoingEmail, SendOutcome } from "../resend";

function freshPool(): PoolLike {
  const db = newDb({ noAstCoverageCheck: true });
  const { Pool } = db.adapters.createPg();
  return new Pool() as unknown as PoolLike;
}

type Mode = "ok" | "timeout-after-accept" | "timeout-before-accept" | "500" | "422";

function fakeProvider() {
  const byKey = new Map<string, { id: string; payload: string }>();
  const sent: OutgoingEmail[] = [];
  let calls = 0;
  let mode: (email: OutgoingEmail, call: number) => Mode = () => "ok";
  const send = async (email: OutgoingEmail, key: string): Promise<SendOutcome> => {
    const call = calls++;
    const payload = JSON.stringify(email);
    const prior = byKey.get(key);
    if (prior) {
      if (prior.payload !== payload) return { kind: "rejected", detail: "HTTP 409 invalid_idempotent_request" };
      return { kind: "accepted", providerId: prior.id };
    }
    const m = mode(email, call);
    if (m === "500") return { kind: "retryable", detail: "HTTP 500" };
    if (m === "422") return { kind: "rejected", detail: "HTTP 422 validation_error" };
    if (m === "timeout-before-accept") return { kind: "ambiguous", detail: "no response: TimeoutError" };
    const id = `em_${byKey.size + 1}`;
    byKey.set(key, { id, payload });
    sent.push(email);
    if (m === "timeout-after-accept") return { kind: "ambiguous", detail: "no response: TimeoutError" };
    return { kind: "accepted", providerId: id };
  };
  return {
    send,
    sent,
    setMode: (f: (email: OutgoingEmail, call: number) => Mode) => {
      mode = f;
    },
  };
}

const HTML = '<p>Hi</p><a href="https://gridtilt.com/api/unsubscribe?token=PREVIEW">Unsubscribe</a> signed up on SIGNED_UP_PREVIEW';
const TEXT = "Hi. Unsubscribe: https://gridtilt.com/api/unsubscribe?token=PREVIEW. Signed up on SIGNED_UP_PREVIEW.";

async function setup(addresses = ["a@example.com", "b@example.com", "c@example.com"]) {
  const pool = freshPool();
  const store = postgresStore(pool);
  for (const e of addresses) await store.subscribe(e, {}, new Date("2026-05-01T12:00:00.000Z"));
  const provider = fakeProvider();
  let clock = new Date("2026-10-05T14:00:00.000Z");
  const sleeps: number[] = [];
  const deps = (): SendDeps => ({
    pool,
    store,
    send: provider.send,
    tokenFor: (e) => `tok-${e}`,
    config: { from: "GridTilt <brief@news.gridtilt.com>", siteUrl: "https://gridtilt.com" },
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  const issue = await createIssue(pool, { issueId: "weekly-2026-10-05", subject: "The GridTilt Weekly", html: HTML, text: TEXT, blockers: [] });
  return {
    pool,
    store,
    provider,
    deps,
    issue,
    sleeps,
    advance: (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    },
  };
}

describe("sending an issue", () => {
  it("sends each recipient once, personalized, with one-click unsubscribe headers; a rerun sends nothing", async () => {
    const t = await setup();
    const r = await sendIssue(t.deps(), "weekly-2026-10-05", 1);
    assert.equal(r.status, "done");
    assert.deepEqual(r.status === "done" && r.counts, { accepted: 3 });
    assert.equal(t.provider.sent.length, 3);
    const toA = t.provider.sent.find((m) => m.to === "a@example.com")!;
    assert.ok(toA.html.includes("token=tok-a%40example.com"));
    assert.ok(toA.html.includes("signed up on May 1, 2026"));
    assert.ok(toA.text.includes("Signed up on May 1, 2026."));
    assert.equal(toA.headers?.["List-Unsubscribe"], "<https://gridtilt.com/api/unsubscribe?token=tok-a%40example.com>");
    assert.equal(toA.headers?.["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");

    const again = await sendIssue(t.deps(), "weekly-2026-10-05", 1);
    assert.equal(again.status === "done" && again.attempted, 0);
    assert.equal(t.provider.sent.length, 3);
  });

  it("two runs at once: one sends, the other is told a run is in progress", async () => {
    const t = await setup();
    const [x, y] = await Promise.all([sendIssue(t.deps(), "weekly-2026-10-05", 1), sendIssue(t.deps(), "weekly-2026-10-05", 1)]);
    assert.deepEqual([x.status, y.status].sort(), ["busy", "done"]);
    assert.equal(t.provider.sent.length, 3);
  });

  it("a timeout after the provider accepted: the next run reuses the key and gets the original id, no second email", async () => {
    const t = await setup();
    t.provider.setMode((_e, call) => (call === 1 ? "timeout-after-accept" : "ok"));
    const first = await sendIssue(t.deps(), "weekly-2026-10-05", 1);
    assert.deepEqual(first.status === "done" && first.counts, { accepted: 2, unknown: 1 });
    assert.equal(t.provider.sent.length, 3, "the provider did send it");

    // A restart: new deps, same database.
    t.advance(60_000);
    const second = await sendIssue(t.deps(), "weekly-2026-10-05", 1);
    assert.equal(second.status === "done" && second.attempted, 1);
    assert.deepEqual(second.status === "done" && second.counts, { accepted: 3 });
    assert.equal(t.provider.sent.length, 3, "no duplicate");
  });

  it("an ambiguous row older than the provider's window is left for review, not resent", async () => {
    const t = await setup(["a@example.com"]);
    t.provider.setMode(() => "timeout-before-accept");
    await sendIssue(t.deps(), "weekly-2026-10-05", 1);
    t.provider.setMode(() => "ok");
    t.advance(25 * 60 * 60 * 1000);
    const later = await sendIssue(t.deps(), "weekly-2026-10-05", 1);
    assert.equal(later.status === "done" && later.attempted, 0);
    assert.deepEqual(later.status === "done" && later.counts, { unknown: 1 });
    assert.equal(t.provider.sent.length, 0);
  });

  it("a provider error leaves the row queued, and the rerun sends only that one", async () => {
    const t = await setup();
    t.provider.setMode((e, call) => (call === 0 ? "500" : "ok"));
    const first = await sendIssue(t.deps(), "weekly-2026-10-05", 1);
    assert.deepEqual(first.status === "done" && first.counts, { accepted: 2, queued: 1 });
    const second = await sendIssue(t.deps(), "weekly-2026-10-05", 1);
    assert.equal(second.status === "done" && second.attempted, 1);
    assert.deepEqual(second.status === "done" && second.counts, { accepted: 3 });
    assert.equal(t.provider.sent.length, 3);
  });

  it("a rejected email is failed and not retried", async () => {
    const t = await setup(["a@example.com"]);
    t.provider.setMode(() => "422");
    await sendIssue(t.deps(), "weekly-2026-10-05", 1);
    const again = await sendIssue(t.deps(), "weekly-2026-10-05", 1);
    assert.equal(again.status === "done" && again.attempted, 0);
    assert.deepEqual(await issueStats(t.pool, "weekly-2026-10-05", 1), { failed: 1 });
  });

  it("an opt-out between queueing and its turn wins", async () => {
    const t = await setup();
    t.provider.setMode((email, call) => {
      if (call === 0) {
        // While the first email goes out, the other two readers unsubscribe.
        void Promise.all(
          ["a@example.com", "b@example.com", "c@example.com"].filter((x) => x !== email.to).map((x) => t.store.unsubscribe((y) => y === x)),
        );
      }
      return "ok";
    });
    // Let the unsubscribes land before the next turn.
    const deps = { ...t.deps(), sleep: () => new Promise<void>((r) => setTimeout(r, 5)), minIntervalMs: 1 };
    const r = await sendIssue(deps, "weekly-2026-10-05", 1);
    assert.deepEqual(r.status === "done" && r.counts, { accepted: 1, skipped: 2 });
    assert.equal(t.provider.sent.length, 1);
  });

  it("paces requests under the provider's rate limit", async () => {
    const t = await setup();
    await sendIssue(t.deps(), "weekly-2026-10-05", 1);
    assert.deepEqual(t.sleeps, [250, 250, 250]);
  });

  it("an issue rendered with blockers is never sent", async () => {
    const t = await setup();
    await createIssue(t.pool, { issueId: "weekly-blocked", subject: "s", html: HTML, text: TEXT, blockers: ["no approved mailing address"] });
    const r = await sendIssue(t.deps(), "weekly-blocked", 1);
    assert.deepEqual(r, { status: "blocked", blockers: ["no approved mailing address"] });
    assert.equal(t.provider.sent.length, 0);
  });
});

describe("corrections", () => {
  it("revision 2 needs a reason and goes only to readers of revision 1, once", async () => {
    const t = await setup(["a@example.com", "b@example.com"]);
    await sendIssue(t.deps(), "weekly-2026-10-05", 1);
    await t.store.subscribe("late@example.com", {}, new Date("2026-10-06T12:00:00.000Z"));
    await assert.rejects(
      createIssue(t.pool, { issueId: "weekly-2026-10-05", subject: "s", html: HTML, text: TEXT, blockers: [] }),
      /correction and needs a reason/,
    );
    await createIssue(t.pool, {
      issueId: "weekly-2026-10-05",
      subject: "Correction: The GridTilt Weekly",
      html: HTML.replace("Hi", "Corrected"),
      text: TEXT,
      blockers: [],
      correctionReason: "The tracked GW figure counted one campus twice.",
    });
    const r = await sendIssue(t.deps(), "weekly-2026-10-05", 2);
    assert.deepEqual(r.status === "done" && r.counts, { accepted: 2 });
    assert.ok(!t.provider.sent.some((m) => m.to === "late@example.com" && m.subject.startsWith("Correction")));
  });

  it("rejects a malformed issue id", async () => {
    const t = await setup([]);
    await assert.rejects(createIssue(t.pool, { issueId: "Weekly 1", subject: "s", html: HTML, text: TEXT, blockers: [] }), /issue id/);
  });
});

describe("provider events", () => {
  it("a permanent bounce suppresses the address for later issues; repeats and late events change nothing", async () => {
    const t = await setup(["a@example.com", "b@example.com"]);
    await sendIssue(t.deps(), "weekly-2026-10-05", 1);
    const idFor = (to: string) => {
      const m = t.provider.sent.findIndex((x) => x.to === to);
      return `em_${m + 1}`;
    };
    const a = idFor("a@example.com");

    await applyResendEvent(t.pool, t.store, "evt_1", { type: "email.delivered", data: { email_id: a, to: ["a@example.com"] } });
    const bounce = { type: "email.bounced", data: { email_id: a, to: ["a@example.com"], bounce: { type: "Permanent", subType: "General" } } };
    assert.deepEqual(await applyResendEvent(t.pool, t.store, "evt_2", bounce), { duplicate: false, applied: "permanent bounce" });
    assert.deepEqual(await applyResendEvent(t.pool, t.store, "evt_2", bounce), { duplicate: true }, "a retried event is applied once");
    // A delivery report arriving after the bounce does not undo it.
    await applyResendEvent(t.pool, t.store, "evt_3", { type: "email.delivered", data: { email_id: a, to: ["a@example.com"] } });
    assert.deepEqual(await issueStats(t.pool, "weekly-2026-10-05", 1), { accepted: 1, failed: 1 });

    assert.equal(await t.store.isSendable("a@example.com"), false);
    assert.equal((await t.store.subscribe("a@example.com", {})).status, "suppressed");
    await createIssue(t.pool, { issueId: "weekly-2026-10-12", subject: "s", html: HTML, text: TEXT, blockers: [] });
    await sendIssue(t.deps(), "weekly-2026-10-12", 1);
    assert.deepEqual(await issueStats(t.pool, "weekly-2026-10-12", 1), { accepted: 1 });
  });

  it("a transient bounce does not suppress; a complaint does", async () => {
    const t = await setup(["a@example.com", "b@example.com"]);
    await applyResendEvent(t.pool, t.store, "evt_t", {
      type: "email.bounced",
      data: { email_id: "em_x", to: ["a@example.com"], bounce: { type: "Transient", subType: "MailboxFull" } },
    });
    assert.equal(await t.store.isSendable("a@example.com"), true);
    await applyResendEvent(t.pool, t.store, "evt_c", { type: "email.complained", data: { email_id: "em_y", to: ["b@example.com"] } });
    assert.equal(await t.store.isSendable("b@example.com"), false);
    assert.equal((await t.store.listAll()).find((r) => r.email === "b@example.com")?.state, "complained");
  });
});

describe("after a restore", () => {
  it("an opt-out made before the backup still keeps the address out of the next issue", async () => {
    const t = await setup(["a@example.com", "b@example.com"]);
    await t.store.unsubscribe((e) => e === "b@example.com");
    const dump = await dumpSubscribers(t.pool);
    const restored = freshPool();
    await restoreSubscribers(restored, dump);
    const store = postgresStore(restored);
    const provider = fakeProvider();
    await createIssue(restored, { issueId: "weekly-2026-10-05", subject: "s", html: HTML, text: TEXT, blockers: [] });
    const r = await sendIssue(
      { pool: restored, store, send: provider.send, tokenFor: (e) => `tok-${e}`, config: { from: "f", siteUrl: "https://gridtilt.com" }, sleep: async () => {} },
      "weekly-2026-10-05",
      1,
    );
    assert.deepEqual(r.status === "done" && r.counts, { accepted: 1 });
    assert.deepEqual(provider.sent.map((m) => m.to), ["a@example.com"]);
  });
});

// ── A real, disposable Postgres (opt-in) ──────────────────────────────────
// The send lease raced over separate connection pools, as two app instances
// would. TEST_DATABASE_URL must point at an EMPTY throwaway database; the
// suite refuses one that has these tables and drops only what it created.
const REAL_DB = process.env.TEST_DATABASE_URL;

describe("sending on a real, disposable Postgres (TEST_DATABASE_URL)", { skip: !REAL_DB }, () => {
  it("two instances sending the same revision at once: one sends, each address gets one email", async () => {
    const { Pool } = await import("pg");
    const url = REAL_DB as string;
    const mk = () => new Pool({ connectionString: url, max: 4 }) as unknown as PoolLike & { end(): Promise<void> };
    const a = mk();
    const b = mk();
    let created = false;
    try {
      const existing = await a.query("SELECT to_regclass('public.subscribers') AS s, to_regclass('public.newsletter_issues') AS n");
      if (existing.rows[0].s !== null || existing.rows[0].n !== null) {
        throw new Error("TEST_DATABASE_URL already has these tables; use an empty throwaway database");
      }
      created = true;
      const storeA = postgresStore(a);
      const storeB = postgresStore(b);
      for (const e of ["r1@example.com", "r2@example.com", "r3@example.com"]) await storeA.subscribe(e, {}, new Date("2026-05-01T12:00:00.000Z"));
      await createIssue(a, { issueId: "weekly-real", subject: "s", html: HTML, text: TEXT, blockers: [] });
      const provider = fakeProvider();
      const deps = (pool: PoolLike, store: typeof storeA): SendDeps => ({
        pool,
        store,
        send: provider.send,
        tokenFor: (e) => `tok-${e}`,
        config: { from: "f", siteUrl: "https://gridtilt.com" },
        sleep: () => new Promise<void>((r) => setTimeout(r, 5)),
      });
      const [x, y] = await Promise.all([sendIssue(deps(a, storeA), "weekly-real", 1), sendIssue(deps(b, storeB), "weekly-real", 1)]);
      assert.deepEqual([x.status, y.status].sort(), ["busy", "done"]);
      assert.equal(provider.sent.length, 3);
      assert.deepEqual(await issueStats(a, "weekly-real", 1), { accepted: 3 });
    } finally {
      if (created) {
        await a.query(
          "DROP TABLE IF EXISTS newsletter_deliveries, newsletter_issues, provider_events, subscribers, subscriber_suppressions, gt_migrations",
        );
      }
      await a.end();
      await b.end();
    }
  });
});
