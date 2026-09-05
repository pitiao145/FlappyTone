/**
 * The one Supabase client, and the anonymous identity behind it.
 *
 * Two rules govern everything in `src/data/`:
 *
 * 1. **Nothing here may throw into a caller.** A leaderboard is a side dish;
 *    the game is the meal. A network failure, a paused free-tier project, or a
 *    missing env var must degrade to "no board today", never to a broken end
 *    screen. Same contract `src/share/share.ts` and `src/analytics/client.ts`
 *    already keep.
 * 2. **Sign-in is lazy.** `signInAnonymously()` runs the first time a player
 *    actually needs an identity — joining the board — not at app load. Most
 *    visitors never submit a score, and minting an `auth.users` row for each
 *    one fills the table with rows for people who left.
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

let client: FlappyToneClient | null = null;
let attempted = false;

/**
 * The client, or `null` when the project isn't configured — which is the
 * normal state of a `.env.local`-less checkout, so callers must handle it
 * rather than assume a client exists.
 */
export function getSupabase(): FlappyToneClient | null {
  if (attempted) return client;
  attempted = true;
  if (!URL || !PUBLISHABLE_KEY) {
    warn(
      "supabase",
      "no client: VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY are unset. The leaderboard will be silently absent.",
    );
    return null;
  }
  try {
    client = createClient<Database>(URL, PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  } catch (err) {
    warn("supabase", "createClient failed", err);
    client = null;
  }
  return client;
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

/**
 * The player's user id, signing them in anonymously if they have no session
 * yet. Returns `null` if that isn't possible — an unconfigured project, a
 * network failure, or anonymous sign-ins not enabled on the project.
 *
 * Concurrent callers share one in-flight request; without this, a screen that
 * mounted two components needing an identity would race and mint two users.
 */
let pendingSignIn: Promise<string | null> | null = null;

export function ensureAnonSession(): Promise<string | null> {
  pendingSignIn ??= signIn().finally(() => {
    pendingSignIn = null;
  });
  return pendingSignIn;
}

async function signIn(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const existing = await supabase.auth.getSession();
    if (existing.data.session) return existing.data.session.user.id;
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      // Overwhelmingly the cause is anonymous sign-ins not being enabled in
      // the project's Auth settings, which no amount of client code can fix.
      warn(
        "supabase",
        `anonymous sign-in failed: ${error.message}. Is "Anonymous sign-ins" enabled in Supabase Auth settings?`,
      );
      return null;
    }
    return data.user?.id ?? null;
  } catch (err) {
    warn("supabase", "anonymous sign-in threw", err);
    return null;
  }
}
