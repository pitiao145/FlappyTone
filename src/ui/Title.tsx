import { useState } from "react";
import { MicError } from "../audio/mic.ts";
import { ensureMic, MicCancelled } from "../audio/session.ts";
import {
  CORRIDOR_WIDTHS,
  PACES,
  type CorridorWidth,
  type Pace,
} from "../game/gates.ts";
import { CUE_STYLES, type CueStyle } from "../game/run.ts";
import {
  loadCorridorWidth,
  loadCueStyle,
  loadPace,
  saveCorridorWidth,
  saveCueStyle,
  savePace,
} from "../game/settings.ts";
import { micErrorCopy } from "./micErrors.ts";

export type StartIntent = "game" | "tutorial" | "calibrate" | "capture";

interface Props {
  calibrated: boolean;
  /** Shown once after the tutorial finishes. */
  tutorialDone: boolean;
  devOpen: boolean;
  /** An error raised elsewhere (e.g. a failed Retry) — shown in Title's one error slot. */
  error: string | null;
  onToggleDev: () => void;
  /** Called once the mic is open. The router decides whether to calibrate first. */
  onStart: (intent: StartIntent) => void;
  onHowTo: () => void;
}

export function Title({
  calibrated,
  tutorialDone,
  devOpen,
  error: externalError,
  onToggleDev,
  onStart,
  onHowTo,
}: Props) {
  const [ownError, setOwnError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pace, setPace] = useState<Pace>(loadPace);
  const [width, setWidth] = useState<CorridorWidth>(loadCorridorWidth);
  const [cueStyle, setCueStyle] = useState<CueStyle>(loadCueStyle);
  const error = ownError ?? externalError;

  // The mic is opened here, inside the click handler, because iOS Safari only
  // grants getUserMedia/resume during a user gesture — a mount effect on the
  // next screen would be too late.
  const go = (intent: StartIntent) => async () => {
    setBusy(true);
    setOwnError(null);
    try {
      await ensureMic();
      onStart(intent);
    } catch (err) {
      // A cancelled start means the player navigated away — not a failure.
      if (!(err instanceof MicCancelled)) {
        setOwnError(micErrorCopy(err instanceof MicError ? err.kind : "unknown"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen title-screen">
      <h1>ToneFlap</h1>
      <p className="tagline">
        Your voice is the controller. Fly the shape of the tone.
      </p>

      {tutorialDone && <p className="prompt">Nice — ready to play?</p>}

      <div className="menu">
        <button className="primary" disabled={busy} onClick={go("game")}>
          Play
        </button>
        <button disabled={busy} onClick={go("tutorial")}>
          Tutorial
        </button>
        <button disabled={busy} onClick={go("calibrate")}>
          {calibrated ? "Re-calibrate" : "Calibrate"}
        </button>
        <button disabled={busy} onClick={onHowTo}>
          How to play
        </button>
      </div>

      <div className="pace-row">
        <span className="pace-label">Speed</span>
        {PACES.map((p) => (
          <button
            key={p}
            className={p === pace ? "pace active" : "pace"}
            onClick={() => {
              setPace(p);
              savePace(p);
            }}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="pace-row">
        <span className="pace-label">Tunnel</span>
        {CORRIDOR_WIDTHS.map((w) => (
          <button
            key={w}
            className={w === width ? "pace active" : "pace"}
            onClick={() => {
              setWidth(w);
              saveCorridorWidth(w);
            }}
          >
            {w}
          </button>
        ))}
      </div>

      <div className="pace-row">
        <span className="pace-label">Demo</span>
        {CUE_STYLES.map((s) => (
          <button
            key={s}
            className={s === cueStyle ? "pace active" : "pace"}
            onClick={() => {
              setCueStyle(s);
              saveCueStyle(s);
            }}
          >
            {s === "flow" ? "in flow" : "pause & listen"}
          </button>
        ))}
      </div>

      <p className="note">Needs a microphone and a quiet room.</p>
      {!calibrated && (
        <p className="note">First run starts with a 30-second calibration.</p>
      )}
      {error && <p className="error">{error}</p>}

      <button className="dev-toggle" onClick={onToggleDev}>
        {devOpen ? "hide dev" : "dev"}
      </button>
      {devOpen && (
        <button className="dev-toggle" disabled={busy} onClick={go("capture")}>
          capture
        </button>
      )}
    </div>
  );
}
