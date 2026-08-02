import { useCallback, useRef, useState } from "react";
import { MicError } from "./audio/mic";
import { ensureMic, stopMic } from "./audio/session";
import { DevPanel } from "./dev/DevPanel";
import type { RunSnapshot } from "./game/run";
import { loadSettings, type CalibrationSettings } from "./game/settings";
import type { RunStats } from "./game/scoring";
import { Calibration } from "./ui/Calibration";
import { Game } from "./ui/Game";
import { GameOver } from "./ui/GameOver";
import { HowTo } from "./ui/HowTo";
import { micErrorCopy } from "./ui/micErrors";
import { Title, type StartIntent } from "./ui/Title";
import "./App.css";

type Screen = "title" | "howto" | "calibrate" | "tutorial" | "game" | "gameover";

const CANVAS_W = 420;
const CANVAS_H = Math.round((420 * 16) / 9);

export default function App() {
  const [screen, setScreen] = useState<Screen>("title");
  const [settings, setSettings] = useState<CalibrationSettings | null>(() =>
    loadSettings(),
  );
  const [stats, setStats] = useState<RunStats | null>(null);
  const [tutorialDone, setTutorialDone] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryBusy, setRetryBusy] = useState(false);
  /** Where to go once calibration finishes, when Play/Tutorial routed through it. */
  const pendingRef = useRef<"game" | "tutorial" | null>(null);
  /** The mode of the run that just ended — drives Retry. */
  const lastModeRef = useRef<"game" | "tutorial">("game");

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
    setScreen("title");
  }, []);

  /** Title has already opened the mic inside its click handler. */
  const startFromTitle = useCallback(
    (intent: StartIntent) => {
      setTutorialDone(false);
      setError(null);
      if (intent === "calibrate") {
        pendingRef.current = null;
        setScreen("calibrate");
        return;
      }
      lastModeRef.current = intent;
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
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) {
      lastModeRef.current = pending;
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

  return (
    <div className="app">
      <div className="frame">
        {screen === "title" && (
          <Title
            calibrated={settings !== null}
            tutorialDone={tutorialDone}
            devOpen={devOpen}
            error={error}
            onToggleDev={() => setDevOpen((v) => !v)}
            onStart={startFromTitle}
            onHowTo={() => setScreen("howto")}
          />
        )}

        {screen === "howto" && <HowTo onBack={() => setScreen("title")} />}

        {screen === "calibrate" && (
          <Calibration
            canvasWidth={CANVAS_W}
            canvasHeight={CANVAS_H}
            onDone={onCalibrated}
            onCancel={goHome}
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

      {devOpen && <DevPanel />}
    </div>
  );
}
