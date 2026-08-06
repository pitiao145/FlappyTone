/**
 * Checks the passcode and nothing else.
 *
 * Exists so a wrong code is caught on the first screen rather than after Jane
 * has recorded her first word and watched it fail to upload.
 */
import { checkPasscode, json } from "./_passcode.ts";

export function POST(request: Request): Response {
  return checkPasscode(request) ?? json(200, { ok: true });
}
