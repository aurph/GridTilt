// What the signup forms show for each server answer. "Subscribed" appears
// only when the server says the address was stored.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SIGNUP_GENERIC_ERROR, SIGNUP_UNAVAILABLE, signupErrorMessage, signupResult } from "../signup";

describe("signupResult", () => {
  it("maps each server status", () => {
    assert.deepEqual(signupResult({ status: "subscribed", message: "You're on the list" }), { kind: "subscribed" });
    assert.deepEqual(signupResult({ status: "exists" }), { kind: "exists" });
    assert.deepEqual(signupResult({ status: "suppressed", message: "Taken off earlier." }), {
      kind: "suppressed",
      message: "Taken off earlier.",
    });
  });

  it("gives a suppressed answer a message even when the server sent none", () => {
    const r = signupResult({ status: "suppressed" });
    assert.equal(r.kind, "suppressed");
    assert.ok(r.kind === "suppressed" && r.message.length > 0);
  });

  it("never turns an unrecognized answer into a success", () => {
    for (const body of [{}, { status: "ok" }, null, "You're in", { status: "unavailable" }]) {
      assert.deepEqual(signupResult(body), { kind: "error", message: SIGNUP_GENERIC_ERROR });
    }
  });
});

describe("signupErrorMessage", () => {
  it("says signups are unavailable for a 503", () => {
    const err = new Error('503: {"error":"Signups are unavailable right now. Please try again later.","status":"unavailable"}');
    assert.equal(signupErrorMessage(err), SIGNUP_UNAVAILABLE);
  });

  it("passes the server's own words through for validation and rate limits", () => {
    assert.equal(signupErrorMessage(new Error('400: {"error":"That doesn\'t look like an email"}')), "That doesn't look like an email");
    assert.equal(
      signupErrorMessage(new Error('429: {"error":"Too many subscribe attempts. Try again later."}')),
      "Too many subscribe attempts. Try again later.",
    );
  });

  it("falls back to the generic message for anything else", () => {
    assert.equal(signupErrorMessage(new Error("500: Internal Server Error")), SIGNUP_GENERIC_ERROR);
    assert.equal(signupErrorMessage(new Error("Failed to fetch")), SIGNUP_GENERIC_ERROR);
    assert.equal(signupErrorMessage("not an error"), SIGNUP_GENERIC_ERROR);
    assert.equal(signupErrorMessage(new Error("400: <html>")), SIGNUP_GENERIC_ERROR);
  });
});
