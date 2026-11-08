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
 * `/app` needs a permanent account since brief 24: there are no guests in the
 * game any more. The guest -> account paths below (`snapshotGuestProgress`,
 * `adoptGuestProgress`, the anonymous in-place upgrade) stay for an old
 * anonymous session that comes back, and are kept until a brief removes them.
 *
 * Progress (brief 05): the server owns an account's stats. Local guest
 * progress is ADDED to the account once (`adoptGuestProgress`, idempotent by
 * an adopt id), and from then on the device's stores are only a cache of the
 * server (`stats.ts`). There is no max-merge any more: it lost a second
 * device's runs (brief 04). Browser-side values that belong to one account
 * carry its id (brief 34, `accountScope.ts`).
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
import { noteAccount } from "./accountScope.ts";
import { bumpSessionVersion } from "./sessionVersion.ts";
import { flushRunOutbox } from "./runlog.ts";
import { ensureProfile, refreshServerStats } from "./stats.ts";

import { currentSession, getSupabase, warn } from "./supabase.ts";

export type AccountStatus = "signed-out" | "anonymous" | "permanent";

export interface Account {
  status: AccountStatus;
  userId: string | null;
  email: string | null;
  /** When the auth user row was created (ISO), used to tell a new account from a login. */
  createdAt?: string | null;
}

/** Who the player currently is. Never creates a session as a side effect. */
export async function getAccount(): Promise<Account> {
  const session = await currentSession();
  const user = session?.user;
  if (!user) return { status: "signed-out", userId: null, email: null, createdAt: null };
  return {
    status: user.is_anonymous ? "anonymous" : "permanent",
    userId: user.id,
    email: user.email ?? null,
    createdAt: user.created_at ?? null,
  };
}

/** `code` is Supabase's machine-readable error code, when it gave one. */
export type AuthResult = { ok: true } | { ok: false; reason: string; code?: string };

function fail(error: { message: string; code?: string }): { ok: false; reason: string; code?: string } {
  return error.code ? { ok: false, reason: error.message, code: error.code } : { ok: false, reason: error.message };
}

/** The `/app` URL every email and OAuth flow comes back to (see `startEmailSignIn`). */
function appRedirect(): string {
  return new URL(APP_PATH, window.location.origin).toString();
}

/**
 * Which `verifyOtp` type the emailed code needs. It follows from the call that
 * sent it: `updateUser({ email })` sends an email-change code, verified with
 * `type: "email_change"`; `signInWithOtp` sends a sign-in code, verified with
 * `type: "email"` (Supabase docs, auth-js `EmailOtpType`).
 */
export type EmailCodeType = "email" | "email_change";

export type CodeStartResult =
  | { ok: true; otpType: EmailCodeType }
  | { ok: false; reason: string; code?: string };

/**
 * Sends the 6-digit sign-in code (brief 30), choosing the flow that preserves
 * the player's identity. The same email also carries the old magic link
 * (same redirect), so either one signs the player in.
 *
 * For an anonymous player this is `updateUser({ email })`, which attaches the
 * address to the row they already have — that is the in-place upgrade the
 * whole architecture depends on. `signInWithOtp` would instead sign them into
 * a *different* user, silently abandoning the anonymous one along with its
 * scores, which is the single most damaging mistake available in this file.
 * If the address already belongs to another account this fails with
 * `email_exists`; the screen then asks before `startExistingAccountCode`.
 *
 * A player with no session at all uses `signInWithOtp`, which creates the
 * account when the email is new (`shouldCreateUser`), so the screen never
 * asks "do you have an account?".
 */
export async function startEmailCode(email: string): Promise<CodeStartResult> {
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
    const redirect = appRedirect();
    const account = await getAccount();
    if (account.status === "anonymous") {
      const { error } = await supabase.auth.updateUser({ email: trimmed }, { emailRedirectTo: redirect });
      if (error) {
        warn("account", `email code (upgrade) failed: ${error.message}`);
        return fail(error);
      }
      return { ok: true, otpType: "email_change" };
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: redirect, shouldCreateUser: true },
    });
    if (error) {
      warn("account", `email code failed: ${error.message}`);
      return fail(error);
    }
    return { ok: true, otpType: "email" };
  } catch (err) {
    warn("account", "email code threw", err);
    return { ok: false, reason: "network error" };
  }
}

/**
 * Sends a sign-in code to an address that already has an account, even from
 * an anonymous session. Only called after the player chose "sign in to that
 * account" (the in-place upgrade failed with `email_exists`): the guest's
 * progress is already snapshotted and is added to that account on sync.
 */
