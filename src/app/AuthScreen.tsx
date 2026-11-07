/**
 * The /app login gate's screen. Two doors, like most sign-up pages: "Sign up"
 * (Google, or "Sign up with email") with "Already have an account? Log in"
 * under it, and "Log in" (Google, or an email that gets a login code) with
 * "Don't have an account? Sign up". Both email paths send a 6-digit code
 * typed on this same card (the email also carries the magic link), and both
 * work for a new or an existing address. A password form stays one small
 * link away from Log in. It only calls the
 * auth functions in `src/data/account.ts`; `AuthGate` notices the new
 * session and swaps in the game.
 */
import { useEffect, useId, useState } from "react";
import { track } from "../analytics/client";
import type { AuthMethod, AuthScreenStep } from "../analytics/session.ts";
import {
  getAccount,
  requestPasswordReset,
  signInWithPassword,
  signUpWithPassword,
  startEmailCode,
  startExistingAccountCode,
  startGoogleSignIn,
  verifyEmailCode,
  type EmailCodeType,
} from "../data/account.ts";
import {
  authMode,
  challengeLine,
  codeFailReason,
  consumeAuthPending,
  friendlyAuthError,
  initialAuthCard,
  markAuthPending,
  parkReturn,
  type AuthCard,
  type AuthSource,
  setOwnSubmit,
} from "./authGate.ts";
import { redirectToCheckoutForCurrentAccount } from "../data/checkout.ts";
import { canUseGoogleSignIn } from "../lib/inAppBrowser.ts";
import { InAppBrowserPrompt } from "../ui/InAppBrowserPrompt.tsx";
import { Nav } from "../ui/Nav.tsx";
import "../site/site.css";
import "./AuthScreen.css";

/** The site's faces (Lilita One, Figtree): /app's HTML only loads the game's. */
const SKY_FONTS =
  "https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&family=Lilita+One&display=swap";

/** Seconds before "Resend code" works again (Supabase also rate-limits sends). */
export const RESEND_COOLDOWN_S = 60;

interface Props {
  source: AuthSource;
  challengeScore: number | null;
  challengeName: string | null;
  /** The tone test's weak pair, as a subtitle (`weakPairLine`); null otherwise. */
  weakLine?: string | null;
  /** A Google round trip that came back with an error (`oauthErrorFromUrl`). */
  oauthError?: { code: string; description: string } | null;
}

type View = "signup" | "login" | "code" | "password" | "password_signup" | "reset";

/** A message on the card, with at most one way out. */
interface CardError {
  text: string;
  action?: { label: string; run: () => void };
}

function storage(): Storage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

