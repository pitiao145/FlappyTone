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
  const jwt = new SignJWT({ tier: t.tier, ip: t.ip, ...(t.sub !== undefined ? { sub: t.sub } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(iat)
    .setExpirationTime(iat + TICKET_TTL_S);
  return jwt.sign(key);
}

/**
 * Why a ticket was refused. Logged by `/clip` (never the IP itself), so a
 * player whose cues fall back to the synthetic sweep can be told apart:
 * an expired ticket, a forged/garbled one, or a real ticket presented from
 * another address (a VPN or privacy relay rotating its exit IP).
 */
export type TicketFailure = "missing" | "invalid" | "expired" | "ip_mismatch" | "bad_tier";

/**
 * How far the caller's IP moved from the one the ticket was minted for, on
 * an `ip_mismatch`. Coarse on purpose: it answers "would binding to a /24
 * (IPv4) or /48 (IPv6) have kept this ticket working?" without storing either
 * address. `family` = IPv4 one side, IPv6 the other.
 */
export type IpDrift = "family" | "same_prefix" | "other_prefix";

export type TicketCheck =
  | { ok: true; ticket: Ticket }
  | { ok: false; reason: TicketFailure; drift?: IpDrift };

function prefixOf(ip: string): string | null {
  if (ip.includes(":")) {
    // First three hextets of the expanded-enough form: a /48. `::`
    // compression before the third hextet makes this approximate, which is
    // fine for a log line.
    return `6:${ip.toLowerCase().split(":").slice(0, 3).join(":")}`;
  }
  const parts = ip.split(".");
  return parts.length === 4 ? `4:${parts.slice(0, 3).join(".")}` : null;
}

export function ipDrift(minted: string, caller: string): IpDrift {
  const a = prefixOf(minted);
  const b = prefixOf(caller);
  if (!a || !b || a[0] !== b[0]) return "family";
  return a === b ? "same_prefix" : "other_prefix";
}

export async function checkTicket(jwt: string | null, secret: string, ip: string): Promise<TicketCheck> {
  if (!jwt) return { ok: false, reason: "missing" };
  let payload: Record<string, unknown>;
  try {
    const key = new TextEncoder().encode(secret);
    ({ payload } = await jwtVerify(jwt, key, { algorithms: ["HS256"] }));
  } catch (err) {
    const expired = (err as { code?: unknown } | null)?.code === "ERR_JWT_EXPIRED";
    return { ok: false, reason: expired ? "expired" : "invalid" };
  }
  if (payload.ip !== ip) {
    return {
      ok: false,
      reason: "ip_mismatch",
      drift: ipDrift(typeof payload.ip === "string" ? payload.ip : "", ip),
    };
  }
  const tier = payload.tier;
  if (tier !== "guest" && tier !== "free" && tier !== "pro") return { ok: false, reason: "bad_tier" };
  const sub = typeof payload.sub === "string" ? payload.sub : undefined;
  return { ok: true, ticket: { tier, ip, ...(sub !== undefined ? { sub } : {}) } };
}

export async function verifyTicket(jwt: string, secret: string, ip: string): Promise<Ticket | null> {
  const check = await checkTicket(jwt, secret, ip);
  return check.ok ? check.ticket : null;
}
