import { SITE_HREF } from "./appLink.ts";
import { brand } from "../brand.ts";

/** "drill", "learn" and "pairs" are only ever started from ModeSelect, never
 * from a button here — kept in this union anyway since GameApp's
 * startPlay/lastModeRef treat all six uniformly. */
export type PlayIntent = "game" | "tutorial" | "lab" | "drill" | "learn" | "pairs";

interface Props {
  calibrated: boolean;
  tutorialDone: boolean;
  /** An error raised elsewhere (e.g. a failed Retry, or a failed mic grant on the silent-mode gate). */
  error: string | null;
  /**
   * Routes the intent onward — GameApp's `startPlay` decides whether it needs
   * calibration or the silent-mode confirm gate before the mic ever opens.
   * No mic call happens here any more: opening the mic on this very tap used
   * to duck the phone's output volume for the rest of the session (iOS
   * switches audio-session category the instant `getUserMedia` grants), so
   * the mic now only opens from the silent-mode gate's own "OK" tap — see
   * GameApp's `requestMicAndThen`.
   */
  onStart: (intent: PlayIntent) => void;
  /** Opens the Modes picker. No mic needed — only starting a run there does. */
  onModes: () => void;
  /** Dev builds only: opens the magic-link login. Needs no mic, so it does not
   * go through `onStart`'s gesture path. */
  onDevLogin: () => void;
  /** Matches the size Game/Calibration will actually open at — see GameApp's computeCanvasSize. */
  canvasWidth: number;
  canvasHeight: number;
  /** Non-null when this session arrived via a `?c=<score>` share link — see docs/flappytone-SPEC-share.md. */
  challengeScore: number | null;
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
  onModes,
  onDevLogin,
  canvasWidth,
  canvasHeight,
  challengeScore,
}: Props) {
  const error = externalError;

  return (
    <div className="stage game-stage playhome-stage">
      <div
        className="playhome-canvas"
        style={{ width: canvasWidth, height: canvasHeight }}
      >
        {/* Mobile only (CSS): the game nav has no brand link on the bottom
            bar, so this is the way back out to the marketing site. */}
        <a className="playhome-home-link" href={SITE_HREF} aria-label="Back to FlappyTone.com">
          <img src="/favicon.svg" alt="" width={40} height={40} />
        </a>
        <div className="screen playhome-overlay">
          <img
            src="/Bird-hor-no-halo.png"
            alt="Flappytone mascot"
            className="playhome-mascot"
          />
          {challengeScore != null && (
            <p className="prompt challenge-score">
              <strong>Someone scored {challengeScore.toLocaleString()}.</strong>
              <br />
              Practice your Mandarin tones and try to beat them!
            </p>
          )}
          <h1>{brand.name}</h1>
          {tutorialDone && <p className="prompt">Nice, ready to play?</p>}
          {!calibrated && (
            <p className="note">
              First run starts with a short calibration: talk normally, then a
              few practice gates to find your range.
            </p>
          )}
          <div className="menu playhome-menu">
            <button className="primary" onClick={() => onStart("game")}>
              Play
            </button>
            <button onClick={onModes}>
              Modes
              <span className="badge badge-new">New</span>
            </button>
            <button onClick={() => onStart("tutorial")}>Tutorial</button>
          </div>
          {error && <p className="error">{error}</p>}

          {/* Dev builds only. The Lab is a separate instance of the game for
              tuning, and it is not part of the product. */}
          {import.meta.env.DEV && (
            <>
              <button className="dev-toggle" onClick={() => onStart("lab")}>
                lab
              </button>
              <button className="dev-toggle" onClick={onDevLogin}>
                login
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
