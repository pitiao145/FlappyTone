/**
 * Accounts: turning an anonymous player into a permanent one, and carrying
 * their stats with them.
 *
 * The whole design rests on one Supabase behaviour. A player has been a real
 * `auth.users` row since the moment they joined the board — anonymous, but
 * real — so adding an email **upgrades that same row** rather than creating a
 * second one. Their user id never changes, which means their leaderboard
 * history, their profile and their stats are already theirs. There is no
 * "claim your guest data" step to write, and no window where a player owns two
 * identities.
 *
 * Accounts are a Pro feature and the UI is dev-gated, so nothing here is
 * reachable by a player yet. This is the plumbing, built ahead of the product.
 *
 * Same contract as the rest of `src/data/`: nothing throws. A sync that fails
 * leaves the local stats untouched and authoritative, which is the safe
 * direction — localStorage is where an anonymous player's progress lives, and
 * a failed upload must never be able to erase it.
 */
import { APP_PATH } from "../ui/appLink.ts";
import { lifetimeToneStats, loadRunHistory, mergeIntoRunHistory } from "../game/runHistory.ts";
import { loadStreak, mergeStreak } from "../game/streak.ts";
import type { Tone } from "../game/gates.ts";

import { currentSession, getSupabase, warn } from "./supabase.ts";

export type AccountStatus = "signed-out" | "anonymous" | "permanent";

export interface Account {
  status: AccountStatus;
  userId: string | null;
  email: string | null;
}

/** Who the player currently is. Never creates a session as a side effect. */
export async function getAccount(): Promise<Account> {
  const session = await currentSession();
  const user = session?.user;
  if (!user) return { status: "signed-out", userId: null, email: null };
  return {
    status: user.is_anonymous ? "anonymous" : "permanent",
    userId: user.id,
    email: user.email ?? null,
  };
}

export type AuthResult = { ok: true } | { ok: false; reason: string };

/**
 * Starts the email sign-in, choosing the flow that preserves the player's
 * identity.
 *
 * For an anonymous player this is `updateUser({ email })`, which attaches the
 * address to the row they already have — that is the in-place upgrade the
 * whole architecture depends on. `signInWithOtp` would instead sign them into
 * a *different* user, silently abandoning the anonymous one along with its
 * scores, which is the single most damaging mistake available in this file.
 *
 * A player with no session at all (a fresh browser signing back in) does use
 * `signInWithOtp`, because there is no local identity worth preserving.
 *
 * Either way the player confirms by clicking a link in their inbox; nothing is
 * final until they do.
 */
export async function startEmailSignIn(email: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: "no Supabase client" };
  const trimmed = email.trim();
  if (!trimmed) return { ok: false, reason: "no email given" };

  try {
    // Both paths must say where to come back to. Without an explicit redirect
    // Supabase falls back to the project's Site URL, which is `/` — the
    // marketing entry, which deliberately ships no Supabase code at all (see
    // CLAUDE.md's landing/game split). The confirmation would still succeed on
    // the server, but the tokens would land on a page with nothing to read
    // them, and the player would return to the game still signed out.
    const redirect = new URL(APP_PATH, window.location.origin).toString();
    const account = await getAccount();
    const { error } =
      account.status === "anonymous"
        ? await supabase.auth.updateUser({ email: trimmed }, { emailRedirectTo: redirect })
        : await supabase.auth.signInWithOtp({
            email: trimmed,
            options: { emailRedirectTo: redirect },
          });
    if (error) {
      warn("account", `email sign-in failed: ${error.message}`);
      return { ok: false, reason: error.message };
    }
    return { ok: true };
  } catch (err) {
    warn("account", "email sign-in threw", err);
    return { ok: false, reason: "network error" };
  }
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch (err) {
    warn("account", "sign-out failed", err);
  }
}

/**
 * Changes the player's board name.
 *
 * Only permanent accounts may do this — renaming is a Pro feature, and the
 * `prof_update` policy enforces it on the `is_anonymous` claim rather than
 * trusting this function to be the only caller.
 */
export async function renameAccount(name: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: "no Supabase client" };
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 24) {
    return { ok: false, reason: "a name must be 1–24 characters" };
  }
  const account = await getAccount();
  if (account.status !== "permanent" || !account.userId) {
    return { ok: false, reason: "renaming needs an account" };
  }
  try {
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: trimmed })
      .eq("id", account.userId);
    if (error) {
      warn("account", `rename failed: ${error.message}`);
      return { ok: false, reason: error.message };
    }
    return { ok: true };
  } catch (err) {
    warn("account", "rename threw", err);
    return { ok: false, reason: "network error" };
  }
}

/** The account-owned aggregates, in the shape both sides of the sync speak. */
export interface Aggregates {
  bestScore: number;
  totalRuns: number;
  totalGates: number;
  streakCurrent: number;
  streakBest: number;
  perTone: { tone: number; attempts: number; unheard: number; accSum: number; best: number }[];
}

/**
 * Merges two sets of aggregates by taking the larger of each.
 *
 * Merge-by-max is chosen over "newest wins" because these are all monotonic
 * records of things the player actually did: a count of runs, a best score, a
 * longest streak. Taking the max cannot lose an achievement, needs no clocks
 * to agree, and needs no conflict UI. It over-counts only if the same run is
 * somehow recorded on both sides, which is far cheaper than silently deleting
 * a week of practice from a second device.
 *
 * `streakCurrent` is the one field where max is arguable — two devices used on
 * different days are not really one longer streak — but the alternative needs
 * a trustworthy clock and a merge rule per calendar day, and being generous
 * about a streak is the harmless direction to be wrong in.
 */
