/**
 * The account card: the board name and sign-out for the signed-in account.
 * Sign-up and log-in live on the `/app` auth screen (brief 24), never here.
 * Renaming the board name is a Pro feature; the database has no write policy
 * for anyone else, so this never offers a control that would fail
 * server-side.
 */
import { useEffect, useState } from "react";

import { getAccount, renameAccount, signOut, type Account } from "../data/account.ts";
import { fireAuthToast } from "../data/authToast.ts";
import { displayName } from "../data/leaderboard.ts";
import { getSupabase } from "../data/supabase.ts";
import { useTier } from "../data/tier.ts";

type Busy = "idle" | "renaming";

type MessageKind = "error" | "info" | null;

interface Props {
  /** Called after sign-out resolves, so the router can land on Play home. */
  onSignedOut?: () => void;
}

export function AccountCard({ onSignedOut }: Props) {
  const [account, setAccount] = useState<Account | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<Busy>("idle");
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<MessageKind>(null);
  const tier = useTier();

  useEffect(() => {
    let live = true;
    void getAccount().then((a) => {
      if (live) setAccount(a);
    });
    const supabase = getSupabase();
    if (!supabase) return;
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

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    setBusy("renaming");
    setMessage("");
    const result = await renameAccount(name);
    setBusy("idle");
    setMessage(result.ok ? "Name updated." : result.reason);
    setMessageKind(result.ok ? "info" : "error");
  }

  if (!account) {
    return (
      <section className="progress-card account-card">
        <p className="note">Checking your account…</p>
      </section>
    );
  }

  if (account.status === "permanent") {
    return (
      <section className="progress-card account-card">
        {tier === "pro" ? (
          <>
            <div className="progress-card-header">
              <h3>Board name</h3>
            </div>
            <form className="account-rename-form" onSubmit={handleRename}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={displayName()}
                aria-label="Board name"
                maxLength={24}
              />
              <button type="submit" disabled={busy === "renaming"}>
                {busy === "renaming" ? "Saving…" : "Rename"}
              </button>
            </form>
          </>
        ) : (
          <div className="progress-card-header">
            <h3>Board name</h3>
            <span className="badge account-rename-locked">Pro to rename</span>
          </div>
        )}
        {tier !== "pro" && <p className="account-board-name">{displayName()}</p>}
        {message && (
          <p
            className={
              messageKind === "error"
                ? "account-message account-message-error"
                : "account-message account-message-info"
            }
          >
            {message}
          </p>
        )}
        <div className="account-hairline" />
        <button
          type="button"
          className="link account-signout"
          onClick={() => {
            void signOut().then(() => {
              fireAuthToast("signed-out");
              onSignedOut?.();
            });
          }}
        >
          Sign out
        </button>
      </section>
    );
  }

  // `/app` only renders for a permanent account (AuthGate); after a sign-out
  // the gate swaps in the auth screen, so there is nothing to show here.
  return null;
}
