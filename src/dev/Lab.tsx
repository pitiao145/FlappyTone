import { useEffect, useRef, useState } from "react";
import { ensureMic, setFrameSink, stopMic } from "../audio/session.ts";
import { setActiveTracker } from "../game/activeTracker.ts";
import {
  configureTracker,
  handleFrame,
  startLoop,
} from "../game/loop.ts";
import type { RunSnapshot } from "../game/run.ts";
import {
  loadCorridorWidth,
  loadCueStyle,
  loadPace,
  loadSettings,
  type CalibrationSettings,
} from "../game/settings.ts";
import { DEFAULT_CONFIG } from "../pitch/PitchTracker.ts";
import { Game } from "../ui/Game.tsx";
import { Capture } from "./Capture.tsx";
import { DevPanel } from "./DevPanel.tsx";
import { GateLogPanel } from "./GateLogPanel.tsx";
import { Soundboard } from "./Soundboard.tsx";
import { TuningPanel } from "./TuningPanel.tsx";

type Tab = "play" | "pitch" | "gates" | "capture" | "sounds";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "play", label: "play" },
  { id: "pitch", label: "pitch" },
  { id: "gates", label: "gates" },
  { id: "capture", label: "capture" },
  { id: "sounds", label: "sounds" },
];

/**
 * Calibration to run on when the Lab is opened on a machine that has never
 * calibrated. The Lab must never block on a 30-second flow that has nothing to
 * do with what is being tuned.
 */
const FALLBACK_SETTINGS: CalibrationSettings = {
  f0Center: DEFAULT_CONFIG.f0Center,
  noiseFloor: DEFAULT_CONFIG.noiseFloor,
  rangeSemitones: DEFAULT_CONFIG.rangeSemitones,
};

interface Props {
  onBack: () => void;
}

/**
 * The dev Lab: a second, disposable instance of the game that exists to be
 * measured and re-tuned, kept out of the player-facing app entirely.
 *
 * Dev builds only — App.tsx imports this lazily behind `import.meta.env.DEV`,
 * so Rollup drops the whole subtree (and Capture, Soundboard and the tuning
 * UI with it) from a production bundle.
 */
export function Lab({ onBack }: Props) {
  const [tab, setTab] = useState<Tab>("play");
  const [settings] = useState<CalibrationSettings>(
    () => loadSettings() ?? FALLBACK_SETTINGS,
  );
  /** Bumped to tear down and rebuild the run — how a tuning change is applied. */
  const [runKey, setRunKey] = useState(0);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<RunSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const restart = async () => {
    setError(null);
    try {
      // Inside the click handler — iOS grants getUserMedia only during a gesture.
      await ensureMic();
      setLast(null);
      setRunKey((k) => k + 1);
      setRunning(true);
    } catch (err) {
      setRunning(false);
      setError(err instanceof Error ? err.message : "mic failed");
    }
  };

  const stop = () => {
    setRunning(false);
    stopMic();
  };

  return (
    <div className="screen lab-screen">
      <header className="lab-header">
        <button className="link" onClick={onBack}>
          ← exit lab
        </button>
        <nav className="lab-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={t.id === tab ? "tab active" : "tab"}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {error && <p className="error">{error}</p>}

      {tab === "play" && (
        <div className="lab-split">
          <div className="lab-stage">
            {running ? (
              <Game
                key={runKey}
                mode="game"
                settings={settings}
                canvasWidth={360}
                canvasHeight={640}
                onOver={(snap) => {
                  setLast(snap);
                  setRunning(false);
                }}
                onQuit={stop}
              />
            ) : (
              <div className="lab-idle">
                <p className="param-help">
                  Runs on {loadPace()} pace · {loadCorridorWidth()} tunnel ·{" "}
                  {loadCueStyle()} demo, and on your saved calibration
                  {loadSettings() === null ? " (none — using defaults)" : ""}.
                </p>
                <button className="primary" onClick={() => void restart()}>
                  {last ? "run again" : "start a run"}
                </button>
                {last && (
                  <pre className="diff">
                    {`score ${last.score}  ·  gates ${last.gateLog.length}
unheard ${last.gateLog.filter((g) => g.outcome === "unheard").length}  ·  collisions ${last.gateLog.filter((g) => g.outcome === "collision").length}
missed early ${last.missedUtterances}
worst excursion ${Math.round(Math.max(0, ...last.gateLog.map((g) => g.worstExcursionMs)))}ms`}
                  </pre>
                )}
              </div>
            )}
          </div>
          <div className="lab-controls">
            <TuningPanel />
          </div>
        </div>
      )}

      {tab === "pitch" && <PitchTab />}

      {tab === "gates" && (
        <div className="lab-controls">
          <GateLogPanel />
          <p className="param-help">
            The full per-gate log for the last run, live-mirrored to
            localStorage — a run ended by quitting or by closing the tab still
            leaves its numbers here.
          </p>
        </div>
      )}

      {tab === "capture" && <Capture onBack={() => setTab("play")} />}

      {tab === "sounds" && <Soundboard />}
    </div>
  );
}

/**
 * The Step-0 prototype: one dot, the Chao grid, a trail, and the tracker
 * controls. No gates — pitch tuning should not require flying anything.
 */
function PitchTab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!live) return;
    const saved = loadSettings();
    configureTracker(
      saved
        ? {
            f0Center: saved.f0Center,
            noiseFloor: saved.noiseFloor,
            rangeSemitones: saved.rangeSemitones,
          }
        : {},
    );
    setFrameSink(handleFrame);
    const stopLoop = canvasRef.current
      ? startLoop(canvasRef.current, 360, 640)
      : null;
    return () => {
      stopLoop?.();
      setFrameSink(null);
      setActiveTracker(null);
    };
  }, [live]);

  return (
    <div className="lab-split">
      <div className="lab-stage">
        <div className="stage">
          <canvas ref={canvasRef} width={360} height={640} />
        </div>
        {!live && (
          <button
            className="primary"
            onClick={() => {
              // Gesture-scoped, as every audio entry point in this app must be.
              void ensureMic().then(() => setLive(true));
            }}
          >
            open the mic
          </button>
        )}
      </div>
      <div className="lab-controls">
        <DevPanel />
      </div>
    </div>
  );
}
