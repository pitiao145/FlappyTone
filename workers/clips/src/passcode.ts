/**
 * The one gate on the recording booth's calls (`/auth`, `/raw`,
 * `/booth/words`) — and, since the voice roster, the only place a booth
 * session's speaker is decided.
 *
 * Threat model is unchanged from `api/_passcode.ts`: a handful of users, not
 * accounts, protecting a quota rather than anyone's data. What is new is that
 * the passcode now also names *whose* rows the session may write.
 *
 * Fails closed: an unset or unparseable `RECORD_PASSCODES` (a misconfigured
 * deploy) rejects everything with 503, never falls open.
 */

export const PASSCODE_HEADER = "x-record-passcode";

/** Mirrors `speakers.id`'s CHECK constraint — a value the DB could not hold is a misconfigured secret. */
const SPEAKER_RE = /^[a-z0-9]{1,16}$/;

/** Constant-time compare, so the endpoint is not a character-by-character oracle. */
function equals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The speaker is derived from the passcode and from nothing else. No booth
 * route accepts a speaker from the client, so a recorder cannot express
 * "write as someone else" — the vocabulary does not exist.
 *
 * Returns a discriminated union rather than `Response | null` so a route that
 * forgets the denial branch does not compile. With a speaker to carry, an
 * unchecked null would be a silent cross-write, not just a silent bypass.
 *
 * Storage is one JSON secret, `RECORD_PASSCODES` — `{"<code>":"jane", …}` —
 * so adding a recorder is a secret update, not a code change.
 */
export function resolveSpeaker(
  req: Request,
  env: { RECORD_PASSCODES?: string },
): { speaker: string } | Response {
  let map: Record<string, unknown>;
  try {
    map = JSON.parse(env.RECORD_PASSCODES ?? "") as Record<string, unknown>;
    if (!map || typeof map !== "object" || Array.isArray(map)) throw new Error("not an object");
  } catch {
    return Response.json({ error: "Recording is not configured." }, { status: 503 });
  }

  const given = req.headers.get(PASSCODE_HEADER) ?? "";
  // Every entry, no early exit: response time must reveal neither how many
  // codes exist nor which prefix matched.
  let found: string | null = null;
  for (const [code, speaker] of Object.entries(map)) {
    if (equals(given, code)) found = typeof speaker === "string" ? speaker : "";
  }
  if (found === null) return Response.json({ error: "Wrong code." }, { status: 401 });
  if (!SPEAKER_RE.test(found)) {
    return Response.json({ error: "Recording is not configured." }, { status: 503 });
  }
  return { speaker: found };
}

/** Narrows the union at a route's front door. */
export function isDenied(r: { speaker: string } | Response): r is Response {
  return r instanceof Response;
}
