import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { initAnalytics, track, trackCalibration } from "./analytics/client";
import { initPostHog } from "./analytics/posthog.ts";
import { loadInventory } from "./audio/inventory";
import { MicError } from "./audio/mic";
import { ensureMic, stopMic } from "./audio/session";
import { GateLogPanel } from "./dev/GateLogPanel";
import type { RunSnapshot } from "./game/run";
import { loadSettings, loadShareData, type CalibrationSettings } from "./game/settings";
import type { RunStats } from "./game/scoring";
import { Calibration } from "./ui/Calibration";
import { Game } from "./ui/Game";
import { Landing } from "./ui/Landing";
import { Nav } from "./ui/Nav";
import { GameOver } from "./ui/GameOver";
import { HowTo } from "./ui/HowTo";
import { Settings } from "./ui/Settings";
import { Visualiser } from "./ui/Visualiser";
import { micErrorCopy } from "./ui/micErrors";
import { Title, type StartIntent } from "./ui/Title";
import "./App.css";

type Screen =
  | "landing"
  | "title"
  | "howto"
  | "calibrate"
  | "finetune"
  | "tutorial"
  | "game"
  | "gameover"
  | "settings"
  | "visualiser"
  | "lab";

/**
 * The dev Lab is a separate instance of the game for tuning, and it must not
 * reach a player. Loading it lazily behind `import.meta.env.DEV` means Rollup
 * drops the whole subtree — Lab, tuning UI, Capture, Soundboard — from a
 * production build rather than merely hiding the button.
 */
const Lab = import.meta.env.DEV
  ? lazy(() => import("./dev/Lab.tsx").then((m) => ({ default: m.Lab })))
  : null;

/**
 * Where a fresh load starts.
 *
 * Installed to the home screen, this is the game and nothing else — landing on
 * marketing copy every launch would be a bug. The manifest asks for `?app=1`;
 * the display-mode check is the belt-and-braces half, because iOS has not
 * always honoured `start_url`, and anyone who installed before the landing page
 * existed still has the bare `/` saved.
 */
function initialScreen(): Screen {
  try {
    if (new URLSearchParams(window.location.search).has("app")) return "title";
    if (window.matchMedia("(display-mode: standalone)").matches) return "title";
    // iOS Safari's own flag, which predates display-mode and still differs.
    if ((navigator as { standalone?: boolean }).standalone === true) {
      return "title";
    }
  } catch {
    /* no window (tests): fall through to the landing */
  }
  return "landing";
}

const CANVAS_W = 420;
const CANVAS_H = Math.round((420 * 16) / 9);

