import { JumpingPip } from "./bird";

/**
 * The success screen shown once a tutorial run finishes, in place of dropping
 * the player straight back to the Play home. Pip hops with excitement (see
 * `JumpingPip`) under a short "you're all set" line and a button onward.
 *
 * Three variants, same layout: the standalone tutorial (and the guided
 * teaching tutorial reached from calibration) ends on "Good job" and its
 * "Let's play" goes straight into a real classic-mode run; the tutorial that
 * follows first-run calibration ends on "Your grid is ready" and offers two
 * ways on — straight into that same real run (`onDone`), or the guided
 * teaching tutorial first (`onSecondary`); `calibrationVisualiser` is the
 * same "grid is ready" moment but reached via `?intent=visualiser` (or a
 * manual Visualiser tap) with no prior calibration — the teaching tutorial is
 * specific to the scored game, not the visualiser, so this variant has no
 * secondary button and leads straight back to what the player actually asked
 * for.
 *
 * Rendered inside the same `.game-stage` frame as PlayHome (not a plain
 * centered `.screen`) so the frame keeps its full-viewport width across the
 * hand-off to Play — a narrower menu-style screen here made `.frame` snap wide
 * on the button tap, which read as a flash.
 *
 * `calibrationChallenge` is a fourth, same-shaped variant: a cold `?c=<score>`
 * arrival (see docs/flappytone-SPEC-share.md) routed through calibration the
 * same way "visualiser" does, but still headed into a real run rather than
 * the visualiser — so it reuses "calibration"'s copy/routing untouched
 * (`COPY[variant]` has no entry for it; `challengeCopy` below covers it) and
 * gets challenge-aware copy the same way an ordinary `?c=` return-from-
 * calibration run does (see the `challengeScore` override below).
 */
type Variant = "tutorial" | "calibration" | "calibrationVisualiser" | "calibrationChallenge";

const COPY: Record<
  Variant,
  { title: string; body: string; button: string; secondaryButton?: string }
> = {
  tutorial: {
    title: "Good job!",
    body: "You've got the hang of it. You're all set to start playing for real.",
    button: "Let's play",
  },
  calibration: {
    title: "Your grid is ready",
    body: "We've tuned the board to your voice. Let's try it out.",
    button: "Let's try it out",
    secondaryButton: "Tutorial first",
  },
  calibrationVisualiser: {
    title: "Your grid is ready",
    body: "We've tuned the board to your voice. On to the visualiser.",
    button: "Go to the visualiser",
  },
  // Only reached with a challenge score set (GameApp only picks this variant
  // when one is active), so `challengeCopy` below always overrides this —
  // this entry exists purely to satisfy Record<Variant, ...>.
  calibrationChallenge: {
    title: "Your grid is ready",
    body: "We've tuned the board to your voice. Let's try it out.",
    button: "Let's try it out",
    secondaryButton: "Tutorial first",
  },
};

interface Props {
  variant: Variant;
  /** Advance onward — a real classic-mode run for "tutorial"/"calibration", the visualiser for "calibrationVisualiser". */
  onDone: () => void;
  /** "calibration" only: take the guided teaching tutorial first instead. */
  onSecondary?: () => void;
  /** Matches the size Play/Game open at, so the frame doesn't resize on hand-off. */
  canvasWidth: number;
  canvasHeight: number;
  /**
   * Non-null when this session is chasing a `?c=<score>` share-link target
   * — see docs/flappytone-SPEC-share.md "Part 3". Overrides copy on the
   * two variants that lead into a real run ("tutorial" and
   * "calibration"/"calibrationChallenge"); "calibrationVisualiser" is
   * untouched, since that path never carries a challenge score.
   */
  challengeScore?: number | null;
}

export function TutorialDone({
  variant,
  onDone,
  onSecondary,
  canvasWidth,
  canvasHeight,
  challengeScore,
}: Props) {
  const base = COPY[variant];
  const copy =
    challengeScore == null
      ? base
      : variant === "tutorial"
        ? {
            ...base,
            body: `You've got the hang of it — time to beat ${challengeScore.toLocaleString()}.`,
            button: "Beat the score",
          }
        : variant === "calibration" || variant === "calibrationChallenge"
          ? {
              ...base,
              body: `You're tuned up. Now go beat that ${challengeScore.toLocaleString()}.`,
              button: "Beat the score",
            }
          : base;
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
            {copy.secondaryButton && onSecondary && (
              <button className="secondary" onClick={onSecondary}>
                {copy.secondaryButton}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
