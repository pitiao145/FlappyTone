import { JumpingPip } from "./bird";

/**
 * The success screen shown once a tutorial run finishes, in place of dropping
 * the player straight back to the Play home. Pip hops with excitement (see
 * `JumpingPip`) under a short "you're all set" line and a button onward.
 *
 * Two variants, same layout: the standalone tutorial ends on "Good job", the
 * tutorial that follows first-run calibration ends on "Your grid is ready" —
 * the grid was just measured from the tones flown, so the copy points at that.
 *
 * Rendered inside the same `.game-stage` frame as PlayHome (not a plain
 * centered `.screen`) so the frame keeps its full-viewport width across the
 * hand-off to Play — a narrower menu-style screen here made `.frame` snap wide
 * on the button tap, which read as a flash.
 */
type Variant = "tutorial" | "calibration";

const COPY: Record<Variant, { title: string; body: string; button: string }> = {
  tutorial: {
    title: "Good job!",
    body: "You've got the hang of it. You're all set to start playing for real.",
    button: "Let's play",
  },
  calibration: {
    title: "Your grid is ready",
    body: "We've tuned the board to your voice. Let's try it out.",
    button: "Let's try it out",
  },
};

interface Props {
  variant: Variant;
  /** Advance to the Play home — the player's first real run starts from there. */
  onDone: () => void;
  /** Matches the size Play/Game open at, so the frame doesn't resize on hand-off. */
  canvasWidth: number;
  canvasHeight: number;
}

export function TutorialDone({ variant, onDone, canvasWidth, canvasHeight }: Props) {
  const copy = COPY[variant];
  return (
    <div className="stage game-stage playhome-stage">
      <div
        className="playhome-canvas"
        style={{ width: canvasWidth, height: canvasHeight }}
      >
        <div className="screen playhome-overlay tutorial-done-overlay">
          <JumpingPip className="tutorial-done-pip" />
          <h1>{copy.title}</h1>
          <p className="note">{copy.body}</p>
          <div className="menu playhome-menu">
            <button className="primary" onClick={onDone}>
              {copy.button}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
