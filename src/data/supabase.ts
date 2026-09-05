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
  if (!URL || !PUBLISHABLE_KEY) return null;
  try {
    client = createClient<Database>(URL, PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  } catch {
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
      console.error("[supabase] anonymous sign-in failed", error.message);
      return null;
    }
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}
