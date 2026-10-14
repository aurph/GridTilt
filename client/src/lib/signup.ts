// What a signup form shows for each /api/subscribe outcome. The server's
// answer is the only source: "subscribed" means the address was stored.

export type SignupResult =
  | { kind: "subscribed" }
  | { kind: "exists" }
  | { kind: "suppressed"; message: string }
  | { kind: "error"; message: string };

export const SIGNUP_GENERIC_ERROR = "Something went wrong, try again";
export const SIGNUP_UNAVAILABLE = "Signups are unavailable right now. Please try again later.";
const SUPPRESSED_FALLBACK = "This address was taken off the list earlier, so the form will not add it back.";

/** Map a 2xx /api/subscribe body. Anything unrecognized is an error, not a success. */
export function signupResult(body: unknown): SignupResult {
  const b = (body ?? {}) as { status?: unknown; message?: unknown };
  if (b.status === "subscribed") return { kind: "subscribed" };
  if (b.status === "exists") return { kind: "exists" };
  if (b.status === "suppressed") {
    return { kind: "suppressed", message: typeof b.message === "string" && b.message ? b.message : SUPPRESSED_FALLBACK };
  }
  return { kind: "error", message: SIGNUP_GENERIC_ERROR };
}

/**
 * Map an apiRequest failure ("503: {json}") to a message: storage down,
 * rate limited, or the server's validation text.
 */
export function signupErrorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : "";
  const m = /^(\d{3}):\s*([\s\S]*)$/.exec(text);
  if (!m) return SIGNUP_GENERIC_ERROR;
  const status = Number(m[1]);
  let serverError: string | null = null;
  try {
    const parsed = JSON.parse(m[2]);
    if (typeof parsed?.error === "string" && parsed.error) serverError = parsed.error;
  } catch {
    /* not JSON */
  }
  if (status === 503) return SIGNUP_UNAVAILABLE;
  if ((status === 400 || status === 429) && serverError) return serverError;
  return SIGNUP_GENERIC_ERROR;
}