export async function startExistingAccountCode(email: string): Promise<CodeStartResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: "no Supabase client" };
  const trimmed = email.trim();
  if (!trimmed) return { ok: false, reason: "no email given" };
  try {
    await snapshotGuestProgress();
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: appRedirect(), shouldCreateUser: false },
    });
    if (error) {
      warn("account", `existing-account code failed: ${error.message}`);
      return fail(error);
    }
    return { ok: true, otpType: "email" };
  } catch (err) {
    warn("account", "existing-account code threw", err);
    return { ok: false, reason: "network error" };
  }
}

/** Older callers (AccountCard): sends the code + link, nothing more. */
export async function startEmailSignIn(email: string): Promise<AuthResult> {
  const r = await startEmailCode(email);
  return r.ok ? { ok: true } : r;
}

export type VerifyResult =
  | { ok: true; createdAt: string | null }
  | { ok: false; reason: string; code?: string };

/**
 * Checks the emailed code and finishes the sign-in: a fresh token (the
 * upgrade's old one still says `is_anonymous`), the account sync (adopts the
 * guest snapshot), then the marketing consent. Never throws.
 */
export async function verifyEmailCode(
  email: string,
  token: string,
  otpType: EmailCodeType,
  marketingConsent: boolean,
): Promise<VerifyResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: "no Supabase client" };
  const trimmed = email.trim();
  const code = token.replace(/\D/g, "");
  if (!trimmed) return { ok: false, reason: "no email given" };
  if (code.length < 6) return { ok: false, reason: "enter the 6-digit code", code: "code_too_short" };

  try {
    const { error } = await supabase.auth.verifyOtp({ email: trimmed, token: code, type: otpType });
    if (error) {
      warn("account", `code check failed: ${error.message}`);
      return fail(error);
    }
    if (otpType === "email_change") await supabase.auth.refreshSession();
    const synced = await syncAccount();
    if (!synced.ok) warn("account", `post-code sync failed: ${synced.reason}`);
    if (marketingConsent) await recordMarketingConsent(true);
    return { ok: true, createdAt: (await getAccount()).createdAt ?? null };
  } catch (err) {
    warn("account", "code check threw", err);
    return { ok: false, reason: "network error" };
  }
}

/**
 * Starts "Continue with Google" (brief 30). The browser leaves for Google and
 * comes back to `/app`, where `AuthGate` sees the new session.
 *
 * An anonymous player links Google to the row they already have
 * (`linkIdentity`, needs manual linking enabled in Supabase), never
 * `signInWithOAuth`, for the same reason as `startEmailCode`. If that Google
 * account already belongs to someone else, Supabase sends the player back
 * with `identity_already_exists`; the screen explains it and offers
 * `{ existing: true }`, an explicit sign-in to that account (guest progress
 * snapshotted first, adopted on sync).
 */
export async function startGoogleSignIn(opts: { existing?: boolean } = {}): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: "no Supabase client" };
  try {
    await snapshotGuestProgress();
    const options = { redirectTo: appRedirect() };
    const account = await getAccount();
    const { error } =
      account.status === "anonymous" && !opts.existing
        ? await supabase.auth.linkIdentity({ provider: "google", options })
        : await supabase.auth.signInWithOAuth({ provider: "google", options });
    if (error) {
      warn("account", `Google sign-in failed: ${error.message}`);
      return fail(error);
    }
    return { ok: true };
  } catch (err) {
    warn("account", "Google sign-in threw", err);
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
    const redirect = appRedirect();
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
        { id: account.userId, display_name: displayName(account.userId) },
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
    // The stats on this device were the account's cache: the account's
    // numbers stay on the server, and the next account must not see them.
    clearRunHistory();
    clearStreak();
    // The browser now holds no account (brief 34). The name, daily counts and
    // intents keep their owner, so they need no clearing here.
    noteAccount(null);
    // Every surface reading account-derived data needs to re-read — see
    // `sessionVersion.ts`.
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
    setLocalDisplayName(trimmed, account.userId);
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
  // Runs the account-change steps first when this browser held another
  // account (brief 34), so nothing below reads or writes that account's values.
  noteAccount(account.userId);
  if (!(await ensureProfile(account.userId))) return { ok: false, reason: "could not create the profile row" };
  await adoptGuestProgress();
  await flushRunOutbox();
  const refreshed = await refreshServerStats();
  if (!refreshed.ok) return { ok: false, reason: "could not read account stats" };

  // Name flows down only, never up: the server already has this player's real
  // name (set at signup, or renamed since on another device), so the local
  // cache adopts it. Only `renameAccount()` may change the server's `display_name`.
  if (refreshed.displayName) {
    setLocalDisplayName(refreshed.displayName, account.userId);
    bumpSessionVersion();
  }
  return { ok: true };
}
