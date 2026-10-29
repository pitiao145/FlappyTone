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
import { getAccount } from "../data/account.ts";
import { getSupabase } from "../data/supabase.ts";
import { parseChallengeName } from "../share/shareName.ts";
import { authSource, canPlay, consumeMagicLink, restoreReturn } from "./authGate.ts";
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

  useEffect(() => {
    let live = true;
    const check = () =>
      void getAccount().then((account) => {
        if (!live) return;
        const play = canPlay(account.status);
        if (play && !playingRef.current) {
          const card = consumeMagicLink(storage());
          if (card) {
            track({ type: "signup_completed", mode: card, method: "magic_link" });
            if (card === "login") track({ type: "login_completed", method: "magic_link" });
          }
          const search = restoreReturn(window.location.search, storage());
          if (search !== window.location.search) {
            history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
          }
        }
        playingRef.current = play;
        // The auth screen was up this page: it reloads itself once its own
        // signup/login call has finished (sync, consent), so the game starts
        // from a clean page with the URL params intact and none of its CSS.
        if (play && shownAuthRef.current) return;
        if (!play) shownAuthRef.current = true;
        setState(play ? "play" : "auth");
      });
    check();
    const supabase = getSupabase();
    const sub = supabase?.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      check();
    });
    return () => {
      live = false;
      sub?.data.subscription.unsubscribe();
    };
  }, []);

  if (state === "checking") return <div style={LOADING} aria-busy="true" />;
  if (state === "play") return <GameApp recovery={recovery} />;
  return (
    <Suspense fallback={<div style={LOADING} aria-busy="true" />}>
      <AuthScreen
        source={source}
        challengeScore={parseChallengeScore(window.location.search)}
        challengeName={parseChallengeName(window.location.search)}
      />
    </Suspense>
  );
}