export function AuthScreen({ source, challengeScore, challengeName, weakLine = null, oauthError = null }: Props) {
  const [view, setView] = useState<View>(() => initialAuthCard(window.location.search));
  /** Sign up hides its email form behind "Sign up with email". */
  const [emailOpen, setEmailOpen] = useState(false);
  /** The door the code step came from: its copy and its way back. */
  const [codeFrom, setCodeFrom] = useState<AuthCard>("signup");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [otpType, setOtpType] = useState<EmailCodeType>("email");
  /** The code went to an address that already had an account (anonymous guest path). */
  const [existing, setExisting] = useState(false);
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CardError | null>(null);
  const [resetSent, setResetSent] = useState<string | null>(null);
  const [googleOk] = useState(() => {
    try {
      return canUseGoogleSignIn(navigator.userAgent);
    } catch {
      return true;
    }
  });
  const ids = useId();

  useEffect(() => {
    if (document.querySelector(`link[href="${SKY_FONTS}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = SKY_FONTS;
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    if (view === "reset") return;
    const screen: AuthScreenStep = view;
    track({ type: "auth_screen_viewed", screen, source });
  }, [view, source]);

  // A Google link that hit an account which already exists: say so plainly
  // and let the player choose to sign in to it (never silently).
  useEffect(() => {
    if (!oauthError) return;
    if (oauthError.code === "identity_already_exists") {
      setError({
        text: "This Google account already has a FlappyTone account.",
        action: { label: "Sign in to that account", run: () => void google(true) },
      });
    } else if (oauthError.code !== "access_denied") {
      setError({ text: friendlyAuthError(oauthError.description || oauthError.code, oauthError.code).text });
    }
    // Once, for the error the page arrived with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The resend countdown ticks only while the code step shows.
  useEffect(() => {
    if (view !== "code") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [view]);
  const cooldown = Math.max(0, Math.ceil((sentAt + RESEND_COOLDOWN_S * 1000 - now) / 1000));

  function go(next: View) {
    setView(next);
    setError(null);
    setResetSent(null);
    setPassword("");
    setCode("");
    if (next === "signup") setEmailOpen(false);
  }

  /** After an in-page sign-in: checkout for a "Go Pro" visitor, else a clean reload into the game. */
  function finish(mode: AuthCard, method: AuthMethod) {
    consumeAuthPending(storage()); // this sign-in is counted here, not by AuthGate
    track({ type: "signup_completed", mode, method });
    if (mode === "login") track({ type: "login_completed", method });
    // The short wait lets the events above leave first. A visitor who came
    // from the landing page's "Go Pro" goes on to checkout (brief 24); anyone
    // else starts the game from a clean page, where AuthGate sees the account.
    const wantsPro = new URLSearchParams(window.location.search).get("intent") === "pricing";
    setTimeout(() => {
      void (async () => {
        if (wantsPro && (await redirectToCheckoutForCurrentAccount())) {
          track({ type: "earlybird_checkout_opened", surface: "auth", feature: "lp_pricing" });
          return;
        }
        window.location.reload();
      })();
    }, 300);
  }

  async function google(toExisting = false) {
    if (busy) return;
    setBusy(true);
    setError(null);
    track({ type: "signup_started", mode: view === "login" ? "login" : "signup", method: "google" });
    const wasAnonymous = !toExisting && (await getAccount()).status === "anonymous";
    // The redirect comes back to bare /app: park the challenge params, and
    // remember how this started for the completion event.
    parkReturn(window.location.search, storage());
    markAuthPending({ method: "google", consent, wasAnonymous }, storage());
    const result = await startGoogleSignIn({ existing: toExisting });
    if (!result.ok) {
      consumeAuthPending(storage());
      setBusy(false);
      setError({ text: friendlyAuthError(result.reason, result.code).text });
    }
    // On success the browser is already leaving for Google.
  }

  async function sendCode(opts: { resend?: boolean; toExisting?: boolean } = {}) {
    if (busy) return;
    if (!email.trim()) {
      setError({ text: "Enter your email first." });
      return;
    }
    const toExisting = opts.toExisting ?? (opts.resend ? existing : false);
    setBusy(true);
    setError(null);
    const card: AuthCard = view === "login" ? "login" : view === "code" ? codeFrom : "signup";
    if (!opts.resend) track({ type: "signup_started", mode: card, method: "otp" });
    const wasAnonymous = !toExisting && (await getAccount()).status === "anonymous";
    // The same email carries a magic link back to bare /app.
    parkReturn(window.location.search, storage());
    markAuthPending({ method: "magic_link", consent, wasAnonymous }, storage());
    const result = toExisting ? await startExistingAccountCode(email) : await startEmailCode(email);
    setBusy(false);
    if (!result.ok) {
      consumeAuthPending(storage());
      if (result.code === "email_exists") {
        // An anonymous guest typed an address that already has an account.
        setError({
          text: "This email already has an account.",
          action: { label: "Send a code to sign in to it", run: () => void sendCode({ toExisting: true }) },
        });
        return;
      }
      track({ type: "auth_code_failed", reason: codeFailReason(result.code, result.reason, Date.now()), stage: "send" });
      setError({ text: friendlyAuthError(result.reason, result.code).text });
      return;
    }
    track({ type: "auth_code_sent", resend: !!opts.resend });
    setOtpType(result.otpType);
    setExisting(toExisting);
    const t = Date.now();
    setSentAt(t);
    setNow(t);
    if (!opts.resend) {
      setCode("");
      setCodeFrom(card);
      setView("code");
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setOwnSubmit(true);
    const result = await verifyEmailCode(email, code, otpType, consent);
    if (!result.ok) {
      setOwnSubmit(false);
      setBusy(false);
      if (result.code !== "code_too_short") {
        track({ type: "auth_code_failed", reason: codeFailReason(result.code, result.reason, sentAt), stage: "verify" });
      }
      setError({ text: friendlyAuthError(result.reason, result.code).text });
      return;
    }
    const mode = otpType === "email_change" ? "signup" : authMode(result.createdAt, sentAt, false);
    finish(mode, "otp");
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setOwnSubmit(true);
    const mode: AuthCard = view === "password" ? "login" : "signup";
    track({ type: "signup_started", mode, method: "password" });
    const result =
      mode === "signup"
        ? await signUpWithPassword(email, password, consent)
        : await signInWithPassword(email, password);
    if (!result.ok) {
      setOwnSubmit(false);
      setBusy(false);
      const f = friendlyAuthError(result.reason, result.code);
      setError(
        f.existing && mode === "signup"
          ? { text: f.text, action: { label: "Log in instead", run: () => go("login") } }
          : { text: f.text },
      );
      return;
    }
    finish(mode, "password");
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await requestPasswordReset(email);
    setBusy(false);
    if (!result.ok) {
      setError({ text: friendlyAuthError(result.reason, result.code).text });
      return;
    }
    setResetSent(email.trim());
  }

  const save = { title: "Save your progress" };
  const back = { title: "Welcome back", sub: "Ready to fly your tones?" };
  const head =
    view === "login" || view === "password" || (view === "code" && codeFrom === "login")
      ? back
      : view === "reset"
        ? { title: "Reset your password", sub: "We'll email you a link to set a new one." }
        : challengeScore != null
          ? { ...save, sub: challengeLine(challengeScore, challengeName) }
          : weakLine
            ? { ...save, sub: weakLine }
            : { ...save, sub: "Sign up free to play, and track how your tones improve." };

  const errorBox = error && (
    <p className="auth-error" role="alert">
      {error.text}
      {error.action && (
        <>
          {" "}
          <button type="button" className="auth-link" onClick={error.action.run} disabled={busy}>
            {error.action.label}
          </button>
        </>
      )}
    </p>
  );

  const emailField = (
    <div className="auth-field">
      <label htmlFor={`${ids}-email`}>Email</label>
      <input
        id={`${ids}-email`}
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />
    </div>
  );

  const consentBox = (
    <label className="auth-consent">
      <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
      <span>Email me tips and news about FlappyTone</span>
    </label>
  );

  const passwordField = (
    <div className="auth-field">
      <div className="auth-label-row">
        <label htmlFor={`${ids}-password`}>Password</label>
        {view === "password" && (
          <button type="button" className="auth-link auth-link-small" onClick={() => go("reset")}>
            Forgotten password?
          </button>
        )}
      </div>
      <div className="auth-password">
        <input
          id={`${ids}-password`}
          type={showPassword ? "text" : "password"}
          name="password"
          autoComplete={view === "password" ? "current-password" : "new-password"}
          required
          minLength={view === "password" ? undefined : 8}
          aria-describedby={view === "password_signup" ? `${ids}-pw-hint` : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="button"
          className="auth-eye"
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
          onClick={() => setShowPassword((v) => !v)}
        >
          <EyeIcon open={!showPassword} />
        </button>
      </div>
      {view === "password_signup" && (
        <p className="auth-hint" id={`${ids}-pw-hint`}>
          At least 8 characters.
        </p>
      )}
    </div>
  );

  let body: React.ReactNode;
  if (view === "reset" && resetSent) {
    body = (
      <div className="auth-sent" role="status">
        <img className="auth-sent-bird" src="/Bird-up-no-halo.png" alt="" width={80} height={80} />
        <h2>Check your inbox</h2>
        <p>
          We sent a reset link to <strong>{resetSent}</strong>. Open it to set a new password.
        </p>
        <button type="button" className="auth-link" onClick={() => go("password")}>
          Back to log in
        </button>
      </div>
    );
  } else if (view === "reset") {
    body = (
      <form className="auth-form" onSubmit={submitReset}>
        {emailField}
        {errorBox}
        <button type="submit" className="sky-btn auth-primary" disabled={busy}>
          {busy ? "Sending…" : "Send reset link"}
        </button>
        <button type="button" className="auth-link" onClick={() => go("password")}>
          Back to log in
        </button>
      </form>
    );
  } else if (view === "code") {
    body = (
      <form className="auth-form" onSubmit={submitCode}>
        <p className="auth-code-note" role="status">
          We sent a 6-digit code to <strong>{email.trim()}</strong>. Type it below to{" "}
          {codeFrom === "login" ? "log in" : "finish signing up"}. Check spam too.
        </p>
        <div className="auth-field">
          <label htmlFor={`${ids}-code`}>Code</label>
          <input
            id={`${ids}-code`}
            className="auth-code-input"
            type="text"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={8}
            required
            autoFocus
            value={code}
            // Digits only, so a pasted "123 456" or "Code: 123456" still works.
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
          />
        </div>
        {errorBox}
        <button type="submit" className="sky-btn auth-primary" disabled={busy}>
          {busy ? "One moment…" : "Verify"}
        </button>
        <div className="auth-code-actions">
          <button
            type="button"
            className="auth-link"
            onClick={() => void sendCode({ resend: true })}
            disabled={busy || cooldown > 0}
          >
            {cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
          </button>
          <button type="button" className="auth-link" onClick={() => go(codeFrom)} disabled={busy}>
            Use a different email
          </button>
        </div>
      </form>
    );
  } else if (view === "signup" || view === "login") {
    const verb = view === "signup" ? "Sign up" : "Log in";
    const codeForm = (
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          void sendCode();
        }}
      >
        {emailField}
        {view === "signup" && consentBox}
        {errorBox}
        <button type="submit" className="sky-btn auth-primary" disabled={busy}>
          {busy ? "Sending…" : view === "signup" ? "Email me a sign-up code" : "Email me a login code"}
        </button>
        <p className="auth-hint auth-center-text">We'll email you a 6-digit code. No password needed.</p>
      </form>
    );
    body = (
      <>
        {googleOk && (
          <>
            <button
              type="button"
              className="sky-btn sky-btn-ghost auth-primary auth-google"
              onClick={() => void google()}
              disabled={busy}
            >
              <GoogleIcon />
              {verb} with Google
            </button>
            <p className="auth-or" aria-hidden="true">
              <span>or</span>
            </p>
          </>
        )}
        {view === "login" || emailOpen ? (
          codeForm
        ) : (
          <>
            {errorBox}
            <button type="button" className="sky-btn auth-primary" onClick={() => setEmailOpen(true)}>
              <MailIcon />
              Sign up with email
            </button>
          </>
        )}
        {view === "login" && (
          <button type="button" className="auth-link auth-link-small auth-center" onClick={() => go("password")}>
            Log in with a password instead
          </button>
        )}
      </>
    );
  } else {
    body = (
      <form className="auth-form" onSubmit={submitPassword}>
        {emailField}
        {passwordField}
        {view === "password_signup" && consentBox}
        {errorBox}
        <button type="submit" className="sky-btn auth-primary" disabled={busy}>
          {busy ? "One moment…" : view === "password" ? "Log in" : "Create account and play"}
        </button>
        {view === "password" ? (
          <button type="button" className="auth-link auth-link-small" onClick={() => go("login")}>
            Email me a login code instead
          </button>
        ) : (
          <button type="button" className="auth-link auth-link-small" onClick={() => go("signup")}>
            Sign up with a code instead
          </button>
        )}
      </form>
    );
  }

  const showLegal = view === "signup" || view === "password_signup" || (view === "code" && codeFrom === "signup");
  const onLoginSide = view === "login" || view === "password" || view === "reset" || (view === "code" && codeFrom === "login");

  return (
    <div id="top" className="sky sky-site auth">
      <Nav linkBase="/" />
      {/* Google is hidden in this in-app browser: offer the real browser. */}
      {!googleOk && <InAppBrowserPrompt />}
      <main className="auth-main">
        <div className="auth-panel">
          <img className="auth-bird" src="/Bird-hor-no-halo.png" alt="" width={96} height={96} />
          <h1 className="auth-title">{head.title}</h1>
          <p className="auth-sub">{head.sub}</p>

          <section
            className="auth-card"
            aria-label={onLoginSide ? (view === "reset" ? "Reset password" : "Log in") : "Sign up"}
          >
            {body}
            {showLegal && (
              <p className="auth-legal">
                By signing up, you agree to our <a href="/terms-of-service">Terms</a> &amp;{" "}
                <a href="/privacy-policy">Privacy Policy</a>.
              </p>
            )}
          </section>

          {view !== "code" && (
            <p className="auth-switch">
              {onLoginSide ? "Don't have an account? " : "Already have an account? "}
              <button type="button" className="auth-link" onClick={() => go(onLoginSide ? "signup" : "login")}>
                {onLoginSide ? "Sign up" : "Log in"}
              </button>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <path d="M4 4l16 16" />}
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

/** Google's "G" mark, in its own colours (its brand guidelines ask for them). */
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
