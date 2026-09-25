import { loadReduceMotion } from "../game/settings.ts";
import { BellRingingIcon, SpeakerHighIcon } from "./icons.tsx";

interface Props {
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * The single blocking "turn your volume up" screen every run/Visualiser/
 * Retry passes through before the mic ever opens.
 *
 * Why the mic can't already be open here: on iOS, granting `getUserMedia`
 * switches the page's audio-session category, which ducks/reroutes output
 * volume in a way the hardware volume buttons no longer control normally —
 * so a warning shown *after* the mic opens is too late to actually fix.
 * `GameApp.tsx`'s `requestMicAndThen` is what defers `ensureMic()` to this
 * screen's own "OK" tap, which is why every call site that used to open the
 * mic on the player's first tap (PlayHome, ModeSelect, LevelSelect, Retry,
 * Visualiser) now routes through here first instead.
 *
 * Shown every single time, deliberately not persisted/dismissible — the
 * player's mic (and therefore this duck) gets reopened fresh on every run.
 */
export function SilentModeGate({ busy, error, onConfirm, canvasWidth, canvasHeight }: Props) {
  return (
    <div className="stage game-stage playhome-stage">
      <div
        className="playhome-canvas"
        style={{ width: canvasWidth, height: canvasHeight }}
      >
        <div className="screen playhome-overlay">
          <div className={`silent-gate-icons${loadReduceMotion() ? " silent-gate-icons--still" : ""}`}>
            <SpeakerHighIcon />
            <BellRingingIcon />
          </div>
          <h1>Turn up your volume</h1>
          <p className="note">
            This game doesn't work in silent mode. Make sure your phone's
            silent switch is off and your volume is up.
          </p>
          <br></br>
          <p className="note">
            For best results, do not use bluetooth headphones as they may cause lag.
          </p>
          <div className="menu playhome-menu">
            <button className="primary" disabled={busy} onClick={onConfirm}>
              {busy ? "Opening mic…" : "OK"}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
