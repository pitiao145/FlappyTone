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
 * Progress (brief 05): the server owns an account's stats. A guest's local
 * progress is ADDED to the account once, on the guest -> account step
 * (`adoptGuestProgress`, idempotent by an adopt id), and from then on the
 * device's stores are only a cache of the server (`stats.ts`). There is no
 * max-merge any more: it lost a second device's runs (brief 04).
 *
 * Same contract as the rest of `src/data/`: nothing throws. A failed adoption
 * keeps its snapshot and retries on the next sync; the guest's numbers are
 * never cleared before the server confirmed it holds them.
 */
import { APP_PATH } from "../ui/appLink.ts";
import {
  clearRunHistory,
  hasGuestProgress,
  lifetimeTargetStats,
  loadRunHistory,
} from "../game/runHistory.ts";
import { clearStreak, loadStreakState } from "../game/streak.ts";
import { displayName, setLocalDisplayName } from "./leaderboard.ts";
import { bumpSessionVersion } from "./sessionVersion.ts";
import { flushRunOutbox } from "./runlog.ts";
import { ensureProfile, refreshServerStats } from "./stats.ts";

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
    await snapshotGuestProgress();
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

/**
 * Signs up with a password, upgrading an anonymous player in place.
 *
 * Same trap as `startEmailSignIn`: an anonymous player must go through
 * `updateUser({ email, password })`, never `signUp`, or they get a *second*
 * user id and their scores stay behind on the first one. Email confirmation
 * is off for this project, so the account is permanent the instant this
 * resolves — no redirect to configure.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
  marketingConsent: boolean,
): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: "no Supabase client" };
  const trimmed = email.trim();
  if (!trimmed) return { ok: false, reason: "no email given" };
  if (password.length < 8) return { ok: false, reason: "password must be at least 8 characters" };

  try {
    await snapshotGuestProgress();
    const account = await getAccount();
    const { error } =
      account.status === "anonymous"
        ? await supabase.auth.updateUser({ email: trimmed, password })
        : await supabase.auth.signUp({ email: trimmed, password });
    if (error) {
      warn("account", `password sign-up failed: ${error.message}`);
      return { ok: false, reason: error.message };
    }

    // The session token minted before this call still carries the old
    // `is_anonymous` claim baked in — RLS reads that claim, not the row, so
    // every write looks like it's coming from the anonymous user until a
    // fresh token is fetched. Must happen before syncAccount, which writes to
    // permanent-only tables.
    await supabase.auth.refreshSession();

    const synced = await syncAccount();
    if (!synced.ok) warn("account", `post-signup sync failed: ${synced.reason}`);

    await recordMarketingConsent(marketingConsent);
    return { ok: true };
  } catch (err) {
    warn("account", "password sign-up threw", err);
    return { ok: false, reason: "network error" };
  }
}

/** Second-device / returning-player sign-in. Any guest progress on this
 * device is added to the account once (`snapshotGuestProgress`). */
export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: "no Supabase client" };
  const trimmed = email.trim();
  if (!trimmed) return { ok: false, reason: "no email given" };
  if (!password) return { ok: false, reason: "no password given" };

  try {
    await snapshotGuestProgress();
    const { error } = await supabase.auth.signInWithPassword({ email: trimmed, password });
    if (error) {
      warn("account", `password sign-in failed: ${error.message}`);
      return { ok: false, reason: error.message };
    }
    const synced = await syncAccount();
    if (!synced.ok) warn("account", `post-signin sync failed: ${synced.reason}`);
    return { ok: true };
  } catch (err) {
    warn("account", "password sign-in threw", err);
    return { ok: false, reason: "network error" };
  }
}

/** Sends a password-reset email. Needs an explicit redirect for the same
 * reason `startEmailSignIn` does — an unset one lands the tokens on `/`. */
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: "no Supabase client" };
  const trimmed = email.trim();
  if (!trimmed) return { ok: false, reason: "no email given" };

  try {
    const redirect = new URL(APP_PATH, window.location.origin).toString();
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo: redirect });
    if (error) {
      warn("account", `password reset request failed: ${error.message}`);
      return { ok: false, reason: error.message };
    }
    return { ok: true };
  } catch (err) {
    warn("account", "password reset request threw", err);
    return { ok: false, reason: "network error" };
  }
}

