// Regression guard: My Grid kept the chosen state only in localStorage, so a
// shared link opened the recipient's remembered state or none. The URL
// ?state=MD is the contract; these cases pin its precedence rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  choiceNavigation,
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

test("a choice from the chooser replaces its entry; a change between states pushes", () => {
  assert.deepEqual(choiceNavigation("", "", "MD"), { search: "?state=MD", replace: true });
  assert.deepEqual(choiceNavigation("?state=ZZ", "", "MD"), { search: "?state=MD", replace: true });
  assert.deepEqual(choiceNavigation("?state=MD", "MD", "TX"), { search: "?state=TX", replace: false });
  // Clearing pushes the chooser, so Back returns to the state that was shown.
  assert.deepEqual(choiceNavigation("?state=MD", "MD", ""), { search: "", replace: false });
  // Other parameters ride along.
  assert.deepEqual(choiceNavigation("?utm_source=x", "", "VA"), { search: "?utm_source=x&state=VA", replace: true });
});

/**
 * A small model of the browser history plus the page's two navigation paths:
 * the reader's choice (choiceNavigation) and the canonical rewrite the page
 * applies after resolving the URL (resolveState's replaceSearch).
 */
function historyModel(start: string[]) {
  const entries = [...start];
  let index = entries.length - 1;
  let saved: string | null = null;
  const settle = () => {
    // What My Grid does on render: resolve, then replace with the canonical URL.
    const url = entries[index];
    if (!url.startsWith("/my-grid")) return;
    const search = url.slice("/my-grid".length);
    const r = resolveState(search, saved, isCovered);
    if (r.replaceSearch !== null) entries[index] = `/my-grid${r.replaceSearch}`;
  };
  const shown = () => {
    const url = entries[index];
    return url.startsWith("/my-grid") ? resolveState(url.slice("/my-grid".length), saved, isCovered).code : null;
  };
  settle();
  return {
    choose(code: string) {
      // The page passes the state from the render before the click, then saves.
      const before = shown() ?? "";
      saved = code || null;
      const url = entries[index];
      const next = choiceNavigation(url.slice("/my-grid".length), before, code);
      const target = `/my-grid${next.search}`;
      if (next.replace) entries[index] = target;
      else {
        entries.splice(index + 1);
        entries.push(target);
        index++;
      }
      settle();
    },
    back() {
      index = Math.max(0, index - 1);
      settle();
    },
    get url() {
      return entries[index];
    },
    shown,
  };
}

test("Back after the first choice leaves My Grid instead of re-showing the same state", () => {
  // Landing -> "Choose your state" -> pick Maryland -> Back.
  const h = historyModel(["/", "/my-grid"]);
  assert.equal(h.shown(), "");
  h.choose("MD");
  assert.equal(h.url, "/my-grid?state=MD");
  h.back();
  assert.equal(h.url, "/", "Back must reach the page the reader came from");
});

test("Back after changing state returns to the previous state", () => {
  const h = historyModel(["/", "/my-grid"]);
  h.choose("MD");
  h.choose("TX");
  h.back();
  assert.equal(h.url, "/my-grid?state=MD");
  assert.equal(h.shown(), "MD");
});

test("clearing and picking again keeps Back on the earlier state", () => {
  const h = historyModel(["/", "/my-grid"]);
  h.choose("MD");
  h.choose("");
  assert.equal(h.shown(), "");
  h.choose("VA");
  h.back();
  assert.equal(h.url, "/my-grid?state=MD");
});
