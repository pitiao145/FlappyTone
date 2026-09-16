/**
 * Shared JSON response helper for every function under `api/`.
 *
 * Split out of `_passcode.ts` in Task 13 (Sep 2026): `checkPasscode` and
 * `PASSCODE_HEADER` were only ever used by the booth's `api/upload.ts` and
 * `api/auth.ts`, both retired along with the passcode gate itself (the booth
 * talks to the clips Worker now). `json` had no such single owner —
 * `score.ts`, `run.ts`, `newsletter.ts` and `webhook-ls.ts` all use it — so
 * it moved here rather than being deleted with the rest of the file.
 *
 * Underscore-prefixed for the same reason `_passcode.ts` was: any `.ts` file
 * directly under `api/` without a leading `_` becomes a public endpoint —
 * see `api/_imports.test.ts`.
 */

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
