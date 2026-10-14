/**
 * An account's progress, read from the server (brief 05). The server owns it:
 * `api/runlog.ts` adds every run, and this module reads the result back into
 * the local render cache (`runHistory.ts`'s `cacheFromServer`, `streak.ts`'s
 * `cacheStreakFromServer`), so every device shows the same numbers.
 *
 * Never throws (the `src/data/` contract): a failed read leaves the cache as
 * it was and returns null.
 */
import { cacheFromServer, type ServerRunRow, type ServerStats } from "../game/runHistory.ts";
import { cacheStreakFromServer } from "../game/streak.ts";
import { displayName } from "./leaderboard.ts";
import { bumpSessionVersion } from "./sessionVersion.ts";
import { currentSession, getSupabase, warn } from "./supabase.ts";

/** The modes and outcomes whose runs count toward stats — mirrors `api/runlog.ts`'s `runFlags`. */
export const COUNTED_MODES = ["game", "drill", "pairs"] as const;
export const COUNTED_OUTCOMES = ["finished", "out_of_hearts", "quit"] as const;

const RUN_COLUMNS = "played_at, score, gates, outcome, per_key";

export interface AccountStats extends ServerStats {
  streakCurrent: number;
  streakBest: number;
  /** The account's last counted streak day (YYYY-MM-DD), or null. */
  streakLastDay: string | null;
}

/** The permanent account's user id, or null for a guest/anonymous session. */
export async function accountUserId(): Promise<string | null> {
  const user = (await currentSession())?.user;
  return user && !user.is_anonymous ? user.id : null;
}

/**
 * Makes sure the account has a `profiles` row: `run_log` and the stat
 * columns hang off it, and only joining the board created one before.
 * Insert-only (`ignoreDuplicates`), so it never touches an existing name —
 * which would trip the Pro-only rename trigger.
 */
export async function ensureProfile(userId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: userId, display_name: displayName() }, { onConflict: "id", ignoreDuplicates: true });
    if (error) warn("stats", `could not create the profile row: ${error.message}`);
    return !error;
  } catch (err) {
    warn("stats", "could not create the profile row", err);
    return false;
  }
}

/** The account's latest `limit` counted runs, newest first; empty on any failure. */
export async function fetchRecentRuns(limit: number): Promise<ServerRunRow[]> {
  try {
    const supabase = getSupabase();
    const userId = await accountUserId();
    if (!supabase || !userId) return [];
    const { data, error } = await supabase
      .from("run_log")
      .select(RUN_COLUMNS)
      .eq("user_id", userId)
      .in("mode", [...COUNTED_MODES])
      .in("outcome", [...COUNTED_OUTCOMES])
      .order("played_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as unknown as ServerRunRow[];
  } catch (err) {
    warn("stats", "recent runs read failed", err);
    return [];
  }
}

/** Everything Progress shows for an account; null when signed out or on any failure. */
export async function fetchServerStats(): Promise<(AccountStats & { userId: string; displayName: string | null }) | null> {
  const supabase = getSupabase();
  const userId = await accountUserId();
  if (!supabase || !userId) return null;
  try {
    const [profile, tones, recent] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "best_score, total_runs, total_gates, streak_current, streak_best, streak_last_day, words_played, display_name",
        )
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("tone_accuracy_stats")
        .select("target, attempts, unheard, sum_accuracy, best_accuracy")
        .eq("user_id", userId),
      fetchRecentRuns(5),
    ]);
    if (profile.error || tones.error) {
      warn("stats", `could not read account stats: ${(profile.error ?? tones.error)?.message}`);
      return null;
    }
    const p = profile.data;
    return {
      userId,
      displayName: p?.display_name ?? null,
      totalRuns: p?.total_runs ?? 0,
      bestScore: p?.best_score ?? 0,
      totalGates: p?.total_gates ?? 0,
      wordIds: p?.words_played ?? [],
      streakCurrent: p?.streak_current ?? 0,
      streakBest: p?.streak_best ?? 0,
      streakLastDay: p?.streak_last_day ?? null,
      perTarget: (tones.data ?? []).map((t) => ({
        target: t.target,
        attempts: Number(t.attempts),
        unheard: Number(t.unheard),
        accSum: t.sum_accuracy,
        best: t.best_accuracy,
      })),
      recent,
    };
  } catch (err) {
    warn("stats", "could not read account stats", err);
    return null;
  }
}

/**
 * Reads the account's stats and replaces the local cache with them, then
 * tells subscribed screens to re-read. Returns the server name (or null) for
 * the caller; false-y on any failure, with the cache untouched.
 */
export async function refreshServerStats(): Promise<{ ok: boolean; displayName: string | null }> {
  const stats = await fetchServerStats();
  if (!stats) return { ok: false, displayName: null };
  cacheFromServer(stats, stats.userId);
  cacheStreakFromServer({ current: stats.streakCurrent, best: stats.streakBest, lastDay: stats.streakLastDay });
  bumpSessionVersion();
  return { ok: true, displayName: stats.displayName };
}