/**
 * Sets a new password from a recovery session (opened by the reset-password
 * link, which puts Supabase into a `PASSWORD_RECOVERY` state — see
 * `GameApp.tsx`). Same validation as signup, same never-throw contract.
 */
export async function updatePassword(password: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: "no Supabase client" };
  if (password.length < 8) return { ok: false, reason: "password must be at least 8 characters" };

  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      warn("account", `password update failed: ${error.message}`);
      return { ok: false, reason: error.message };
    }
    return { ok: true };
  } catch (err) {
    warn("account", "password update threw", err);
    return { ok: false, reason: "network error" };
  }
}

/**
 * Records marketing consent on the player's profile row. A player who never
 * joined the leaderboard has no `profiles` row yet — only `joinBoard()`
 * creates one otherwise — so this establishes the row first (insert-only,
 * `ignoreDuplicates`, same as `joinBoard`/`pushAggregates`) and then updates
 * only the consent columns. Never a plain upsert of the whole row: that would
 * carry `display_name` along and could overwrite an existing name with this
 * device's locally cached one. Never throws, never blocks account creation on
 * the newsletter call.
 */
export async function recordMarketingConsent(consented: boolean): Promise<void> {
  const supabase = getSupabase();
  const account = await getAccount();
  if (!supabase || !account.userId) return;
  try {
    const { error: ensureError } = await supabase
      .from("profiles")
      .upsert(
        { id: account.userId, display_name: displayName() },
        { onConflict: "id", ignoreDuplicates: true },
      );
    if (ensureError) warn("account", `could not create the profile row: ${ensureError.message}`);

    const { error } = await supabase
      .from("profiles")
      .update({
        marketing_consent: consented,
        marketing_consent_at: consented ? new Date().toISOString() : null,
      })
      .eq("id", account.userId);
    if (error) warn("account", `could not record marketing consent: ${error.message}`);
  } catch (err) {
    warn("account", "could not record marketing consent", err);
  }

  if (!consented) return;
  try {
    await fetch("/api/newsletter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: account.email, source: "earlybird" }),
    });
  } catch (err) {
    warn("account", "newsletter subscribe failed", err);
  }
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
    // The stats on this device were the account's cache, not guest progress:
    // a guest starts fresh, and the account's numbers stay on the server.
    // Left in place they would mix with the guest's own runs.
    clearRunHistory();
    clearStreak();
    // Every surface reading account-derived data needs to re-read and fall
    // back to guest — see `sessionVersion.ts`.
    bumpSessionVersion();
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
    // The board name is cached locally (`displayName()` reads it without a
    // round trip); without this, a rename shows nowhere until the next sync.
    setLocalDisplayName(trimmed);
    bumpSessionVersion();
    return { ok: true };
  } catch (err) {
    warn("account", "rename threw", err);
    return { ok: false, reason: "network error" };
  }
}

const ADOPT_KEY = "toneflap.adopt.v1";

/** A guest's local totals, frozen at the guest -> account step, waiting to be added once. */
export interface GuestSnapshot {
  adoptId: string;
  /** True once a POST was tried: the id must then be kept, the server may hold it. */
  attempted: boolean;
  runs: number;
  gates: number;
  best: number;
  streakCurrent: number;
  streakBest: number;
  streakLastDay: string | null;
  per_key: Record<string, { gates: number; accSum: number; unheard: number; best: number }>;
  wordIds: string[];
}

