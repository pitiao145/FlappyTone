/**
 * Router skeleton for the clips API. Only the cross-cutting concerns live
 * here: CORS, the OPTIONS preflight, and dispatch. The actual routes —
 * `/token`, `/clip/:id` (Task 6), `/auth`, `/raw`, `/booth/words` (Task 10)
 * — are not implemented yet; each is a clearly marked seam below.
 *
 * Every response, success or error, goes out through `corsHeaders` — a
 * browser fetch from an allowed origin must be able to read even a 404 or a
 * 500, not just the happy path.
 */
import { corsHeaders } from "./cors.ts";

export interface Env {
  RAW: R2Bucket;
  CLIPS: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  CLIP_TOKEN_SECRET: string;
  RECORD_PASSCODE: string;
  /** Comma-separated; entries may be "https://*.vercel.app". */
  ALLOWED_ORIGINS: string;
}

function withCors(res: Response, origin: string | null, allowed: string): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders(origin, allowed))) {
    headers.set(k, v as string);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const origin = req.headers.get("origin");
    // The caller's IP for a ticket's `ip` claim (Task 6's /token) is read
    // the same way route handlers will read it: `req.headers.get("CF-Connecting-IP")`.

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env.ALLOWED_ORIGINS) });
    }

    const url = new URL(req.url);
    const key = `${req.method} ${url.pathname}`;

    switch (key) {
      // --- Task 6 ---
      // case "POST /token": return withCors(await handleToken(req, env, _ip), origin, env.ALLOWED_ORIGINS);
      // case "GET /clip/:id" (pattern-matched, not literal): return withCors(await handleClip(req, env, _ip), origin, env.ALLOWED_ORIGINS);

      // --- Task 10 ---
      // case "POST /auth": return withCors(await handleAuth(req, env), origin, env.ALLOWED_ORIGINS);
      // case "GET /raw": return withCors(await handleRaw(req, env), origin, env.ALLOWED_ORIGINS);
      // case "GET /booth/words": return withCors(await handleBoothWords(req, env), origin, env.ALLOWED_ORIGINS);

      default:
        return withCors(
          Response.json({ error: "Not found." }, { status: 404 }),
          origin,
          env.ALLOWED_ORIGINS,
        );
    }
  },
};
