/**
 * Play tickets: our own short-lived HS256 JWT, distinct from a Supabase
 * session JWT (which is ES256 and verified separately in `supabaseJwt.ts`).
 * A ticket is what `/clip/:speaker/:id` (Task 6) actually checks — it carries the
 * tier decision and the caller's IP, made once at `/token` time, so the clip
 * route never has to re-derive tier or re-touch Supabase per request.
 *
 * `verifyTicket` returns `null` on ANY failure, including a mismatched IP —
 * a ticket lifted from one client and replayed from another is worthless,
 * not just "less trusted".
 */
import { jwtVerify, SignJWT } from "jose";

export type Tier = "guest" | "free" | "pro";

export interface Ticket {
  tier: Tier;
  sub?: string;
  ip: string;
}

export const TICKET_TTL_S = 30 * 60;

export async function signTicket(t: Ticket, secret: string, now: Date = new Date()): Promise<string> {
  const key = new TextEncoder().encode(secret);
  const iat = Math.floor(now.getTime() / 1000);
  let jwt = new SignJWT({ tier: t.tier, ip: t.ip, ...(t.sub !== undefined ? { sub: t.sub } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(iat)
    .setExpirationTime(iat + TICKET_TTL_S);
  return jwt.sign(key);
}

export async function verifyTicket(jwt: string, secret: string, ip: string): Promise<Ticket | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(jwt, key, { algorithms: ["HS256"] });
    if (payload.ip !== ip) return null;
    const tier = payload.tier;
    if (tier !== "guest" && tier !== "free" && tier !== "pro") return null;
    const sub = typeof payload.sub === "string" ? payload.sub : undefined;
    return { tier, ip, ...(sub !== undefined ? { sub } : {}) };
  } catch {
    return null;
  }
}
