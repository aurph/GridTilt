// Regression guard: My Grid kept the chosen state only in localStorage, so a
// shared link opened the recipient's remembered state or none. The URL
// ?state=MD is the contract; these cases pin its precedence rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeStateCode,
  readSavedState,
  resolveState,
  stateSearch,
  writeSavedState,
} from "../state-selection";

const COVERED = new Set(["MD", "VA", "TX", "DC"]);
const isCovered = (c: string) => COVERED.has(c);

test("a valid state in the URL wins over a remembered one", () => {
  const r = resolveState("?state=MD", "VA", isCovered);
  assert.deepEqual(r, { code: "MD", source: "url", invalid: null, replaceSearch: null });
});

test("a shared link opens its state in a fresh browser with nothing remembered", () => {
  assert.equal(resolveState("?state=MD", null, isCovered).code, "MD");
});

test("a lowercase code shows the state and asks for the canonical uppercase URL", () => {
  const r = resolveState("state=md", null, isCovered);
  assert.equal(r.code, "MD");
  assert.equal(r.replaceSearch, "?state=MD");
});

test("an invalid code shows the chooser with a message, not the remembered state", () => {
  const r = resolveState("?state=ZZ", "VA", isCovered);
  assert.deepEqual(r, { code: "", source: "none", invalid: "ZZ", replaceSearch: null });
  assert.equal(resolveState("?state=", "VA", isCovered).code, "", "an empty value is not a state either");
});

test("with no state in the URL, a valid remembered state is used and written into the URL", () => {
  const r = resolveState("", "VA", isCovered);
  assert.deepEqual(r, { code: "VA", source: "saved", invalid: null, replaceSearch: "?state=VA" });
});

test("a corrupt or uncovered remembered value shows the chooser", () => {
  assert.equal(resolveState("", "not-a-state", isCovered).code, "");
  assert.equal(resolveState("", "PR", isCovered).code, "");
  assert.equal(resolveState("", null, isCovered).source, "none");
});

test("normalizeStateCode trims and uppercases only real covered codes", () => {
  assert.equal(normalizeStateCode(" va ", isCovered), "VA");
  assert.equal(normalizeStateCode("Virginia", isCovered), null);
  assert.equal(normalizeStateCode(undefined, isCovered), null);
});

test("clearing the state gives the bare page URL", () => {
  assert.equal(stateSearch(""), "");
  assert.equal(stateSearch("TX"), "?state=TX");
});

test("blocked storage never throws: reads come back empty, writes are ignored", () => {
  const blocked = {
    getItem: () => { throw new Error("SecurityError"); },
    setItem: () => { throw new Error("QuotaExceededError"); },
    removeItem: () => { throw new Error("SecurityError"); },
  };
  assert.equal(readSavedState(blocked, "k"), null);
  assert.doesNotThrow(() => writeSavedState(blocked, "k", "MD"));
  assert.doesNotThrow(() => writeSavedState(null, "k", "MD"));
});

test("choosing remembers the state; clearing forgets it", () => {
  const store = new Map<string, string>();
  const s = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  writeSavedState(s, "k", "MD");
  assert.equal(readSavedState(s, "k"), "MD");
  writeSavedState(s, "k", "");
  assert.equal(readSavedState(s, "k"), null);
});

test("rewriting the address keeps other parameters, such as a campaign tag", () => {
  assert.equal(stateSearch("MD", "?utm_source=x"), "?utm_source=x&state=MD");
  assert.equal(stateSearch("", "?utm_source=x&state=MD"), "?utm_source=x");
  assert.equal(resolveState("?utm_source=x", "VA", isCovered).replaceSearch, "?utm_source=x&state=VA");
  assert.equal(resolveState("utm_source=x&state=va", null, isCovered).replaceSearch, "?utm_source=x&state=VA");
});
