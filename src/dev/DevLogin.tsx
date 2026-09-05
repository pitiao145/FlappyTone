/**
 * A magic-link login, for development only.
 *
 * Phase 1 ships no public accounts: players are anonymous, and the only thing
 * they write to the server is a leaderboard score. But the account plumbing —
 * email sign-in, an anonymous user upgrading in place to a permanent one — is
 * what Phase 2 is built on, and it is much easier to build the profile UI
 * against a real signed-in session than to imagine one.
 *
 * So this exists to let a developer sign in as themselves and see it work. It
 * is gated at its mount site in `GameApp.tsx` by `import.meta.env.DEV` and a
 * lazy import, so Rollup drops this whole file from a production build rather
 * than shipping a hidden login. Hiding a login is not the same as not having
 * one — see CLAUDE.md hard rule 7.
 *
 * `signInWithOtp` on an existing anonymous session links the email to *that*
 * user rather than creating a second one, which is exactly the upgrade path
 * Phase 2 needs: the player keeps their scores.
 */
import { useEffect, useState } from "react";

import { getSupabase } from "../data/supabase.ts";

type Status = "idle" | "sending" | "sent" | "error";

export function DevLogin({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  // Known synchronously, so it's initial state rather than an effect.
  const [who, setWho] = useState<string>(() =>
    getSupabase()
      ? "checking…"
      : "no Supabase client — check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY",
  );

  useEffect(() => {
    let live = true;
    const supabase = getSupabase();
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      if (!live) return;
      const user = data.session?.user;
      if (!user) setWho("signed out");
      else setWho(`${user.is_anonymous ? "anonymous" : user.email} · ${user.id}`);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!live) return;
      const user = session?.user;
      setWho(!user ? "signed out" : `${user.is_anonymous ? "anonymous" : user.email} · ${user.id}`);
    });
    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getSupabase();
    if (!supabase || !email.trim()) return;
    setStatus("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.href },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
      setMessage("Check your inbox for the link.");
    }
  }

  async function signOut() {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.auth.signOut();
    setStatus("idle");
    setMessage("");
  }

  return (
    <section className="screen">
      <h2>Dev login</h2>
      <p className="note">
        Development only — this screen is not in a production build. Signing in with an email
        while anonymous upgrades that same user rather than making a new one.
      </p>

      <p className="note">
        <strong>Session:</strong> {who}
      </p>

      <form className="coming-soon-form" onSubmit={send}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email for the magic link"
          required
        />
        <button type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Send magic link"}
        </button>
      </form>
      {message && <p className="note">{message}</p>}

      <div className="row">
        <button type="button" className="link" onClick={signOut}>
          Sign out
        </button>
        <button type="button" className="link" onClick={onBack}>
          Back
        </button>
      </div>
    </section>
  );
}
