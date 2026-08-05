import { useState } from "react";
import { MicError } from "../audio/mic.ts";
import { ensureMic, MicCancelled } from "../audio/session.ts";
import { micErrorCopy } from "./micErrors.ts";

export type StartIntent =
  | "game"
  | "tutorial"
  | "calibrate"
  | "visualiser"
  | "lab";

interface Props {
  calibrated: boolean;
  /** Shown once after the tutorial finishes. */
  tutorialDone: boolean;
  /** An error raised elsewhere (e.g. a failed Retry) — shown in Title's one error slot. */
  error: string | null;
  /** Called once the mic is open. The router decides whether to calibrate first. */
  onStart: (intent: StartIntent) => void;
  onHowTo: () => void;
  onSettings: () => void;
}

export function Title({
  calibrated,
  tutorialDone,
  error: externalError,
  onStart,
  onHowTo,
  onSettings,
}: Props) {
  const [ownError, setOwnError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
        <button disabled={busy} onClick={go("visualiser")}>
          Tone visualiser
        </button>
        <button disabled={busy} onClick={onSettings}>
          Settings
        </button>
        <button disabled={busy} onClick={onHowTo}>
          How to play
        </button>
      </div>

      <p className="note">Needs a microphone and a quiet room.</p>
      {!calibrated && (
        <p className="note">
          First run starts with a short calibration — talk normally, then reach
          high and low.
        </p>
      )}
      {error && <p className="error">{error}</p>}

      {/* Dev builds only. The Lab is a separate instance of the game for
          tuning, and it is not part of the product. */}
      {import.meta.env.DEV && (
        <button className="dev-toggle" disabled={busy} onClick={go("lab")}>
          lab
        </button>
      )}
    </div>
  );
}
