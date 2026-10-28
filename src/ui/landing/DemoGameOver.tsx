import { useMemo } from "react";
import { brand } from "../../brand.ts";
import { toneBreakdown, type RunStats } from "../../game/scoring.ts";
import { CoachCard, GameOverHeader, weakestTone } from "../GameOverParts.tsx";
import { hasToneAccuracy, ToneAccuracyBreakdown } from "../ToneAccuracyBreakdown.tsx";

/**
 * Try it now's end screen: the real game over (`GameOver.tsx`), stripped to
 * what one guest run can show. Same parts and styles; no share, board,
 * recalibration, XP, personal best or feedback, and nothing here reads or
 * writes storage or the server.
 */
export function DemoGameOver({
  stats,
  onSignup,
  onRetry,
  onHarder,
}: {
  stats: RunStats;
  onSignup: () => void;
  onRetry: () => void;
  /** The "Too easy?" pairs round. Unset hides it (after a pairs round). */
  onHarder?: () => void;
}) {
  const breakdown = toneBreakdown(stats);
  const weakest = useMemo(() => weakestTone(breakdown), [breakdown]);

  return (
    <div className="screen gameover-screen go-demo">
      <GameOverHeader eyebrow="Run over" score={stats.score} />

      {/* The one thing to do next: right under the score, in its own colour. */}
      <section className="go-card go-demo-pitch">
        <h3 className="go-demo-pitch-title">{brand.demoGameOver.pitchTitle}</h3>
        <p className="go-demo-pitch-body">
          {weakest
            ? brand.demoGameOver.pitchBody(weakest.tone, Math.round(weakest.pct))
            : brand.demoGameOver.pitchBodyAny}
        </p>
        <button type="button" className="go-btn-primary go-demo-pitch-btn" onClick={onSignup}>
          {brand.demoGameOver.signup}
        </button>
        <p className="go-demo-pitch-more">{brand.demoGameOver.pitchMore}</p>
      </section>

      {hasToneAccuracy(stats) && (
        <section className="go-card go-tones">
          <ToneAccuracyBreakdown stats={stats} weakTone={weakest?.tone ?? null} tileClassName="go-tone-tile" />
        </section>
      )}

      {weakest && <CoachCard weakest={weakest} breakdown={breakdown} />}

      <div className="go-demo-actions">
        {onHarder && (
          <button type="button" className="go-btn-ghost" onClick={onHarder}>
            {brand.demoGameOver.harder}
          </button>
        )}
        <button type="button" className="go-subtle-link" onClick={onRetry}>
          {brand.demoGameOver.retry}
        </button>
      </div>
    </div>
  );
}
