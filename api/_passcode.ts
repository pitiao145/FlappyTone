/**
 * The one gate on the recording booth.
 *
 * `/record` is a public URL, and an unguarded upload endpoint is an open write
 * to our storage. A shared passcode is the right weight here: there is exactly
 * one user, she is not an account, and the thing being protected is a quota
 * rather than anyone's data.
 *
 * Fails closed. If `RECORD_PASSCODE` is unset the endpoint rejects everything,
 * so a misconfigured deploy is a locked door rather than an open one.
 */

export const PASSCODE_HEADER = "x-record-passcode";

/** Constant-time compare, so the endpoint is not a character-by-character oracle. */
function equals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkPasscode(request: Request): Response | null {
  const expected = process.env.RECORD_PASSCODE;
  if (!expected) {
    return json(503, { error: "Recording is not configured." });
  }
  const given = request.headers.get(PASSCODE_HEADER) ?? "";
  if (!equals(given, expected)) {
    return json(401, { error: "Wrong code." });
  }
  return null;
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
