import { useState } from "react";
import { MicError } from "../audio/mic.ts";
import { ensureMic, MicCancelled } from "../audio/session.ts";
import { micErrorCopy } from "./micErrors.ts";
import { brand } from "../brand.ts";

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
  /**
   * What the landing page sent the player here for, if anything.
   *
   * Only ever a highlight, never an auto-start: the microphone opens inside a
   * click and the landing page's click did not survive the navigation to /app.
   * So the matching button becomes the primary one and says what it will do,
   * and the player's tap is the gesture that opens the mic.
   */
  suggestedIntent?: StartIntent | null;
  /** Called once the mic is open. The router decides whether to calibrate first. */
  onStart: (intent: StartIntent) => void;
  onHowTo: () => void;
  onSettings: () => void;
}

export function Title({
  calibrated,
  tutorialDone,
  error: externalError,
  suggestedIntent = null,
  onStart,
  onHowTo,
  onSettings,
}: Props) {
  const [ownError, setOwnError] = useState<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<StartIntent | null>(null);
  const busy = pendingIntent !== null;
  const error = ownError ?? externalError;
  // Exactly one button carries `.primary`; the suggestion moves it rather than
  // adding a second, so the screen still has one obvious next step.
  const primaryIntent: StartIntent = suggestedIntent ?? "game";

  // The mic is opened here, inside the click handler, because iOS Safari only
  // grants getUserMedia/resume during a user gesture — a mount effect on the
  // next screen would be too late. `pendingIntent` (rather than a plain
  // boolean) exists so the exact button that was pressed can show it heard
  // the click immediately — the mic permission round-trip can take a moment,
  // and an unstyled `disabled` state alone reads as the click doing nothing.
  const go = (intent: StartIntent) => async () => {
    if (busy) return;
    setPendingIntent(intent);
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
      setPendingIntent(null);
    }
  };

  return (
    <div className="screen title-screen">
      <h1>{brand.name}</h1>
      <p className="tagline">{brand.tagline}</p>

      {tutorialDone && <p className="prompt">Nice, ready to play?</p>}
      {!tutorialDone && suggestedIntent === "visualiser" && (
        <p className="prompt">Tap the visualiser to open your microphone.</p>
      )}

      <div className="menu">
        <button
          className={primaryIntent === "game" ? "primary" : undefined}
          disabled={busy}
          onClick={go("game")}
        >
          {pendingIntent === "game" ? "Opening mic…" : "Play"}
        </button>
        <button disabled={busy} onClick={go("tutorial")}>
          {pendingIntent === "tutorial" ? "Opening mic…" : "Tutorial"}
        </button>
        <button
          className={primaryIntent === "visualiser" ? "primary" : undefined}
          disabled={busy}
          onClick={go("visualiser")}
        >
          {pendingIntent === "visualiser" ? "Opening mic…" : "Tone visualiser"}
        </button>
        <button disabled={busy} onClick={onSettings}>
          Settings
        </button>
        <button disabled={busy} onClick={onHowTo}>
          How to play
        </button>
      </div>

      <p className="note">{brand.requirement}</p>
      {!calibrated && (
        <p className="note">
          First run starts with a short calibration: talk normally, then reach
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
