/**
 * `GET|POST /auth` — the recording booth's passcode pre-check, so the booth
 * UI can tell the user "wrong code" before it starts an upload. Same
 * fail-closed posture as before: an unconfigured deploy 503s.
 *
 * Deliberately does not echo the resolved speaker. The booth learns who it is
 * recording as from `/booth/words`, which is the screen that also shows the
 * word list — one answer, from the request that matters.
 */
import { isDenied, resolveSpeaker } from "../passcode.ts";
import type { Env } from "../index.ts";

export function handleAuth(req: Request, env: Env): Response {
  const resolved = resolveSpeaker(req, env);
  if (isDenied(resolved)) return resolved;
  return Response.json({ ok: true });
}
