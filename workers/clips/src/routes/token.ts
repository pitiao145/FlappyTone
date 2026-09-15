/**
 * `POST /token` — mints a short-lived play ticket.
 *
 * Decision 2 of the plan binds this route: **it never hard-fails.** A
 * missing, malformed, expired or forged Supabase JWT all resolve to a
 * `guest` ticket rather than a 401, because clips are what the game needs to
 * be playable at all — only `min_tier='pro'` words are actually gated. An
 * anonymous Supabase session is `guest` too, not `free`: a free account is
 * a permanent (email) one, the same line `src/data/tier.ts` draws.
 *
 * The tier decision is made once, here, and carried in the ticket — so
 * `/clip/:id` never touches Supabase per request.
 */
import { serviceDb } from "../db.ts";
import { verifySupabaseJwt } from "../supabaseJwt.ts";
import { TICKET_TTL_S, signTicket, type Tier } from "../tickets.ts";
import type { Env } from "../index.ts";

function bearer(req: Request): string | null {
  const match = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "");
  return match ? match[1] : null;
}

export function callerIp(req: Request): string {
  return req.headers.get("CF-Connecting-IP") ?? "";
}

async function resolveTier(env: Env, sub: string): Promise<Tier> {
  try {
    const { data, error } = await serviceDb(env)
      .from("entitlements")
      .select("has_access")
      .eq("user_id", sub)
      .maybeSingle();
    // A read failure downgrades to `free`, never up to `pro`: the worst case
    // is a paying player briefly missing pro words, not a free one getting them.
    if (error) return "free";
    return data?.has_access === true ? "pro" : "free";
  } catch {
    return "free";
  }
}

export async function handleToken(req: Request, env: Env): Promise<Response> {
  const ip = callerIp(req);
  let tier: Tier = "guest";
  let sub: string | undefined;

  const jwt = bearer(req);
  if (jwt) {
    const session = await verifySupabaseJwt(jwt, env.SUPABASE_URL);
    if (session && !session.isAnonymous) {
      sub = session.sub;
      tier = await resolveTier(env, session.sub);
    }
  }

  const token = await signTicket({ tier, ip, ...(sub !== undefined ? { sub } : {}) }, env.CLIP_TOKEN_SECRET);
  return Response.json({ token, expiresIn: TICKET_TTL_S, tier });
}