export function loadGuestSnapshot(): GuestSnapshot | null {
  try {
    const raw = localStorage.getItem(ADOPT_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GuestSnapshot;
    return typeof s?.adoptId === "string" && typeof s.runs === "number" ? s : null;
  } catch {
    return null;
  }
}

function saveGuestSnapshot(s: GuestSnapshot | null): void {
  try {
    if (s) localStorage.setItem(ADOPT_KEY, JSON.stringify(s));
    else localStorage.removeItem(ADOPT_KEY);
  } catch {
    // Blocked storage: nothing to adopt survives, the guest numbers stay local.
  }
}

/**
 * Freezes this device's guest progress so the account it is about to become
 * (or sign into) adds it once. Only an unowned store counts — a store that is
 * already some account's cache is never added again. Called before the auth
 * call, while the session is still the guest's. A snapshot already tried is
 * kept as is (the server may hold its id).
 */
export async function snapshotGuestProgress(): Promise<void> {
  try {
    if ((await getAccount()).status === "permanent") return;
    const prev = loadGuestSnapshot();
    if (prev?.attempted) return;
    const store = loadRunHistory();
    const streak = loadStreakState();
    if (!hasGuestProgress(store) && streak.current === 0 && streak.best === 0) return;
    const per_key: GuestSnapshot["per_key"] = {};
    for (const t of lifetimeTargetStats(store)) {
      if (t.attempts + t.unheard < 1) continue;
      per_key[t.target] = {
        gates: t.attempts,
        accSum: Math.min(Math.max(t.accSum, 0), t.attempts),
        unheard: t.unheard,
        best: Math.min(Math.max(t.best, 0), 1),
      };
    }
    saveGuestSnapshot({
      adoptId: crypto.randomUUID(),
      attempted: false,
      runs: store.totalRuns,
      gates: store.totalGates,
      best: Math.round(store.bestScore),
      streakCurrent: streak.current,
      streakBest: streak.best,
      streakLastDay: streak.lastPlayedDate || null,
      per_key,
      wordIds: store.wordIds.filter((w) => /^[a-z0-9_]{1,40}$/.test(w)),
    });
  } catch (err) {
    warn("account", "could not snapshot guest progress", err);
  }
}

/**
 * Adds a waiting guest snapshot to the signed-in account, once. On the
 * server's answer (applied, or already applied) the snapshot and the guest
 * stores are cleared; the next refresh fills the stores as the account's
 * cache. On a network failure everything stays for the next sync.
 */
export async function adoptGuestProgress(): Promise<boolean> {
  const snap = loadGuestSnapshot();
  if (!snap) return false;
  const supabase = getSupabase();
  const account = await getAccount();
  if (!supabase || account.status !== "permanent" || !account.userId) return false;
  try {
    saveGuestSnapshot({ ...snap, attempted: true });
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return false;
    const { attempted: _attempted, ...adopt } = snap;
    const res = await fetch("/api/runlog", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ kind: "adopt", adopt }),
    });
    if (res.status === 400) {
      // Never valid (out of bounds): keep the guest numbers local, stop retrying.
      warn("account", "guest progress was refused by the server");
      saveGuestSnapshot(null);
      return false;
    }
    if (!res.ok) {
      warn("account", `adopting guest progress failed: ${res.status}`);
      return false;
    }
    saveGuestSnapshot(null);
    clearRunHistory();
    clearStreak();
    return true;
  } catch (err) {
    warn("account", "adopting guest progress failed", err);
    return false;
  }
}

/**
 * Brings this device up to date with the account. Runs on signup, sign-in and
 * app load: adds any waiting guest progress (once), posts any run still in
 * the outbox, then replaces the local cache with the server's numbers.
 */
export async function syncAccount(): Promise<AuthResult> {
  const account = await getAccount();
  if (account.status !== "permanent" || !account.userId) {
    return { ok: false, reason: "sync needs an account" };
  }
  if (!(await ensureProfile(account.userId))) return { ok: false, reason: "could not create the profile row" };
  await adoptGuestProgress();
  await flushRunOutbox();
  const refreshed = await refreshServerStats();
  if (!refreshed.ok) return { ok: false, reason: "could not read account stats" };

  // Name flows down only, never up: the server already has this player's real
  // name (set at signup, or renamed since on another device), so the local
  // cache adopts it. Only `renameAccount()` may change the server's `display_name`.
  if (refreshed.displayName) {
    setLocalDisplayName(refreshed.displayName);
    bumpSessionVersion();
  }
  return { ok: true };
}
