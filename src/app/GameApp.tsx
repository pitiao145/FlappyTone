import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { initAnalytics, track, trackCalibration } from "../analytics/client";
import { initPostHog } from "../analytics/posthog.ts";
import { loadInventory } from "../audio/inventory";
import { MicError } from "../audio/mic";
import { ensureMic, MicCancelled, stopMic } from "../audio/session";
import {
  averageRangeHalves,
  COOLDOWN_TRACKING_WINDOW,
  recalibrationSuggestion,
  recordTrackedRun,
} from "../game/recalibration.ts";
import type { RunSnapshot } from "../game/run";
import {
  loadRecalTracking,
  loadSettings,
  loadShareData,
  saveRecalTracking,
  type CalibrationSettings,
} from "../game/settings";
import type { RangeHalves } from "../pitch/calibration.ts";
import type { RunStats } from "../game/scoring";
import { Calibration } from "../ui/Calibration";
import { Game } from "../ui/Game";
import { GameOver } from "../ui/GameOver";
import { HowTo } from "../ui/HowTo";
import { PlaceholderScreen } from "../ui/PlaceholderScreen";
import { PlayHome, type PlayIntent } from "../ui/PlayHome";
import { Settings } from "../ui/Settings";
import { Visualiser } from "../ui/Visualiser";
import { micErrorCopy } from "../ui/micErrors";
import { GameNav, type NavTab } from "./GameNav.tsx";
import "../App.css";

type Screen =
  | "play"
  | "howto"
  | "calibrate"
  | "finetune"
  | "tutorial"
  | "game"
  | "gameover"
  | "settings"
  | "visualiser"
  | "progress"
  | "profile"
  | "lab";

/** What Play/Tutorial (from the Play tab or Settings) route through. */
type StartIntent = PlayIntent | "visualiser";

/** Which nav item should read as active for a given screen. */
function navTabFor(screen: Screen): NavTab {
  switch (screen) {
    case "visualiser":
      return "visualiser";
    case "progress":
      return "progress";
    case "profile":
      return "profile";
    case "howto":
    case "settings":
      return "settings";
    default:
      return "play";
  }
}

/**
 * The dev Lab is a separate instance of the game for tuning, and it must not
 * reach a player. Loading it lazily behind `import.meta.env.DEV` means Rollup
 * drops the whole subtree — Lab, tuning UI, Capture — from a
 * production build rather than merely hiding the button.
 */
const Lab = import.meta.env.DEV
  ? lazy(() => import("../dev/Lab.tsx").then((m) => ({ default: m.Lab })))
  : null;

/**
 * What the landing page asked for on its way here, if anything.
 *
 * Only ever a *hint* for the initial tab, never an instruction to start:
 * `ensureMic()` needs a user gesture (iOS Safari grants `getUserMedia` inside
 * the click and nowhere else), and a gesture on the previous page does not
 * survive the navigation. `visualiser` is the only intent worth acting on
 * here, since it's the only one that doesn't require the mic to already be
 * open — it opens onto the Visualiser tab, and the player's first tap there
 * is the gesture.
 */
function initialIntent(): "visualiser" | null {
  try {
    const intent = new URLSearchParams(window.location.search).get("intent");
    if (intent === "visualiser") return "visualiser";
  } catch {
    /* no window (tests) */
  }
  return null;
}

/**
 * Canvas resolution — computed live from the real viewport, not a fixed
 * constant, on both mobile and desktop. `window.innerHeight` (not CSS
 * `100svh`) is what makes this correct: it already excludes browser chrome
 * and updates on `resize` as that chrome shows/hides, whereas the CSS-only
 * formula this replaced used a static, worst-case reserve and came out
 * narrower than the device on ordinary mobile browser tabs (Safari/Chrome's
 * toolbars ate more of `100svh` than the reserve assumed), leaving side
 * gutters that only disappeared once installed as a chromeless PWA.
 *
 * Both mobile and desktop just take the whole viewport minus the nav —
 * width and height are independent, no aspect ratio is preserved or
 * enforced either way. Mobile's nav is a bottom bar (MOBILE_NAV_RESERVE
 * comes off height); desktop's is a sidebar (STAGE_MARGIN_DESKTOP is a
 * bottom breathing margin, width is capped at CANVAS_W_DESKTOP instead).
 *
 * Both rendering and Run's world math (`this.width` in run.ts) key off
 * these, so this is what actually makes the canvas fill the screen, not
 * just the CSS box it sits in — see `difficultyFor` in run.ts, which scales
 * `scrollSpeed` by `width / CANVAS_W_REF` so a differently-sized canvas
 * doesn't change cue timing (gates would otherwise reach the bird later
 * relative to their reference audio, since only the world scrolls faster in
 * step with the canvas).
 */
