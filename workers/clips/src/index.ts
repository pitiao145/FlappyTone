/**
 * Router skeleton for the clips API. Only the cross-cutting concerns live
 * here: CORS, the OPTIONS preflight, and dispatch. The actual routes —
 * `/token`, `/clip/:id` and `/auth` live in `./routes/`; `/raw` and
 * `/booth/words` (Task 10) are still seams below.
 *
 * Every response, success or error, goes out through `corsHeaders` — a
 * browser fetch from an allowed origin must be able to read even a 404 or a
 * 500, not just the happy path.
 */
import { corsHeaders } from "./cors.ts";
import { handleAuth } from "./routes/auth.ts";
import { handleClip } from "./routes/clip.ts";
import { handleToken } from "./routes/token.ts";

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
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = req.headers.get("origin");
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env.ALLOWED_ORIGINS) });
    }

    const url = new URL(req.url);
    const cors = (res: Response) => withCors(res, origin, env.ALLOWED_ORIGINS);
    const key = `${req.method} ${url.pathname}`;

    // `/clip/:id` is the one path-parameterised route; the handler reads the
    // id off the pathname itself and validates it.
    if (req.method === "GET" && url.pathname.startsWith("/clip/")) {
      return cors(await handleClip(req, env, ctx));
    }

    switch (key) {
      case "POST /token":
        return cors(await handleToken(req, env));

      case "GET /auth":
      case "POST /auth":
        return cors(handleAuth(req, env));

      // --- Task 10 ---
      // case "GET /raw": return cors(await handleRaw(req, env));
      // case "GET /booth/words": return cors(await handleBoothWords(req, env));

      default:
        return cors(Response.json({ error: "Not found." }, { status: 404 }));
    }
  },
};
