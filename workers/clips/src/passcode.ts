/**
 * The one gate on the recording booth's clip-side calls (Task 10's
 * `/booth/words`) — a straight port of `api/_passcode.ts`, same threat model:
 * one user, not an account, protecting a quota rather than anyone's data.
 *
 * Fails closed: an unset `RECORD_PASSCODE` (a misconfigured deploy) rejects
 * everything with 503, never falls open.
 */

export const PASSCODE_HEADER = "x-record-passcode";

/** Constant-time compare, so the endpoint is not a character-by-character oracle. */
function equals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkPasscode(req: Request, expected: string | undefined): Response | null {
  if (!expected) {
    return Response.json({ error: "Recording is not configured." }, { status: 503 });
  }
  const given = req.headers.get(PASSCODE_HEADER) ?? "";
  if (!equals(given, expected)) {
    return Response.json({ error: "Wrong code." }, { status: 401 });
  }
  return null;
}