export default function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [settings, setSettings] = useState<CalibrationSettings | null>(() =>
    loadSettings(),
  );
  const [stats, setStats] = useState<RunStats | null>(null);
  const [tutorialDone, setTutorialDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryBusy, setRetryBusy] = useState(false);
  /** Where to go once calibration finishes, when Play/Tutorial routed through it. */
  const pendingRef = useRef<"game" | "tutorial" | "visualiser" | null>(null);
  /** The mode of the run that just ended — drives Retry. */
  const lastModeRef = useRef<"game" | "tutorial">("game");

  /**
   * Bumped on every deliberate navigation. An in-flight `ensureMic` compares
   * it after awaiting, so a Retry that resolves *after* the player pressed
   * Home can never drop them into a run they left.
   */
  const navRef = useRef(0);

  /**
   * Section to scroll to once the landing page is on screen. The nav exists on
   * the app's screens too, but a link there has to change screen *and* land on
   * the right section — there is no page under it to anchor to.
   */
  const pendingSectionRef = useRef<string | null>(null);

  const goLanding = useCallback((sectionId: string) => {
    navRef.current += 1;
    // Leaving for the marketing page means leaving the game: nothing on the
    // landing page listens, and a mic left open there is a recording light
    // nobody can explain.
    stopMic();
    setRetryBusy(false);
    pendingSectionRef.current = sectionId;
    setScreen("landing");
  }, []);

  const goHome = useCallback(() => {
    navRef.current += 1;
    stopMic();
    setRetryBusy(false);
    setScreen("title");
  }, []);

  /** Title has already opened the mic inside its click handler. */
  const startFromTitle = useCallback(
    (intent: StartIntent) => {
      setTutorialDone(false);
      setError(null);
      if (intent === "lab") {
        // Dev tooling — the Lab supplies its own fallback calibration.
        setScreen("lab");
        return;
      }
      if (intent === "calibrate") {
        pendingRef.current = null;
        setScreen("calibrate");
        return;
      }
      if (intent !== "visualiser") lastModeRef.current = intent;
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
      setScreen("title");
      return;
    }
    setStats(snap.stats);
    setScreen("gameover");
  }, []);

  const retry = useCallback(async () => {
    setError(null);
    setRetryBusy(true);
    const gen = ++navRef.current;
    try {
      // Retry is a click, so this reopens the mic inside a user gesture.
      await ensureMic();
      if (gen !== navRef.current) return; // player left while we were waiting
      setScreen(lastModeRef.current);
    } catch (err) {
      if (gen !== navRef.current) return;
      setError(micErrorCopy(err instanceof MicError ? err.kind : "unknown"));
      setScreen("title");
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
   * indistinguishable from someone who never opened the link.
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

  // Runs after the landing page has painted, so the target exists. "top" is
  // the hero, which is where a plain jump-to-top belongs anyway.
  useEffect(() => {
    if (screen !== "landing") return;
    const id = pendingSectionRef.current;
    pendingSectionRef.current = null;
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [screen]);

  /**
   * Screens that carry the nav. Deliberately not the ones you are *inside* —
   * a run, a calibration, the visualiser — where a site nav would compete with
   * the thing the screen exists for, and where a stray tap would abandon work
   * in progress. The pause menu is the way out of a run.
   */
  const showNav =
    screen === "title" ||
    screen === "howto" ||
    screen === "settings" ||
    screen === "gameover";

  return (
    <div className="app">
      <div className="frame">
        {/* No Play button here: offering it to someone already inside the game
            is the one link on the bar that means nothing where they are. */}
        {showNav && <Nav variant="app" onNavigate={goLanding} />}

        {/* Quitting a run lands here, so the log has to be readable here too. */}
        {import.meta.env.DEV && screen === "title" && (
          <GateLogPanel key="gatelog" />
        )}

        {screen === "landing" && (
          <Landing
            onPlay={() => startFromTitle("game")}
            onVisualiser={() => startFromTitle("visualiser")}
            onMenu={() => setScreen("title")}
          />
        )}

        {screen === "title" && (
          <Title
            calibrated={settings !== null}
            tutorialDone={tutorialDone}
            error={error}
            onStart={startFromTitle}
            onHowTo={() => setScreen("howto")}
            onSettings={() => setScreen("settings")}
          />
        )}

        {screen === "howto" && <HowTo onBack={() => setScreen("title")} />}

        {screen === "settings" && (
          <Settings
            settings={settings}
            onBack={() => setScreen("title")}
            onRecalibrate={() => {
              pendingRef.current = null;
              setScreen("calibrate");
            }}
            onFineTune={() => setScreen("finetune")}
            onForget={() => setSettings(null)}
          />
        )}

        {screen === "visualiser" && settings && (
          <Visualiser
            settings={settings}
            canvasWidth={CANVAS_W}
            canvasHeight={CANVAS_H}
            onBack={goHome}
          />
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
            onCancel={() => setScreen("settings")}
          />
        )}

        {(screen === "game" || screen === "tutorial") && settings && (
          <Game
            key={screen}
            mode={screen === "tutorial" ? "tutorial" : "game"}
            settings={settings}
            canvasWidth={CANVAS_W}
            canvasHeight={CANVAS_H}
            onOver={onRunOver}
            onQuit={goHome}
            onLanding={() => goLanding("top")}
          />
        )}

        {screen === "gameover" && stats && (
          <GameOver
            stats={stats}
            busy={retryBusy}
            onRetry={() => void retry()}
            onHome={goHome}
          />
        )}
      </div>

    </div>
  );
}
