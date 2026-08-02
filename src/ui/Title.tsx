import { useState } from "react";
import { MicError } from "../audio/mic.ts";
import { ensureMic } from "../audio/session.ts";
import { micErrorCopy } from "./micErrors.ts";

export type StartIntent = "game" | "tutorial" | "calibrate";

interface Props {
  calibrated: boolean;
  /** Shown once after the tutorial finishes. */
  tutorialDone: boolean;
  devOpen: boolean;
  onToggleDev: () => void;
  /** Called once the mic is open. The router decides whether to calibrate first. */
  onStart: (intent: StartIntent) => void;
  onHowTo: () => void;
}

export function Title({
  calibrated,
  tutorialDone,
  devOpen,
  onToggleDev,
  onStart,
  onHowTo,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The mic is opened here, inside the click handler, because iOS Safari only
  // grants getUserMedia/resume during a user gesture — a mount effect on the
  // next screen would be too late.
  const go = (intent: StartIntent) => async () => {
    setBusy(true);
    setError(null);
    try {
      await ensureMic();
      onStart(intent);
    } catch (err) {
      setError(micErrorCopy(err instanceof MicError ? err.kind : "unknown"));
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

      <p className="note">Needs a microphone and a quiet room.</p>
      {!calibrated && (
        <p className="note">First run starts with a 30-second calibration.</p>
      )}
      {error && <p className="error">{error}</p>}

      <button className="dev-toggle" onClick={onToggleDev}>
        {devOpen ? "hide dev" : "dev"}
      </button>
    </div>
  );
}