export function mergeAggregates(a: Aggregates, b: Aggregates): Aggregates {
  const byTone = new Map<number, Aggregates["perTone"][number]>();
  for (const t of [...a.perTone, ...b.perTone]) {
    const prev = byTone.get(t.tone);
    byTone.set(
      t.tone,
      prev
        ? {
            tone: t.tone,
            attempts: Math.max(prev.attempts, t.attempts),
            unheard: Math.max(prev.unheard, t.unheard),
            accSum: Math.max(prev.accSum, t.accSum),
            best: Math.max(prev.best, t.best),
          }
        : { ...t },
    );
  }
  return {
    bestScore: Math.max(a.bestScore, b.bestScore),
    totalRuns: Math.max(a.totalRuns, b.totalRuns),
    totalGates: Math.max(a.totalGates, b.totalGates),
    streakCurrent: Math.max(a.streakCurrent, b.streakCurrent),
    streakBest: Math.max(a.streakBest, b.streakBest),
    perTone: [...byTone.values()].sort((x, y) => x.tone - y.tone),
  };
}

export const EMPTY_AGGREGATES: Aggregates = {
  bestScore: 0,
  totalRuns: 0,
  totalGates: 0,
  streakCurrent: 0,
  streakBest: 0,
  perTone: [],
};

/** Reads the account's aggregates back. Empty when signed out or anonymous. */
export async function fetchAggregates(): Promise<Aggregates> {
  const supabase = getSupabase();
  const account = await getAccount();
  if (!supabase || account.status !== "permanent" || !account.userId) {
    return EMPTY_AGGREGATES;
  }
  try {
    const [profile, tones] = await Promise.all([
      supabase
        .from("profiles")
        .select("best_score, total_runs, total_gates, streak_current, streak_best")
        .eq("id", account.userId)
        .maybeSingle(),
      supabase
        .from("tone_stats")
        .select("tone, attempts, unheard, sum_accuracy, best_accuracy")
        .eq("user_id", account.userId),
    ]);
    if (profile.error) {
      warn("account", `could not read profile aggregates: ${profile.error.message}`);
      return EMPTY_AGGREGATES;
    }
    return {
      bestScore: profile.data?.best_score ?? 0,
      totalRuns: profile.data?.total_runs ?? 0,
      totalGates: profile.data?.total_gates ?? 0,
      streakCurrent: profile.data?.streak_current ?? 0,
      streakBest: profile.data?.streak_best ?? 0,
      perTone: (tones.data ?? []).map((t) => ({
        tone: t.tone,
        attempts: Number(t.attempts),
        unheard: Number(t.unheard),
        accSum: t.sum_accuracy,
        best: t.best_accuracy,
      })),
    };
  } catch (err) {
    warn("account", "could not read account aggregates", err);
    return EMPTY_AGGREGATES;
  }
}

/** This device's own view of the aggregates, read from localStorage. */
export function localAggregates(): Aggregates {
  const history = loadRunHistory();
  const streak = loadStreak();
  return {
    bestScore: history.bestScore,
    totalRuns: history.totalRuns,
    totalGates: history.totalGates,
    streakCurrent: streak.current,
    streakBest: streak.best,
    perTone: lifetimeToneStats(history),
  };
}

/**
 * Reconciles this device with the account, in both directions.
 *
 * Runs on signup (uploading everything the player did while anonymous) and on
 * signing in elsewhere (pulling down what the account already knows). The two
 * are the same operation — merge by max, write the result to both sides —
 * which is why there is no separate "migrate my guest data" path to get wrong.
 *
 * Order matters on failure: the server is written first, and local is only
 * updated once that succeeded. A half-done sync therefore leaves the device
 * exactly as it was, still holding everything, rather than adopting server
 * values for progress that never made it up.
 */
export async function syncAccount(): Promise<AuthResult> {
  const account = await getAccount();
  if (account.status !== "permanent") {
    return { ok: false, reason: "sync needs an account" };
  }
  const local = localAggregates();
  const remote = await fetchAggregates();
  const merged = mergeAggregates(local, remote);

  const pushed = await pushAggregates(merged);
  if (!pushed.ok) return pushed;

  mergeIntoRunHistory({
    bestScore: merged.bestScore,
    totalRuns: merged.totalRuns,
    totalGates: merged.totalGates,
    perTone: merged.perTone.map((t) => ({ ...t, tone: t.tone as Tone })),
  });
  mergeStreak({ current: merged.streakCurrent, best: merged.streakBest });
  return { ok: true };
}

/** Writes merged aggregates up. Caller has already merged; this only stores. */
export async function pushAggregates(merged: Aggregates): Promise<AuthResult> {
  const supabase = getSupabase();
  const account = await getAccount();
  if (!supabase || account.status !== "permanent" || !account.userId) {
    return { ok: false, reason: "sync needs an account" };
  }
  const userId = account.userId;
  try {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        best_score: merged.bestScore,
        total_runs: merged.totalRuns,
        total_gates: merged.totalGates,
        streak_current: merged.streakCurrent,
        streak_best: merged.streakBest,
        synced_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (profileError) {
      warn("account", `could not save profile aggregates: ${profileError.message}`);
      return { ok: false, reason: profileError.message };
    }

    if (merged.perTone.length > 0) {
      const { error: toneError } = await supabase.from("tone_stats").upsert(
        merged.perTone.map((t) => ({
          user_id: userId,
          tone: t.tone,
          attempts: t.attempts,
          unheard: t.unheard,
          sum_accuracy: t.accSum,
          best_accuracy: t.best,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "user_id,tone" },
      );
      if (toneError) {
        warn("account", `could not save tone stats: ${toneError.message}`);
        return { ok: false, reason: toneError.message };
      }
    }
    return { ok: true };
  } catch (err) {
    warn("account", "could not save account aggregates", err);
    return { ok: false, reason: "network error" };
  }
}
