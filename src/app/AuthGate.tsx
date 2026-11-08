/**
 * The /app login gate (brief 24): a permanent account gets the game, anyone
 * else (signed out, or an anonymous guest session) gets `AuthScreen`.
 *
 * It decides once per auth change, before GameApp mounts, so GameApp keeps
 * reading its one-shot URL params (`c`, `n`, `intent`, …) on mount exactly as
 * before: a password signup never leaves the page, and a magic link's parked
 * params are put back here first (`restoreReturn`).
 */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { track } from "../analytics/client";
import { getAccount, recordMarketingConsent } from "../data/account.ts";
import { noteAccount } from "../data/accountScope.ts";
import { getSupabase } from "../data/supabase.ts";
import { parseChallengeName } from "../share/shareName.ts";
import {
  authMode,
  authSource,
  canPlay,
  consumeAuthPending,
  oauthErrorFromUrl,
  ownSubmitPending,
  restoreReturn,
  weakPairLine,
} from "./authGate.ts";
import GameApp, { parseChallengeScore } from "./GameApp.tsx";

/**
 * Lazy, so the site's Sky stylesheet (nav, faces, its own :root tokens) is
 * only ever loaded for a signed-out visitor. Its `--font-display` would
 * otherwise restyle the game, which is why the gate reloads the page once
 * the auth screen hands over instead of mounting GameApp beside it.
 */
const AuthScreen = lazy(() => import("./AuthScreen.tsx").then((m) => ({ default: m.AuthScreen })));

const LOADING = { minHeight: "100svh", background: "var(--surface)" } as const;

type GateState = "checking" | "auth" | "play";

function storage(): Storage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

export default function AuthGate() {
  const [state, setState] = useState<GateState>("checking");
  const playingRef = useRef(false);
  const shownAuthRef = useRef(false);
  // A reset-password link signs the player in with a recovery session; the
  // event fires before GameApp subscribes, so it is caught here and handed on.
  const [recovery, setRecovery] = useState(false);
  const [source] = useState(() =>
    authSource(window.location.search, document.referrer, window.location.origin),
  );
  // A failed Google round trip comes back with the error in the URL (e.g.
  // `identity_already_exists`). Read before the Supabase client starts (the
  // first render, before the effect below), then cleared from the address bar.
  const [oauthError] = useState(() => {
    const err = oauthErrorFromUrl(window.location.search, window.location.hash);
    if (err) {
      consumeAuthPending(storage()); // that attempt is over: no completion event
      const q = new URLSearchParams(window.location.search);
      for (const k of ["error", "error_code", "error_description"]) q.delete(k);
      const search = q.toString();
      history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
    }
    return err;
  });

  useEffect(() => {
    let live = true;
    const check = () =>
      void getAccount().then((account) => {
        if (!live) return;
        const play = canPlay(account.status);
        if (play && !playingRef.current) {
          // A magic link or Google redirect that started on the auth screen.
          // An in-page code or password sign-in clears the marker itself.
          // While the card's own code/password submit runs, it counts the
          // sign-in itself (and clears the marker); counting here too would
          // double it under the wrong method.
          const pending = ownSubmitPending() ? null : consumeAuthPending(storage());
          if (pending) {
            const mode = authMode(account.createdAt ?? null, pending.at, pending.wasAnonymous);
            track({ type: "signup_completed", mode, method: pending.method });
            if (mode === "login") track({ type: "login_completed", method: pending.method });
            if (pending.consent) void recordMarketingConsent(true);
          }
          const search = restoreReturn(window.location.search, storage());
          if (search !== window.location.search) {
            history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
          }
        }
        // Brief 34: note which account this browser holds before GameApp
        // mounts, so a second account never reads the first one's values.
        noteAccount(play ? account.userId : null);
        playingRef.current = play;
        // The auth screen was up this page: the game starts from a clean page
        // (URL params intact, none of its CSS). Its own submit reloads once it
        // has finished (sync, consent); any other sign-in reloads here.
        if (play && shownAuthRef.current) {
          if (!ownSubmitPending()) window.location.reload();
          return;
        }
        if (!play) shownAuthRef.current = true;
        setState(play ? "play" : "auth");
      });
    check();
    const supabase = getSupabase();
    const sub = supabase?.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      // The first check() above covers the initial session; a refreshed
      // token cannot change who may play.
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
      check();
    });
    return () => {
      live = false;
      sub?.data.subscription.unsubscribe();
    };
  }, [oauthError]);

  if (state === "checking") return <div style={LOADING} aria-busy="true" />;
  if (state === "play") return <GameApp recovery={recovery} />;
  return (
    <Suspense fallback={<div style={LOADING} aria-busy="true" />}>
      <AuthScreen
        source={source}
        challengeScore={parseChallengeScore(window.location.search)}
        challengeName={parseChallengeName(window.location.search)}
        weakLine={weakPairLine(window.location.search)}
        oauthError={oauthError}
      />
    </Suspense>
  );
}
