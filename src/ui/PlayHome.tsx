import { useState } from "react";
import { MicError } from "../audio/mic.ts";
import { ensureMic, MicCancelled } from "../audio/session.ts";
import { micErrorCopy } from "./micErrors.ts";
import { brand } from "../brand.ts";

export type PlayIntent = "game" | "tutorial" | "lab";

interface Props {
  calibrated: boolean;
  tutorialDone: boolean;
  /** An error raised elsewhere (e.g. a failed Retry) — shown alongside any error of PlayHome's own. */
  error: string | null;
  /** Called once the mic is open. The router decides whether to calibrate first. */
  onStart: (intent: PlayIntent) => void;
  /** Matches the size Game/Calibration will actually open at — see GameApp's computeCanvasSize. */
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * The Play tab's standby screen: the game's own frame, at rest, with Play and
 * Tutorial overlaid. Static for now — no live mic, no idle bird — so the
 * canvas-styled backdrop is just the frame's usual look with nothing moving
 * on it yet. Replaces the old Title screen: reaching this tab *is* the
 * decision to come play, so there is one screen here instead of two.
 */
export function PlayHome({
  calibrated,
  tutorialDone,
  error: externalError,
  onStart,
  canvasWidth,
  canvasHeight,
}: Props) {
  const [ownError, setOwnError] = useState<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<PlayIntent | null>(null);
  const busy = pendingIntent !== null;
  const error = ownError ?? externalError;

  // Opened inside the click handler — iOS Safari only grants getUserMedia
  // during a user gesture, so this can't move to a mount effect.
  const go = (intent: PlayIntent) => async () => {
    if (busy) return;
    setPendingIntent(intent);
    setOwnError(null);
    try {
      await ensureMic();
      onStart(intent);
    } catch (err) {
      if (!(err instanceof MicCancelled)) {
        setOwnError(micErrorCopy(err instanceof MicError ? err.kind : "unknown"));
      }
    } finally {
      setPendingIntent(null);
    }
  };

  return (
    <div className="stage game-stage playhome-stage">
      <div
        className="playhome-canvas"
        style={{ width: canvasWidth, height: canvasHeight }}
      >
        <div className="screen playhome-overlay">
          <img
            src="/Bird-hor-halo.png"
            alt=""
            className="playhome-mascot"
          />
          <h1>{brand.name}</h1>
          {tutorialDone && <p className="prompt">Nice, ready to play?</p>}
          {!calibrated && (
            <p className="note">
              First run starts with a short calibration: talk normally, then a
              few practice gates to find your range.
            </p>
          )}
          <div className="menu playhome-menu">
            <button className="primary" disabled={busy} onClick={go("game")}>
              {pendingIntent === "game" ? "Opening mic…" : "Play"}
            </button>
            <button disabled={busy} onClick={go("tutorial")}>
              {pendingIntent === "tutorial" ? "Opening mic…" : "Tutorial"}
            </button>
          </div>
          {error && <p className="error">{error}</p>}

          {/* Dev builds only. The Lab is a separate instance of the game for
              tuning, and it is not part of the product. */}
          {import.meta.env.DEV && (
            <button className="dev-toggle" disabled={busy} onClick={go("lab")}>
              lab
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
