/**
 * Account state and actions, for development only.
 *
 * Accounts are a Pro feature that has not launched — a player today is always
 * anonymous. This card exists so the account plumbing in `src/data/account.ts`
 * (email upgrade in place, rename, sync) can be exercised from the real
 * Profile screen while it's built, without shipping any of it to players.
 * Gated at the mount site in `Profile.tsx` with a lazy import, same pattern as
 * `Lab`/`DevLogin` in `GameApp.tsx` — see CLAUDE.md hard rule 7.
 */
import { useEffect, useState } from "react";

import {
  getAccount,
  localAggregates,
  renameAccount,
  signOut,
  startEmailSignIn,
  syncAccount,
  type Account,
} from "../data/account.ts";
import { displayName } from "../data/leaderboard.ts";
import { getSupabase } from "../data/supabase.ts";

type Busy = "idle" | "sending" | "renaming" | "syncing";

export function AccountCard() {
  // Known synchronously so the first render doesn't need a state update in
  // an effect (react-hooks/set-state-in-effect), same trick as DevLogin.
  const [account, setAccount] = useState<Account | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<Busy>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let live = true;
    void getAccount().then((a) => {
      if (live) setAccount(a);
    });
    const supabase = getSupabase();
    if (!supabase) return;
    // A session issued before the email was confirmed still carries
    // `is_anonymous: true` — the claim is baked into the JWT, so upgrading the
    // user server-side does not change the token already in this browser. It
    // would correct itself on the next refresh, up to an hour later, which
    // looks exactly like the upgrade having failed. Asking for a fresh token on
    // mount collapses that wait to nothing.
    void supabase.auth.refreshSession();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void getAccount().then((a) => {
        if (live) setAccount(a);
      });
    });
    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("sending");
    setMessage("");
    const result = await startEmailSignIn(email);
    setBusy("idle");
    setMessage(result.ok ? "Check your inbox for the link." : result.reason);
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    setBusy("renaming");
    setMessage("");
    const result = await renameAccount(name);
    setBusy("idle");
    setMessage(result.ok ? "Name updated." : result.reason);
  }

  async function handleSync() {
    setBusy("syncing");
    setMessage("");
    const result = await syncAccount();
    setBusy("idle");
    setMessage(result.ok ? "Synced." : result.reason);
  }

  // Renders the shell even before the account resolves. Returning null here
  // meant that a slow read — or a lazy chunk that failed to load — left no
  // trace on the page at all, which reads as "the sign-in was never built"
  // rather than "it hasn't loaded yet".
  return (
    <section className="progress-card">
      <div className="progress-card-header">
        <h3>Account (dev)</h3>
        <span className="badge badge-free">{account?.status ?? "checking…"}</span>
      </div>

      {!account && <p className="note">Checking your account…</p>}

      {account?.status === "anonymous" && (
        <>
          <p className="note">On the board as {displayName()}</p>
          <p className="note">Adding an email keeps this account's scores — nothing is lost.</p>
          <form className="coming-soon-form" onSubmit={handleEmailSubmit}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email"
              required
            />
            <button type="submit" className="primary" disabled={busy === "sending"}>
              {busy === "sending" ? "Sending…" : "Add an email to save your progress"}
            </button>
          </form>
        </>
      )}

      {account?.status === "permanent" && (
        <>
          <p className="note">Signed in as {account.email}</p>
          <form className="coming-soon-form" onSubmit={handleRename}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={displayName()}
              aria-label="Board name"
            />
            <button type="submit" disabled={busy === "renaming"}>
              {busy === "renaming" ? "Saving…" : "Rename"}
            </button>
          </form>
          <p className="note">
            Local: {localAggregates().totalRuns} runs · {localAggregates().totalGates} gates ·
            best {localAggregates().bestScore}
          </p>
          <div className="row">
            <button type="button" onClick={() => void handleSync()} disabled={busy === "syncing"}>
              {busy === "syncing" ? "Syncing…" : "Sync now"}
            </button>
            <button type="button" className="link" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </>
      )}

      {account?.status === "signed-out" && (
        <>
          <p className="note">Signed out. Sign in with the email on your account.</p>
          <form className="coming-soon-form" onSubmit={handleEmailSubmit}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email"
              required
            />
            <button type="submit" className="primary" disabled={busy === "sending"}>
              {busy === "sending" ? "Sending…" : "Sign in"}
            </button>
          </form>
        </>
      )}

      {message && <p className="note">{message}</p>}
    </section>
  );
}
