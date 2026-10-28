import type { ReactNode } from "react";
import {
  MIN_SCORED_GATES_FOR_TAKEAWAY,
  takeaway,
  type ToneBreakdownEntry,
} from "../game/scoring.ts";
import { ToneMarkIcon, TONE_SHORT_LABEL } from "./toneIcons.tsx";

/**
 * Parts of the game-over screen shared by the real `GameOver` and the
 * landing page's Try it now end screen (`landing/DemoGameOver.tsx`), so the
 * two show one run the same way. Pure: no storage, no server, no tracking.
 */

type Weakest = ToneBreakdownEntry & { pct: number };

/**
 * The weak tone the coach card is about — the same entry `takeaway()` names,
 * picked by the same eligibility rule, so the card's headline and its body
 * can never disagree. `null` means no tone had enough scored gates to judge,
 * and the card doesn't render at all.
 */
export function weakestTone(breakdown: ToneBreakdownEntry[]): Weakest | null {
  const eligible = breakdown.filter(
    (b): b is Weakest => b.pct !== null && b.gates >= MIN_SCORED_GATES_FOR_TAKEAWAY,
  );
  if (eligible.length === 0) return null;
  return eligible.reduce((min, b) => (b.pct < min.pct ? b : min));
}

/** The score card, with the bird breaking out of its corner. */
export function GameOverHeader({
  eyebrow,
  score,
  children,
  actions,
}: {
  eyebrow: string;
  score: number;
  /** Extra lines under the score (best, XP, challenge). */
  children?: ReactNode;
  /** Right of the score (share, play again on desktop). */
  actions?: ReactNode;
}) {
  return (
    <header className="go-header">
      <img className="go-bird" src="/Bird-up-no-halo.png" alt="" aria-hidden="true" />
      <div className="go-header-score">
        <p className="go-eyebrow">{eyebrow}</p>
        <p className="go-score-line">
          <span className="go-score">{score.toLocaleString()}</span>
          <span className="go-score-unit">score</span>
        </p>
        {children}
      </div>
      {actions}
    </header>
  );
}

/** The coach card: this run's weakest tone, in words. */
export function CoachCard({
  weakest,
  breakdown,
  children,
}: {
  weakest: Weakest;
  breakdown: ToneBreakdownEntry[];
  /** Actions under the advice (visualiser, fine-tune). */
  children?: ReactNode;
}) {
  return (
    <section className="go-card go-coach">
      <div className="go-coach-head">
        <span className="go-coach-mark">
          <ToneMarkIcon tone={weakest.tone} className="go-coach-icon" />
        </span>
        <span className="go-coach-eyebrow">Coach</span>
      </div>
      <h3 className="go-coach-title">
        Weak spot: Tone {weakest.tone} ({TONE_SHORT_LABEL[weakest.tone]})
      </h3>
      <p className="go-coach-body">{takeaway(breakdown)}</p>
      {children}
    </section>
  );
}
