/**
 * The account card: sign up, log in, or manage an existing account.
 *
 * Password is the primary method — a magic link and a password reset are
 * offered as secondary links, not competing primary actions. Renaming the
 * board name is a Pro feature; the database has no write policy for anyone
 * else, so this never offers a control that would fail server-side.
 */
import { useEffect, useState } from "react";

import {
  getAccount,
  renameAccount,
  requestPasswordReset,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  startEmailSignIn,
  type Account,
} from "../data/account.ts";
import { fireAuthToast } from "../data/authToast.ts";
import { redirectToCheckoutForCurrentAccount } from "../data/checkout.ts";
import { consumePendingCheckout } from "../data/checkoutIntent.ts";
import { displayName } from "../data/leaderboard.ts";
import { getSupabase } from "../data/supabase.ts";
import { useTier } from "../data/tier.ts";

type Mode = "signup" | "login";
type Busy = "idle" | "submitting" | "magic" | "reset" | "renaming";

type MessageKind = "error" | "info" | null;

interface Props {
  /** Omits the "Save your progress"/"Log in" header on the guest branch only — for a screen that already carries its own title (see `CheckoutSignup.tsx`). */
  hideGuestHeader?: boolean;
  /** Called after sign-out resolves, so the router can land on Play home. */
  onSignedOut?: () => void;
}

export function AccountCard({ hideGuestHeader = false, onSignedOut }: Props) {
  const [account, setAccount] = useState<Account | null>(null);
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
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
    // A session issued before an upgrade confirms still carries the old
    // `is_anonymous` claim baked in — refresh so this reflects reality
    // without waiting for the token's own expiry.
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("submitting");
    setMessage("");
    const result =
      mode === "signup"
        ? await signUpWithPassword(email, password, consent)
        : await signInWithPassword(email, password);
    setBusy("idle");
    setMessage(result.ok ? "" : result.reason);
    setMessageKind(result.ok ? null : "error");
    if (result.ok) {
      setPassword("");
      fireAuthToast("signed-in");
      // Only consume the flag on success — a failed attempt shouldn't burn the
      // guest's one shot at getting bounced through to checkout.
      if (consumePendingCheckout()) void redirectToCheckoutForCurrentAccount();
    }
  }

  async function handleMagicLink() {
    if (!email.trim()) {
      setMessage("Enter your email first.");
      setMessageKind("error");
      return;
    }
    setBusy("magic");
    setMessage("");
    const result = await startEmailSignIn(email);
    setBusy("idle");
    setMessage(result.ok ? "Check your inbox for the link." : result.reason);
    setMessageKind(result.ok ? "info" : "error");
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setMessage("Enter your email first.");
      setMessageKind("error");
      return;
    }
    setBusy("reset");
    setMessage("");
    const result = await requestPasswordReset(email);
    setBusy("idle");
    setMessage(result.ok ? "Check your inbox for a reset link." : result.reason);
    setMessageKind(result.ok ? "info" : "error");
  }

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

  const isAnonymous = account.status === "anonymous";

  return (
    <section className="progress-card account-card">
      {!hideGuestHeader && (
        <div className="progress-card-header">
          <h3>{mode === "signup" ? "Save your progress" : "Log in"}</h3>
        </div>
      )}

      <div className="pace-row account-mode-row">
        <button
          type="button"
          className={`pace ${mode === "signup" ? "active" : ""}`}
          onClick={() => setMode("signup")}
        >
          Sign up
        </button>
        <button
          type="button"
          className={`pace ${mode === "login" ? "active" : ""}`}
          onClick={() => setMode("login")}
        >
          Log in
        </button>
      </div>

      {isAnonymous && mode === "signup" && (
        <p className="note">
          On the board as {displayName()}. Adding a password keeps this account
          and your board place — nothing is lost.
        </p>
      )}

      <form className="account-form" onSubmit={handleSubmit}>
        <label className="account-field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="account-field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={mode === "signup" ? 8 : undefined}
            required
          />
        </label>

        {mode === "signup" && (
          <label className="account-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>Email me product updates — optional</span>
          </label>
        )}

        <button type="submit" className="primary" disabled={busy === "submitting"}>
          {busy === "submitting"
            ? mode === "signup"
              ? "Creating account…"
              : "Logging in…"
            : mode === "signup"
              ? "Create account"
              : "Log in"}
        </button>

        {mode === "signup" && (
          <p className="note account-legal">
            By signing up, you agree to our{" "}
            <a href="/terms-of-service" target="_blank" rel="noopener noreferrer">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
            .
          </p>
        )}
      </form>

      <div className="account-links">
        <button type="button" className="link" onClick={() => void handleMagicLink()} disabled={busy === "magic"}>
          Email me a link instead
        </button>
        {mode === "login" && (
          <button
            type="button"
            className="link"
            onClick={() => void handleForgotPassword()}
            disabled={busy === "reset"}
          >
            Forgot password?
          </button>
        )}
      </div>

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
    </section>
  );
}
