// How each provider answer is read, and how webhook signatures are checked.
// No network: fetch is a fake.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { sendViaResend, verifyResendWebhook, type OutgoingEmail } from "../resend";

const EMAIL: OutgoingEmail = {
  from: "GridTilt <brief@news.gridtilt.com>",
  to: "reader@example.com",
  subject: "The GridTilt Weekly",
  html: "<p>hi</p>",
  text: "hi",
  headers: { "List-Unsubscribe": "<https://gridtilt.com/api/unsubscribe?token=t>" },
  replyTo: "gridtilt1@gmail.com",
};

function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const impl = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    calls.push({ url, headers: init.headers, body: init.body });
    return { ok: status >= 200 && status < 300, status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) };
  };
  return { impl, calls };
}

describe("sendViaResend", () => {
  it("sends one email with the idempotency key, plain text, headers and reply-to", async () => {
    const f = fakeFetch(200, { id: "em_1" });
    const out = await sendViaResend("re_key", EMAIL, "gridtilt-weekly-r1-abc", f.impl);
    assert.deepEqual(out, { kind: "accepted", providerId: "em_1" });
    const call = f.calls[0];
    assert.equal(call.url, "https://api.resend.com/emails");
    assert.equal(call.headers["Idempotency-Key"], "gridtilt-weekly-r1-abc");
    assert.equal(call.headers.Authorization, "Bearer re_key");
    const body = JSON.parse(call.body);
    assert.deepEqual(body.to, ["reader@example.com"]);
    assert.equal(body.text, "hi");
    assert.equal(body.reply_to, "gridtilt1@gmail.com");
    assert.ok(body.headers["List-Unsubscribe"]);
  });

  it("reads each failure as retryable, rejected or ambiguous", async () => {
    const cases: Array<[number, unknown, string]> = [
      [429, { name: "rate_limit_exceeded" }, "retryable"],
      [500, { name: "internal_server_error" }, "retryable"],
      [503, "upstream", "retryable"],
      [409, { name: "concurrent_idempotent_requests" }, "retryable"],
      [409, { name: "invalid_idempotent_request" }, "rejected"],
      [422, { name: "validation_error" }, "rejected"],
      [403, { name: "invalid_api_key" }, "rejected"],
      [200, { nope: true }, "ambiguous"],
    ];
    for (const [status, body, kind] of cases) {
      const out = await sendViaResend("k", EMAIL, "key", fakeFetch(status, body).impl);
      assert.equal(out.kind, kind, `${status} ${JSON.stringify(body)}`);
    }
  });

  it("a request that never answers is ambiguous, not failed: it may have been accepted", async () => {
    const out = await sendViaResend("k", EMAIL, "key", async () => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    });
    assert.equal(out.kind, "ambiguous");
  });

  it("refuses an idempotency key the provider would not accept", async () => {
    assert.equal((await sendViaResend("k", EMAIL, "x".repeat(257), fakeFetch(200, { id: "e" }).impl)).kind, "rejected");
    assert.equal((await sendViaResend("k", EMAIL, "", fakeFetch(200, { id: "e" }).impl)).kind, "rejected");
  });
});

describe("verifyResendWebhook", () => {
  const key = Buffer.from("a-test-signing-key-32-bytes-long!!");
  const secret = `whsec_${key.toString("base64")}`;
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "em_1" } });
  const id = "msg_2abc";
  const now = 1_790_000_000;
  const sign = (ts: number, b = body, k = key) => createHmac("sha256", k).update(`${id}.${ts}.${b}`).digest("base64");

  it("accepts a correct signature over the raw body", () => {
    assert.ok(verifyResendWebhook(secret, { id, timestamp: String(now), signature: `v1,${sign(now)}` }, Buffer.from(body), now));
  });

  it("accepts when any of several signatures matches (key rotation)", () => {
    const sig = `v1,${sign(now, body, Buffer.from("old-key-old-key-old-key-old-key!"))} v1,${sign(now)}`;
    assert.ok(verifyResendWebhook(secret, { id, timestamp: String(now), signature: sig }, body, now));
  });

  it("rejects a changed body, an old timestamp, a wrong secret, a non-v1 entry or missing headers", () => {
    const good = `v1,${sign(now)}`;
    assert.equal(verifyResendWebhook(secret, { id, timestamp: String(now), signature: good }, body.replace("delivered", "bounced"), now), false);
    assert.equal(verifyResendWebhook(secret, { id, timestamp: String(now - 600), signature: `v1,${sign(now - 600)}` }, body, now), false);
    assert.equal(verifyResendWebhook(`whsec_${Buffer.from("another-key").toString("base64")}`, { id, timestamp: String(now), signature: good }, body, now), false);
    assert.equal(verifyResendWebhook(secret, { id, timestamp: String(now), signature: `v2,${sign(now)}` }, body, now), false);
    assert.equal(verifyResendWebhook(secret, { id, timestamp: String(now) }, body, now), false);
    assert.equal(verifyResendWebhook("not-a-whsec", { id, timestamp: String(now), signature: good }, body, now), false);
  });
});
