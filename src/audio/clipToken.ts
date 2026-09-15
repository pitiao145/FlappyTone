/**
 * Play tickets for the clips Worker.
 *
 * The clips live in R2 behind `clips.flappytone.com`, which will not serve a
 * clip without a short-lived, IP-bound ticket. A ticket is minted by POSTing
 * `/token`, optionally carrying the player's Supabase access token — that JWT
 * is what tells the Worker whether this is a guest, a free account or Pro, and
 * therefore whether a `pro` word is allowed. No JWT is not an error: the Worker
 * always answers 200, with a `guest` ticket.
 *
 * Two contracts hold here, both borrowed from `src/data/`:
 *
 * 1. **Nothing in this file throws into a caller.** A dead Worker, a missing
 *    env var or an offline phone returns `null`, and `loadClip` falls back to
 *    the synthetic sweep. Audio is a cue, not the game.
 * 2. **No Web Audio.** This module only ever does `fetch`. Hard rule 4 says
 *    every audio API call sits behind a user gesture; a ticket warm-up at app
 *    load must therefore not touch — let alone resume — an AudioContext.
 *
 * Importing `currentSession` from `src/data/` is allowed (audio → data);
 * `src/pitch/` importing either is not.
 */
import { currentSession, warn } from "../data/supabase.ts";

/**
 * The Worker's origin, or `null` when unconfigured — which is the normal state
 * of a checkout without `.env.local`, and of any build made before the var was
 * set in Vercel. Callers must handle it: the game stays playable with
 * synthetic cues and no clips at all.
 */
export const CLIPS_BASE_URL: string | null =
  (import.meta.env.VITE_CLIPS_BASE_URL as string | undefined)?.replace(/\/+$/, "") || null;

/**
 * Refetch this long before the stated expiry. A ticket that expires mid-flight
 * turns into a 401 and a synthetic cue for that gate; a margin costs one extra
 * `/token` per half hour and avoids it.
 */
const EXPIRY_MARGIN_MS = 120_000;

interface Ticket {
  token: string;
  /** `Date.now()` after which the ticket must be replaced. */
  goodUntilMs: number;
}

let cached: Ticket | null = null;
/**
 * The in-flight mint, shared by every concurrent caller.
 *
 * `prefetchPool` fires several loads at once and each one asks for a ticket,
 * so without this a single run start would open N `/token` requests and keep
 * only the last one's answer.
 */
let pending: Promise<string | null> | null = null;

/**
 * A valid play ticket, minting one if needed. Never throws; `null` means "no
 * clips this time" and the caller falls back to the synthetic sweep.
 */
export function getPlayTicket(): Promise<string | null> {
  if (!CLIPS_BASE_URL) return Promise.resolve(null);
  if (cached && Date.now() < cached.goodUntilMs) return Promise.resolve(cached.token);
  pending ??= mint().finally(() => {
    pending = null;
  });
  return pending;
}

/**
 * Drops the cached ticket so the next call mints a fresh one.
 *
 * Called on a 401 from `/clip` (the ticket expired, or the player's IP moved)
 * and on any auth state change — a signup or a purchase changes the *tier*
 * baked into the ticket, and the old one would keep the player on their old
 * entitlements until it expired on its own.
 */
export function invalidatePlayTicket(): void {
  cached = null;
}

async function mint(): Promise<string | null> {
  try {
    const session = await currentSession();
    const headers: Record<string, string> = {};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const res = await fetch(`${CLIPS_BASE_URL}/token`, { method: "POST", headers });
    if (!res.ok) {
      warn("clips", `/token: ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { token?: unknown; expiresIn?: unknown };
    if (typeof body.token !== "string" || !body.token) {
      warn("clips", "/token returned no token");
      return null;
    }
    const expiresInS =
      typeof body.expiresIn === "number" && Number.isFinite(body.expiresIn) && body.expiresIn > 0
        ? body.expiresIn
        : 1800;
    cached = {
      token: body.token,
      goodUntilMs: Date.now() + Math.max(0, expiresInS * 1000 - EXPIRY_MARGIN_MS),
    };
    return body.token;
  } catch (err) {
    warn("clips", "/token failed", err);
    return null;
  }
}
