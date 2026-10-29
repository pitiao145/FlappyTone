/**
 * The /app login gate's screen (brief 24): signup, login, reset and the
 * "check your inbox" state, all in one centred card. It only calls the auth
 * functions in `src/data/account.ts`; `AuthGate` notices the new session and
 * swaps in the game.
 */
import { useEffect, useId, useState } from "react";
import { track } from "../analytics/client";
import {
  requestPasswordReset,
  signInWithPassword,
  signUpWithPassword,
  startEmailSignIn,
} from "../data/account.ts";
import {
  challengeLine,
  friendlyAuthError,
  markMagicLinkSent,
  parkReturn,
  type AuthCard,
  type AuthSource,
} from "./authGate.ts";
import { Nav } from "../ui/Nav.tsx";
import "../site/site.css";
import "./AuthScreen.css";

/** The site's faces (Lilita One, Figtree): /app's HTML only loads the game's. */
const SKY_FONTS =
  "https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&family=Lilita+One&display=swap";

interface Props {
  source: AuthSource;
  challengeScore: number | null;
  challengeName: string | null;
}

type View = AuthCard | "reset";
type Sent = { kind: "magic" | "reset"; email: string } | null;

function storage(): Storage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

export function AuthScreen({ source, challengeScore, challengeName }: Props) {
  const [view, setView] = useState<View>("signup");
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; existing: boolean } | null>(null);
  const [sent, setSent] = useState<Sent>(null);
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
    track({ type: "auth_screen_viewed", screen: view, source });
  }, [view, source]);

  function go(next: View) {
    setView(next);
    setError(null);
    setSent(null);
    setPassword("");
    if (next === "signup") setEmailOpen(false);
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const mode = view === "login" ? "login" : "signup";
    track({ type: "signup_started", mode, method: "password" });
    const result =
      mode === "signup"
        ? await signUpWithPassword(email, password, consent)
        : await signInWithPassword(email, password);
    if (!result.ok) {
      setBusy(false);
      setError(friendlyAuthError(result.reason));
      return;
    }
    track({ type: "signup_completed", mode, method: "password" });
    if (mode === "login") track({ type: "login_completed", method: "password" });
    // Start the game from a clean page: AuthGate sees the account on load.
    // The short wait lets the two events above leave first.
    setTimeout(() => window.location.reload(), 300);
  }

  async function sendMagicLink() {
    if (busy) return;
    if (!email.trim()) {
      setError({ text: "Enter your email first.", existing: false });
      return;
    }
    setBusy(true);
    setError(null);
    const mode = view === "login" ? "login" : "signup";
    track({ type: "signup_started", mode, method: "magic_link" });
    parkReturn(window.location.search, storage());
    markMagicLinkSent(mode, storage());
    const result = await startEmailSignIn(email);
    setBusy(false);
    if (!result.ok) {
      setError(friendlyAuthError(result.reason));
      return;
    }
    // Marketing consent rides only on the password path: startEmailSignIn
    // takes no consent, and this brief adds no auth backend code.
    setSent({ kind: "magic", email: email.trim() });
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await requestPasswordReset(email);
    setBusy(false);
    if (!result.ok) {
      setError(friendlyAuthError(result.reason));
      return;
    }
    setSent({ kind: "reset", email: email.trim() });
  }

  const head =
    view === "login"
      ? { title: "Welcome back", sub: "Ready to fly your tones?" }
      : view === "reset"
        ? { title: "Reset your password", sub: "We'll email you a link to set a new one." }
        : challengeScore != null
          ? { title: "Save your progress", sub: challengeLine(challengeScore, challengeName) }
          : { title: "Save your progress", sub: "Sign up free to play, and track how your tones improve." };

  const errorBox = error && (
    <p className="auth-error" role="alert">
      {error.text}
      {error.existing && (
        <>
          {" "}
          <button type="button" className="auth-link" onClick={() => go("login")}>
            Log in instead
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

  const passwordField = (
    <div className="auth-field">
      <div className="auth-label-row">
        <label htmlFor={`${ids}-password`}>Password</label>
        {view === "login" && (
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
          autoComplete={view === "login" ? "current-password" : "new-password"}
          required
          minLength={view === "login" ? undefined : 8}
          aria-describedby={view === "signup" ? `${ids}-pw-hint` : undefined}
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
      {view === "signup" && (
        <p className="auth-hint" id={`${ids}-pw-hint`}>
          At least 8 characters.
        </p>
      )}
    </div>
  );

  let body: React.ReactNode;
  if (sent) {
    body = (
      <div className="auth-sent" role="status">
        <img className="auth-sent-bird" src="/Bird-up-no-halo.png" alt="" width={80} height={80} />
        <h2>Check your inbox</h2>
        <p>
          {sent.kind === "magic" ? "We sent a sign-in link to " : "We sent a reset link to "}
          <strong>{sent.email}</strong>.{" "}
          {sent.kind === "magic" ? "Open it on this device to start playing." : "Open it to set a new password."}
        </p>
        <button type="button" className="auth-link" onClick={() => setSent(null)}>
          Use a different email
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
        <button type="button" className="auth-link" onClick={() => go("login")}>
          Back to log in
        </button>
      </form>
    );
  } else if (view === "signup" && !emailOpen) {
    body = (
      <>
        {/* Google / Apple go here in a later brief; nothing renders yet. */}
        <div className="auth-providers" aria-hidden="true" />
        <button type="button" className="sky-btn auth-primary" onClick={() => setEmailOpen(true)}>
          <MailIcon />
          Sign up with email
        </button>
      </>
    );
  } else {
    body = (
      <form className="auth-form" onSubmit={submitPassword}>
        {emailField}
        {passwordField}
        {view === "signup" && (
          <label className="auth-consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>Email me tips and news about FlappyTone</span>
          </label>
        )}
        {errorBox}
        <button type="submit" className="sky-btn auth-primary" disabled={busy}>
          {busy ? "One moment…" : view === "login" ? "Log in" : "Create account and play"}
        </button>
        <button type="button" className="auth-link" onClick={() => void sendMagicLink()} disabled={busy}>
          Email me a sign-in link instead
        </button>
      </form>
    );
  }

  return (
    <div id="top" className="sky sky-site auth">
      <Nav linkBase="/" />
      <main className="auth-main">
        <div className="auth-panel">
          <img className="auth-bird" src="/Bird-hor-no-halo.png" alt="" width={96} height={96} />
          <h1 className="auth-title">{head.title}</h1>
          <p className="auth-sub">{head.sub}</p>

          <section
            className="auth-card"
            aria-label={view === "login" ? "Log in" : view === "reset" ? "Reset password" : "Sign up"}
          >
            {body}
            {view === "signup" && !sent && (
              <p className="auth-legal">
                By signing up, you agree to our <a href="/terms-of-service">Terms</a> &amp;{" "}
                <a href="/privacy-policy">Privacy Policy</a>.
              </p>
            )}
          </section>

          {view === "signup" ? (
            <p className="auth-switch">
              Already have an account?{" "}
              <button type="button" className="auth-link" onClick={() => go("login")}>
                Log in
              </button>
            </p>
          ) : (
            <p className="auth-switch">
              Don't have an account?{" "}
              <button type="button" className="auth-link" onClick={() => go("signup")}>
                Sign up
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