const CANVAS_W_REF = 420;
const CANVAS_W_DESKTOP = 900;
/** Keep in sync with --nav-mobile-h in tokens.css. */
const MOBILE_NAV_RESERVE = 72;
/** Keep in sync with --stage-margin-desktop in tokens.css. */
const STAGE_MARGIN_DESKTOP = 28;
/** Keep in sync with .game-screen's desktop padding-top in App.css. */
const GAME_TOP_PADDING_DESKTOP = 24;

function computeCanvasSize() {
  if (typeof window === "undefined") {
    return {
      w: CANVAS_W_REF,
      h: Math.round((CANVAS_W_REF * 16) / 9),
      desktop: false,
    };
  }
  if (window.matchMedia("(min-width: 720px)").matches) {
    return {
      w: CANVAS_W_DESKTOP,
      h: Math.round(window.innerHeight - STAGE_MARGIN_DESKTOP),
      desktop: true,
    };
  }
  return {
    w: window.innerWidth,
    h: Math.round(window.innerHeight - MOBILE_NAV_RESERVE),
    desktop: false,
  };
}

/** Tracks the viewport (breakpoint, width, height) computeCanvasSize needs. */
function useCanvasSize() {
  const [size, setSize] = useState(computeCanvasSize);
  useEffect(() => {
    const onChange = () => setSize(computeCanvasSize());
    const mq = window.matchMedia("(min-width: 720px)");
    mq.addEventListener("change", onChange);
    window.addEventListener("resize", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, []);
  return size;
}

/**
 * The game — the whole of what `/app` serves.
 *
 * There is no landing page in here. The marketing site is a separate entry
 * (`/`, `src/LandingApp.tsx`), which is why this file no longer decides
 * between the two on load: reaching this URL at all *is* the decision.
 */
export default function GameApp() {
  const { w: CANVAS_W, h: CANVAS_H, desktop } = useCanvasSize();
  // A run's own top breathing room on desktop (App.css's .game-screen
  // padding-top) — trimmed off the stage's own height budget rather than
  // added on top of it, so the frame still ends at the same bottom margin.
  // PlayHome uses this too, matched to Game's height rather than the raw
  // CANVAS_H, even though it has no padding-top of its own to budget for.
  // Calibration keeps the full CANVAS_H.
  const GAME_CANVAS_H = desktop ? CANVAS_H - GAME_TOP_PADDING_DESKTOP : CANVAS_H;

  const [settings, setSettings] = useState<CalibrationSettings | null>(() =>
    loadSettings(),
  );
  // Only worth honouring if already calibrated — the Visualiser screen needs
  // settings to render, and jumping to it uncalibrated would draw a blank.
  const [screen, setScreen] = useState<Screen>(() =>
    initialIntent() === "visualiser" && settings ? "visualiser" : "play",
  );
  const [stats, setStats] = useState<RunStats | null>(null);
  /**
   * What GameOver should offer, if anything — decided here, once the
   * tracking window for this run fills. Not the raw measurement: see
   * `recalibration.ts` for why judging a single run's measured range was
   * replaced with judging the average of a multi-run window.
   */
  const [recalSuggestion, setRecalSuggestion] = useState<RangeHalves | null>(
    null,
  );
  const [tutorialDone, setTutorialDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryBusy, setRetryBusy] = useState(false);
  /** Where to go once calibration finishes, when Play/Tutorial routed through it. */
  const pendingRef = useRef<"game" | "tutorial" | "visualiser" | null>(null);
  /** The mode of the run that just ended — drives Retry. */
  const lastModeRef = useRef<"game" | "tutorial">("game");
  /**
   * This session's "game" run count — shown in the pause menu ("run N").
   * Bumped on every fresh visit to a game run (Play, Retry); an in-game
   * Restart bumps its own local copy instead, since it never reaches here.
   */
  const gameRunNumberRef = useRef(0);

  /**
   * Bumped on every deliberate navigation. An in-flight `ensureMic` compares
   * it after awaiting, so a Retry that resolves *after* the player pressed
   * Home can never drop them into a run they left.
   */
  const navRef = useRef(0);

  const goHome = useCallback(() => {
    navRef.current += 1;
    stopMic();
    setRetryBusy(false);
    setScreen("play");
  }, []);

  /** The caller has already opened the mic inside its click handler. */
  const startPlay = useCallback(
    (intent: StartIntent) => {
      setTutorialDone(false);
      setError(null);
      if (intent === "lab") {
        // Dev tooling — the Lab supplies its own fallback calibration.
        setScreen("lab");
        return;
      }
      if (intent !== "visualiser") lastModeRef.current = intent;
      if (intent === "game") gameRunNumberRef.current += 1;
      // Playing without calibration would map the player's voice through a
      // stranger's f0 centre. Calibrate first, then continue to the run.
      if (!settings) {
        pendingRef.current = intent;
        setScreen("calibrate");
        return;
      }
      setScreen(intent);
    },
    [settings],
  );

  const onCalibrated = useCallback((s: CalibrationSettings) => {
    setSettings(s);
    trackCalibration(s);
    track({ type: "calib_done" });
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) {
      if (pending !== "visualiser") lastModeRef.current = pending;
      setScreen(pending);
    } else {
      goHome();
    }
  }, [goHome]);

  const onRunOver = useCallback((snap: RunSnapshot) => {
    // Game.tsx has already stopped the mic.
    if (lastModeRef.current === "tutorial") {
      setTutorialDone(true);
      setScreen("play");
      return;
    }
    setStats(snap.stats);

    // Windowed recalibration check — see recalibration.ts. Only a completed,
    // non-tutorial run reaches here, so tutorial runs never pollute the
    // window (the early return above already routed those away).
    const tracking = recordTrackedRun(loadRecalTracking(), snap.measuredRange);
    if (tracking.samples.length >= tracking.windowSize) {
      const avg = averageRangeHalves(tracking.samples);
      const suggestion =
        avg && settings ? recalibrationSuggestion(settings, avg) : null;
      setRecalSuggestion(suggestion);
      if (suggestion) track({ type: "recal_offered" });
      saveRecalTracking({ windowSize: COOLDOWN_TRACKING_WINDOW, samples: [] });
    } else {
      setRecalSuggestion(null);
      saveRecalTracking(tracking);
    }

    setScreen("gameover");
  }, [settings]);

  const retry = useCallback(async () => {
    setError(null);
    setRetryBusy(true);
    const gen = ++navRef.current;
    try {
      // Retry is a click, so this reopens the mic inside a user gesture.
      await ensureMic();
      if (gen !== navRef.current) return; // player left while we were waiting
      if (lastModeRef.current === "game") gameRunNumberRef.current += 1;
      setScreen(lastModeRef.current);
    } catch (err) {
      if (gen !== navRef.current) return;
      setError(micErrorCopy(err instanceof MicError ? err.kind : "unknown"));
      setScreen("play");
    } finally {
      setRetryBusy(false);
    }
  }, []);

  /**
   * Starts the analytics client and drains anything an earlier visit failed to
   * send. Runs once — `initAnalytics` ignores repeat calls, so React's
   * strict-mode double-mount cannot register two visibility listeners.
   *
   * `landed` is recorded here rather than on a click because the interesting
   * case is the tester who arrives and does nothing: without it, they are
   * indistinguishable from someone who never opened the game. Note that since
   * the split it means "opened /app", not "visited the site" — a visit to the
   * marketing page is a `$pageview` on the other entry.
   */
  useEffect(() => {
    initAnalytics();
    // Traffic analytics, deliberately separate from the gameplay pipeline
    // above — see src/analytics/posthog.ts. Pageviews only, same consent flag.
    initPostHog(loadShareData());
    track({ type: "landed" });
    // Re-report the saved calibration each visit, so a session that skips
    // calibration (because it already ran) still carries the voice numbers its
    // gate results have to be read against.
    const saved = loadSettings();
    if (saved) trackCalibration(saved);
    // The clip inventory, started here so it has landed by the time a run is
    // constructed — the Run needs its words synchronously, at the moment the
    // first gates spawn. A failure resolves to an empty inventory and the game
    // falls back to the tuning defaults; nothing here can block a run.
    void loadInventory();
  }, []);

  /**
   * Nav-tab clicks. Most tabs are a plain screen switch — no mic needed. The
   * one exception is Visualiser before the player has ever calibrated: its
   * screen requires `settings`, so an uncalibrated click routes through the
   * calibration gate first, opening the mic here since this click is the
   * gesture (Calibration itself does not open the mic on mount).
   */
  const onNavigate = useCallback(
    (tab: NavTab) => {
      if (tab === "visualiser" && !settings) {
        setError(null);
        pendingRef.current = "visualiser";
        void ensureMic()
          .then(() => setScreen("calibrate"))
          .catch((err) => {
            pendingRef.current = null;
            if (!(err instanceof MicCancelled)) {
              // The error banner only has a slot on the Play tab, so land
              // there to show it rather than failing silently wherever the
              // player clicked Visualiser from.
              setScreen("play");
              setError(micErrorCopy(err instanceof MicError ? err.kind : "unknown"));
            }
          });
        return;
      }
      setScreen(tab);
    },
    [settings],
  );

  return (
    <div className="app app-game">
      <GameNav active={navTabFor(screen)} onNavigate={onNavigate} />
      <div className="app-main">
        <div className="frame">
          {screen === "play" && (
            <PlayHome
              calibrated={settings !== null}
              tutorialDone={tutorialDone}
              error={error}
              onStart={startPlay}
              canvasWidth={CANVAS_W}
              canvasHeight={GAME_CANVAS_H}
            />
          )}

        {screen === "howto" && <HowTo onBack={() => setScreen("settings")} />}

        {screen === "progress" && (
          <PlaceholderScreen
            title="Progress"
            body="Your accuracy over time, per tone, is coming soon."
          />
        )}

        {screen === "profile" && (
          <PlaceholderScreen
            title="Profile"
            body="A place for your stats and preferences is coming soon."
          />
        )}

        {screen === "settings" && (
          <Settings
            settings={settings}
            onBack={() => setScreen("play")}
            onRecalibrate={() => {
              pendingRef.current = null;
              setScreen("calibrate");
            }}
            onFineTune={() => setScreen("finetune")}
            onForget={() => setSettings(null)}
            onTutorial={() => startPlay("tutorial")}
            onHowTo={() => setScreen("howto")}
          />
        )}

        {screen === "visualiser" && settings && (
          // Same dimensions PlayHome gets (CANVAS_W x GAME_CANVAS_H) so the
          // .frame this renders into is pixel-identical to Play's — no
          // separate constants, no separate CSS formula. See the
          // `.visualiser-screen.game-stage` rule in App.css.
          <Visualiser settings={settings} canvasWidth={CANVAS_W} canvasHeight={GAME_CANVAS_H} />
        )}

        {screen === "lab" && Lab && (
          <Suspense fallback={<p className="note">loading lab…</p>}>
            <Lab onBack={goHome} />
          </Suspense>
        )}

        {screen === "calibrate" && (
          <Calibration
            canvasWidth={CANVAS_W}
            canvasHeight={CANVAS_H}
            onDone={onCalibrated}
            onSaved={setSettings}
            onCancel={goHome}
          />
        )}

        {/* Settings → Fine-tune: the live preview and the sensitivity slider,
            seeded from what is already saved. Not part of the first run. */}
        {screen === "finetune" && settings && (
          <Calibration
            canvasWidth={CANVAS_W}
            canvasHeight={CANVAS_H}
            startAt="preview"
            existing={settings}
            onDone={(s) => {
              setSettings(s);
              setScreen("settings");
            }}
            onSaved={setSettings}
            onCancel={() => setScreen("settings")}
          />
        )}

        {(screen === "game" || screen === "tutorial") && settings && (
          <Game
            key={screen}
            mode={screen === "tutorial" ? "tutorial" : "game"}
            settings={settings}
            canvasWidth={CANVAS_W}
            canvasHeight={GAME_CANVAS_H}
            onOver={onRunOver}
            onQuit={goHome}
            runNumber={gameRunNumberRef.current}
          />
        )}

        {screen === "gameover" && stats && (
          <GameOver
            stats={stats}
            busy={retryBusy}
            onRetry={() => void retry()}
            onHome={goHome}
            settings={settings}
            suggestion={recalSuggestion}
            onRecalibrate={setSettings}
          />
        )}
        </div>
      </div>
    </div>
  );
}
