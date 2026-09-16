/**
 * `GET|POST /auth` — the recording booth's passcode pre-check, so the booth
 * UI can tell the user "wrong code" before it starts an upload. Same
 * fail-closed posture as `api/auth.ts`: an unconfigured deploy 503s.
 */
import { checkPasscode } from "../passcode.ts";
import type { Env } from "../index.ts";

export function handleAuth(req: Request, env: Env): Response {
  return checkPasscode(req, env.RECORD_PASSCODE) ?? Response.json({ ok: true });
}
