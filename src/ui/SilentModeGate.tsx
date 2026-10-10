import { loadReduceMotion } from "../game/settings.ts";
import { BatteryFullIcon, BellRingingIcon, SpeakerHighIcon } from "./icons.tsx";

const STEPS = [
  {
    Icon: BellRingingIcon,
    title: "Switch to loud mode",
    body: "Flip your phone's silent switch off. The game doesn't work in silent mode.",
  },
  {
    Icon: SpeakerHighIcon,
    title: "Turn up your volume",
    body: "You need to hear the example before you say it.",
  },
  {
    Icon: BatteryFullIcon,
    title: "Turn off power saving",
    body: "Low power mode lowers the frame rate, so the game looks slow.",
  },
];

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
          <h1>Before you start</h1>
          <ol className={`silent-gate-steps${loadReduceMotion() ? " silent-gate-steps--still" : ""}`}>
            {STEPS.map(({ Icon, title, body }) => (
              <li key={title} className="silent-gate-step">
                <span className="silent-gate-icon">
                  <Icon />
                </span>
                <span className="silent-gate-text">
                  <strong>{title}</strong>
                  <span>{body}</span>
                </span>
              </li>
            ))}
          </ol>
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
