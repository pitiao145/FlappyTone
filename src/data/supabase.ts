/**
 * The one Supabase client.
 *
 * Two rules govern everything in `src/data/`:
 *
 * 1. **Nothing here may throw into a caller.** A leaderboard is a side dish;
 *    the game is the meal. A network failure, a paused free-tier project, or a
 *    missing env var must degrade to "no board today", never to a broken end
 *    screen. Same contract `src/share/share.ts` and `src/analytics/client.ts`
 *    already keep.
 * 2. **Nothing signs a player in anonymously.** `/app` needs a permanent
 *    account (brief 24); the old lazy `signInAnonymously()` path is gone.
 *
 * The publishable key below is *meant* to be in the bundle. It identifies the
 * project, it does not authorise anything: row-level security in Postgres is
 * what actually guards the data. The service-role key is a different thing
 * entirely and lives only in Vercel's server env, read by `api/score.ts`.
 */
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types.ts";

export type FlappyToneClient = SupabaseClient<Database>;

/**
 * Says out loud what the never-throw contract just swallowed.
 *
 * Silence is the right behaviour for a *player* — a dead board should cost
 * them nothing — but it is the wrong behaviour for whoever is building this.
 * Without a log, a missing env var and a working leaderboard look identical
 * from the outside, which is exactly how a misconfigured local server can be
 * played against for a whole run before anyone notices.
 *
 * So: every swallowed failure gets one line here. This is diagnostic output,
 * not error handling — nothing downstream branches on it.
 */
export function warn(scope: string, message: string, detail?: unknown): void {
  if (detail === undefined) console.warn(`[flappytone/${scope}] ${message}`);
  else console.warn(`[flappytone/${scope}] ${message}`, detail);
}

const URL = import.meta.env.VITE_SUPABASE_URL;
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * The client is cached on `globalThis`, not just in a module variable.
 *
 * Vite's HMR re-evaluates this module on every edit, and a plain module-level
 * variable is re-initialised each time — so each edit built a second client
 * over the same storage key, which is what GoTrue's "Multiple GoTrueClient
 * instances detected" warning is about. Production never hot-reloads, so this
 * only matters in dev; it costs one property to be right in both.
 */
const CACHE = Symbol.for("flappytone.supabase");
interface ClientCache {
  client: FlappyToneClient | null;
  attempted: boolean;
}
const cache = ((globalThis as Record<symbol, unknown>)[CACHE] ??= {
  client: null,
  attempted: false,
}) as ClientCache;

/**
 * The client, or `null` when the project isn't configured — which is the
 * normal state of a `.env.local`-less checkout, so callers must handle it
 * rather than assume a client exists.
 */
export function getSupabase(): FlappyToneClient | null {
  if (cache.attempted) return cache.client;
  cache.attempted = true;
  if (!URL || !PUBLISHABLE_KEY) {
    warn(
      "supabase",
      "no client: VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY are unset. The leaderboard will be silently absent.",
    );
    return null;
  }
  try {
    cache.client = createClient<Database>(URL, PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  } catch (err) {
    warn("supabase", "createClient failed", err);
    cache.client = null;
  }
  return cache.client;
}

/** The current session without creating one. Used to answer "am I signed in
 * yet?" on paths that must not mint an identity as a side effect. */
export async function currentSession(): Promise<Session | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session;
  } catch {
    return null;
  }
}

