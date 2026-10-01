/**
 * Which state My Grid shows, and the URL that shares it.
 *
 * The page used to keep the choice only in localStorage, so a link sent to
 * someone else opened their own remembered state, or none. The URL
 * `/my-grid?state=MD` is now the contract:
 *
 * - A valid state in the URL wins over a remembered one.
 * - With no state in the URL, a valid remembered state is used, and the URL is
 *   rewritten to name it, so back and forward always land on an explicit state.
 * - An invalid code in the URL shows the chooser with a message. It never falls
 *   back silently to the remembered state, which would answer a question the
 *   reader did not ask.
 * - A lowercase code is normalized to the canonical uppercase URL.
 * - A choice made from the chooser replaces the chooser's history entry. A
 *   pushed choice left the bare /my-grid behind it, which the remembered state
 *   rewrote on Back, so Back seemed to do nothing.
 */

export type StateSource = "url" | "saved" | "none";

/** Where My Grid remembers the reader's own choice (never a shared link's state). */
export const MY_GRID_STATE_KEY = "gt-my-grid-state";

/** localStorage, or null where reading it throws (blocked storage, some privacy modes). */
export function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export interface StateResolution {
  /** Two-letter code to show, or "" for the chooser. */
  code: string;
  source: StateSource;
  /** The raw URL value when it named no state we cover. */
  invalid: string | null;
  /** The canonical search string for this view ("?state=MD" or ""), when it differs from the current one. */
  replaceSearch: string | null;
}

/** "md" -> "MD" when it is a covered state; null otherwise. */
export function normalizeStateCode(raw: string | null | undefined, isCovered: (code: string) => boolean): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) && isCovered(code) ? code : null;
}

/**
 * The search string that names a state ("" for the chooser), keeping any other
 * parameters already in `current` (a campaign tag, for one).
 */
export function stateSearch(code: string, current = ""): string {
  const params = new URLSearchParams(current.startsWith("?") ? current.slice(1) : current);
  if (code) params.set("state", code);
  else params.delete("state");
  const q = params.toString();
  return q ? `?${q}` : "";
}

/**
 * How to record a reader's choice in history. While the chooser is on screen
 * (no state shown: a bare URL or an invalid code) the choice replaces that
 * entry, so Back leaves My Grid. Between two shown states it is a push, so
 * Back returns to the previous state. Clearing the choice pushes the chooser.
 */
export function choiceNavigation(
  currentSearch: string,
  shownCode: string,
  code: string,
): { search: string; replace: boolean } {
  return { search: stateSearch(code, currentSearch), replace: shownCode === "" && code !== "" };
}

/**
 * Decides the state for the current URL. `search` is location.search (with or
 * without the leading "?"); `saved` is the remembered code, or null when
 * storage is empty, blocked or corrupt.
 */
export function resolveState(
  search: string,
  saved: string | null,
  isCovered: (code: string) => boolean,
): StateResolution {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const current = params.get("state");

  if (current !== null) {
    const code = normalizeStateCode(current, isCovered);
    if (code) {
      return { code, source: "url", invalid: null, replaceSearch: current === code ? null : stateSearch(code, search) };
    }
    return { code: "", source: "none", invalid: current.slice(0, 40), replaceSearch: null };
  }

  const remembered = normalizeStateCode(saved, isCovered);
  if (remembered) return { code: remembered, source: "saved", invalid: null, replaceSearch: stateSearch(remembered, search) };
  return { code: "", source: "none", invalid: null, replaceSearch: null };
}

/** Reads the remembered state without ever throwing (blocked or corrupt storage reads as none). */
export function readSavedState(storage: Pick<Storage, "getItem"> | null | undefined, key: string): string | null {
  try {
    const v = storage?.getItem(key);
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

/** Remembers or forgets the state; storage failures are ignored (the URL still carries the choice). */
export function writeSavedState(
  storage: Pick<Storage, "setItem" | "removeItem"> | null | undefined,
  key: string,
  code: string,
): void {
  try {
    if (!storage) return;
    if (code) storage.setItem(key, code);
    else storage.removeItem(key);
  } catch {
    /* blocked storage: the URL is the record of the choice */
  }
}
