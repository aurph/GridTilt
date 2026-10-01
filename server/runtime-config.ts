/**
 * Runtime config handed to the browser inside index.html.
 *
 * The Carto basemap key has to live client-side: Leaflet requests tiles
 * straight from the browser, so a server-only secret never reaches them.
 * Injecting it into the HTML (which is re-templated per request and served
 * no-cache) keeps the Replit secret named CARTO_API and avoids a rebuild
 * when the key is rotated.
 *
 * This key is public by nature - it is visible in network requests on any
 * browser map. Restrict it by domain in the Carto dashboard rather than
 * treating it as a secret.
 */

export interface RuntimeConfig {
  cartoApiKey: string | null;
}

const MAX_KEY_LENGTH = 256;

// U+2028 / U+2029 pass the key validation below (they are above 0x20) but are
// line terminators, so they are stripped before reaching an HTML attribute.
// Built by code point to keep this source file pure ASCII.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

let warnedMissing = false;
let warnedMalformed = false;

/** Whitespace or control characters - what a half-pasted secret looks like. */
function hasDisallowedCharacters(key: string): boolean {
  for (const character of key) {
    const code = character.codePointAt(0);
    if (code === undefined || code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function readCartoApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.CARTO_API;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    if (!warnedMissing && env.NODE_ENV !== "test") {
      warnedMissing = true;
      console.warn(
        "[carto] CARTO_API is not set - basemap tiles will render with Carto's 'API KEY REQUIRED' watermark.",
      );
    }
    return null;
  }

  const key = raw.trim();
  if (key.length > MAX_KEY_LENGTH || hasDisallowedCharacters(key)) {
    if (!warnedMalformed && env.NODE_ENV !== "test") {
      warnedMalformed = true;
      console.warn(
        "[carto] CARTO_API looks malformed (whitespace or control characters) - ignoring it.",
      );
    }
    return null;
  }

  return key;
}

export function buildRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return { cartoApiKey: readCartoApiKey(env) };
}

/** The meta element the client reads the key from. */
export const CARTO_KEY_META_NAME = "gridtilt:carto-api-key";

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split(LINE_SEPARATOR)
    .join("")
    .split(PARAGRAPH_SEPARATOR)
    .join("");
}

/**
 * Injects the key as a meta tag in <head>.
 *
 * Deliberately not an inline script: production CSP is `script-src 'self'`,
 * which blocks inline execution outright. The HTML would still look correct
 * to curl while the browser silently ignored it. A meta tag is subject to no
 * such directive, needs no nonce or hash, costs no extra request, and is in
 * the DOM before the app module (which is deferred) ever runs.
 *
 * The tag is omitted entirely when no key is configured.
 */
export function injectRuntimeConfig(
  html: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const { cartoApiKey } = buildRuntimeConfig(env);
  if (!cartoApiKey) return html;
  if (!html.includes("</head>")) return html;
  const tag = `<meta name="${CARTO_KEY_META_NAME}" content="${escapeAttribute(cartoApiKey)}" />`;
  return html.replace("</head>", `  ${tag}\n  </head>`);
}

/** Test seam: the one-shot warnings would otherwise leak across cases. */
export function resetRuntimeConfigWarnings(): void {
  warnedMissing = false;
  warnedMalformed = false;
}
