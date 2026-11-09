/**
 * Accounts: sign-up, log-in, sign-out, rename, and keeping this browser in
 * step with the account.
 *
 * `/app` needs a permanent account (brief 24): there are no guests in the
 * game. A signed-out visitor, or an old anonymous session, sees the auth
 * screen, and every flow here signs the player in to their own account
 * (email code, Google, password). Nothing upgrades an anonymous row or adopts
 * guest progress any more (removed after brief 34).
 *
 * Progress (brief 05): the server owns an account's stats, and this browser
 * only keeps a cache of them (`stats.ts`). Everything the browser saves is
 * per account (brief 34, `src/lib/accountStorage.ts`).
 *
 * Same contract as the rest of `src/data/`: nothing throws.
 */
import { APP_PATH } from "../ui/appLink.ts";
import { displayName, setLocalDisplayName } from "./leaderboard.ts";
import { noteAccount } from "./accountScope.ts";
import { bumpSessionVersion } from "./sessionVersion.ts";
import { flushRunOutbox } from "./runlog.ts";
import { ensureProfile, refreshServerStats } from "./stats.ts";
import { syncUsageAnalytics } from "./usageAnalytics.ts";

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

export type CodeStartResult = { ok: true } | { ok: false; reason: string; code?: string };

/**
 * Sends the 6-digit sign-in code (brief 30). The same email also carries the
 * magic link (same redirect), so either one signs the player in.
 * `signInWithOtp` creates the account when the email is new
 * (`shouldCreateUser`), so the screen never asks "do you have an account?".
 */
export async function startEmailCode(email: string): Promise<CodeStartResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: "no Supabase client" };
  const trimmed = email.trim();
  if (!trimmed) return { ok: false, reason: "no email given" };

  try {
    // Must say where to come back to. Without an explicit redirect Supabase
    // falls back to the project's Site URL, which is `/` — the marketing
    // entry, which ships no Supabase code at all. The tokens would land on a
    // page with nothing to read them, and the player would stay signed out.
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: appRedirect(), shouldCreateUser: true },
    });
    if (error) {
      warn("account", `email code failed: ${error.message}`);
      return fail(error);
    }
    return { ok: true };
  } catch (err) {
    warn("account", "email code threw", err);
    return { ok: false, reason: "network error" };
  }
}

export type VerifyResult =
  | { ok: true; createdAt: string | null }
  | { ok: false; reason: string; code?: string };

/**
 * Checks the emailed code and finishes the sign-in: the account sync, then
 * the marketing consent. Never throws.
 */
export async function verifyEmailCode(
  email: string,
  token: string,
  marketingConsent: boolean,
): Promise<VerifyResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: "no Supabase client" };
  const trimmed = email.trim();
  const code = token.replace(/\D/g, "");
  if (!trimmed) return { ok: false, reason: "no email given" };
  if (code.length < 6) return { ok: false, reason: "enter the 6-digit code", code: "code_too_short" };

  try {
    const { error } = await supabase.auth.verifyOtp({ email: trimmed, token: code, type: "email" });
    if (error) {
      warn("account", `code check failed: ${error.message}`);
      return fail(error);
    }
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
 */
export async function startGoogleSignIn(): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: "no Supabase client" };
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: appRedirect() },
    });
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
 * Signs up with a password. Email confirmation is off for this project, so
 * the account is permanent the instant this resolves — no redirect to
 * configure.
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
    const { error } = await supabase.auth.signUp({ email: trimmed, password });
    if (error) {
      warn("account", `password sign-up failed: ${error.message}`);
      return { ok: false, reason: error.message };
    }

    const synced = await syncAccount();
    if (!synced.ok) warn("account", `post-signup sync failed: ${synced.reason}`);

    await recordMarketingConsent(marketingConsent);
    return { ok: true };
  } catch (err) {
    warn("account", "password sign-up threw", err);
    return { ok: false, reason: "network error" };
  }
}

/** Second-device / returning-player sign-in. */
export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: "no Supabase client" };
  const trimmed = email.trim();
  if (!trimmed) return { ok: false, reason: "no email given" };
  if (!password) return { ok: false, reason: "no password given" };

  try {
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
 * reason `startEmailCode` does — an unset one lands the tokens on `/`. */
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
    // The browser now holds no account. Everything it saved stays under the
    // account's own keys (brief 34), ready for when it signs in again.
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

/**
 * Brings this device up to date with the account. Runs on signup, sign-in and
 * app load: settles the "Usage analytics" switch, posts any run still in the
 * outbox, then replaces the local cache with the server's numbers.
 */
export async function syncAccount(): Promise<AuthResult> {
  const account = await getAccount();
  if (account.status !== "permanent" || !account.userId) {
    return { ok: false, reason: "sync needs an account" };
  }
  // Scopes this browser's storage to the account first (brief 34), so
  // nothing below reads or writes another account's values.
  noteAccount(account.userId);
  const profiled = await ensureProfile(account.userId);
  // The "Usage analytics" switch (brief 35): `/app` sends nothing until this
  // has read the account's value. Runs even without the row (the account
  // then counts as on, the default) so a page is never left waiting.
  await syncUsageAnalytics(account.userId);
  if (!profiled) return { ok: false, reason: "could not create the profile row" };
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
